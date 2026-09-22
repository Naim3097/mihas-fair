// The player's body: how input becomes motion and how motion becomes strikes, dodges, jumps and skills. This is
// the character controller, a state machine over the numbers in content/movement.ts, with every human and
// superhuman move in one place so the feel is tuned from one file. Pure: it runs under node:test.
import { CHAIN_RESET, MOVEMENT, SKILL_SLOTS, STRIKES, skillsFor, vitals, type ClassKey, type MovementDef, type SkillDef, type SkillSlot, type Stats, type StrikeDef, type Vitals } from '../../../content';
import { hurt, targetsIn } from './combat';
import { buffMult, loop, newFighter, oneShot, speedMult, tickStatus, type Fighter } from './entities';
import { lineClear, moveBody, raycast } from './physics';
import { castSkill, skillSeconds } from './skills';
import type { Sim } from './sim';
import { angleDiff, approach, distXZ, fromYaw, lenXZ, norm, sub, turnToward, v3, yawOf, type V3 } from './v3';

/** What the player wants this step. Edges (jump, dodge, attack, …) are true for one step only. */
export interface Intent {
  /** Camera-relative: x to the right, y forward, length ≤ 1. */
  move: { x: number; y: number };
  walk: boolean;
  sprint: boolean;
  jump: boolean;
  dodge: boolean;
  attack: boolean;
  slam: boolean;
  lock: boolean;
  skills: Record<SkillSlot, boolean>;
  /** The jump button held: thrust for a tuning that carries a thrust block, nothing for the others. */
  thrust?: boolean;
}
export const emptyIntent = (): Intent => ({ move: { x: 0, y: 0 }, walk: false, sprint: false, jump: false, dodge: false, attack: false, slam: false, lock: false, skills: { q: false, w: false, e: false, r: false }, thrust: false });
/** The same intent with its edges cleared, for the second and later sub-steps of one frame. */
export const heldOnly = (it: Intent): Intent => ({ ...it, jump: false, dodge: false, attack: false, slam: false, lock: false, skills: { q: false, w: false, e: false, r: false } });

export interface Dash { t: number; dur: number; dir: V3; speed: number; flat: boolean; through: boolean; turn: boolean }
export type Action =
  | { kind: 'strike'; strike: StrikeDef; index: number; t: number; hit: boolean }
  | { kind: 'skill'; skill: SkillDef; t: number; fired: boolean };

export interface Player extends Fighter {
  cls: ClassKey;
  vit: Vitals;
  skills: SkillDef[];
  stamina: number; staminaDelay: number; spirit: number; ilham: number;
  gait: 'idle' | 'walk' | 'run' | 'sprint'; sprintFor: number;
  airJumps: number; coyote: number; jumpBuffer: number; dodgeCd: number; slamming: boolean;
  /** The highest the feet have been since leaving the ground, for landings. */
  peak: number;
  dodge: Dash | null;
  airDash: Dash | null;
  leap: { land: { amount: number; radius: number; knockback?: number; up?: number; stagger?: number } | null; key: string } | null;
  action: Action | null;
  chain: number; chainAt: number; queued: boolean;
  cooldowns: Record<SkillSlot, number>;
  lock: number | null;
  kills: number;
  /** A jetpack's tank, and whether it fired this step: 0 and false for a body without one. */
  fuel: number; thrusting: boolean;
}

export function newPlayer(cls: ClassKey, stats: Stats, pos: V3, yaw: number, M: MovementDef = MOVEMENT): Player {
  const vit = vitals(stats);
  const f = newFighter('player', cls, pos, M.radius, M.height, vit.health);
  return {
    ...f, yaw, cls, vit, skills: skillsFor(cls),
    stamina: vit.stamina, staminaDelay: 0, spirit: vit.spirit, ilham: 0,
    gait: 'idle', sprintFor: 0, airJumps: M.airJumps, coyote: 0, jumpBuffer: 0, dodgeCd: 0, slamming: false, peak: pos.y,
    dodge: null, airDash: null, leap: null, action: null, chain: 0, chainAt: -9, queued: false,
    cooldowns: { q: 0, w: 0, e: 0, r: 0 }, lock: null, kills: 0, fuel: M.thrust?.fuel ?? 0, thrusting: false,
  };
}

const DEG = Math.PI / 180;
const strikeTotal = (s: StrikeDef) => s.windup + s.active + s.recovery;

export function stepPlayer(sim: Sim, p: Player, it: Intent, dt: number): void {
  const M = sim.movement, b = p.body;
  tickStatus(p, dt);
  for (const s of SKILL_SLOTS) p.cooldowns[s] = Math.max(0, p.cooldowns[s] - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  if (p.dead) {
    p.deadFor += dt;
    b.vel.x = approach(b.vel.x, 0, 20 * dt); b.vel.z = approach(b.vel.z, 0, 20 * dt);
    if (!b.grounded) b.vel.y -= M.gravity * dt;
    moveBody(sim.world, b, dt, { step: M.stepHeight, snap: true });
    return;
  }

  // resources
  p.staminaDelay = Math.max(0, p.staminaDelay - dt);
  if (p.staminaDelay === 0) p.stamina = Math.min(p.vit.stamina, p.stamina + M.stamina.regen * dt);
  const regen = buffMult(p, 'regen');
  p.spirit = Math.min(p.vit.spirit, p.spirit + p.vit.spiritRegen * regen * dt);
  if (regen > 1) p.health = Math.min(p.maxHealth, p.health + 3 * (regen - 1) * dt);

  const staggered = p.status.stagger > 0;
  if (staggered) { p.action = null; p.queued = false; p.dodge = null; p.airDash = null; }

  // lock-on
  if (it.lock) toggleLock(sim, p);
  const target = p.lock === null ? null : (sim.enemies.find((e) => e.id === p.lock && !e.dead) ?? null);
  if (p.lock !== null && (!target || distXZ(target.body.pos, b.pos) > p.vit.lockRange * 1.5)) p.lock = null;

  // camera-relative input
  const fwd = fromYaw(sim.camYaw), right = fromYaw(sim.camYaw - Math.PI / 2);
  const mv = v3(fwd.x * it.move.y + right.x * it.move.x, 0, fwd.z * it.move.y + right.z * it.move.x);
  const mag = Math.min(1, lenXZ(mv)), mdir = mag > 0.02 ? norm(mv) : null;
  const faceYaw = () => (target ? yawOf(sub(target.body.pos, b.pos)) : mdir ? yawOf(mdir) : p.yaw);

  // ----- strikes and skills -----
  const busy = p.action !== null && !(p.action.kind === 'skill' && p.action.skill.mobile);
  // a skill may cancel the recovery of a strike or of a skill that has already fired
  const canCancel = !p.action || (p.action.kind === 'strike' ? p.action.t >= p.action.strike.windup + p.action.strike.active : p.action.fired);
  const free = !staggered && !p.dodge && !p.airDash && !p.slamming;
  if (free && it.attack) {
    if (!p.action) startStrike(sim, p, faceYaw());
    else if (p.action.kind === 'strike' && p.action.t >= p.action.strike.windup) p.queued = true;
  }
  if (free && canCancel) for (const slot of SKILL_SLOTS) if (it.skills[slot] && tryCast(sim, p, slot, faceYaw())) break;
  if (p.action) advanceAction(sim, p, dt, faceYaw);

  // ----- dodge on the ground, dash in the air -----
  if (!staggered && it.dodge && p.dodgeCd <= 0 && !p.dodge && !p.airDash && !p.slamming) {
    const dir = mdir ?? fromYaw(p.yaw);
    if (b.grounded && p.stamina >= M.dodge.stamina) {
      p.dodge = { t: 0, dur: M.dodge.duration, dir, speed: M.dodge.distance / M.dodge.duration, flat: false, through: false, turn: true };
      p.status.invuln = Math.max(p.status.invuln, M.dodge.iframes);
      p.stamina -= M.dodge.stamina; p.staminaDelay = M.stamina.regenDelay; p.dodgeCd = M.dodge.duration + M.dodge.cooldown;
      p.action = null; p.queued = false;
      oneShot(p, 'dodge', M.dodge.duration + 0.15);
      sim.events.push({ kind: 'dodge', pos: b.pos, yaw: yawOf(dir) });
    } else if (!b.grounded && p.stamina >= M.airDash.stamina) {
      p.airDash = { t: 0, dur: M.airDash.duration, dir, speed: M.airDash.speed, flat: true, through: false, turn: true };
      p.stamina -= M.airDash.stamina; p.staminaDelay = M.stamina.regenDelay; p.dodgeCd = M.airDash.duration + 0.2;
      p.action = null; p.queued = false; p.slamming = false;
      oneShot(p, 'dodge', M.airDash.duration + 0.25);
      sim.events.push({ kind: 'dash', pos: b.pos, yaw: yawOf(dir) });
    }
  }

  // ----- locomotion -----
  const dash = p.dodge ?? p.airDash;
  let speed = 0;
  if (dash) {
    dash.t += dt;
    b.vel.x = dash.dir.x * dash.speed; b.vel.z = dash.dir.z * dash.speed;
    if (dash.flat) b.vel.y = 0;
    if (dash.turn) p.yaw = yawOf(dash.dir);
    p.gait = 'idle';
    if (dash.t >= dash.dur) { if (p.dodge === dash) p.dodge = null; else p.airDash = null; b.vel.x *= 0.35; b.vel.z *= 0.35; }
  } else if (!staggered && !busy) {
    const wantSprint = it.sprint && mag > 0.3 && p.stamina > 0 && b.grounded;
    const wantWalk = it.walk || (mag > 0 && mag < 0.45);
    p.gait = mag < 0.02 ? 'idle' : wantSprint ? 'sprint' : wantWalk ? 'walk' : 'run';
    if (p.gait === 'sprint') { p.sprintFor += dt; p.stamina = Math.max(0, p.stamina - M.stamina.sprintDrain * dt); p.staminaDelay = Math.max(p.staminaDelay, 0.3); }
    else p.sprintFor = Math.max(0, p.sprintFor - dt * 3);
    const top = p.gait === 'sprint' ? M.sprint + (M.sprintMax - M.sprint) * Math.min(1, p.sprintFor / M.sprintRamp) : p.gait === 'walk' ? M.walk : p.gait === 'run' ? M.run : 0;
    speed = top * speedMult(p);
    const wx = mdir ? mdir.x * speed : 0, wz = mdir ? mdir.z * speed : 0;
    if (b.grounded) { const rate = speed > 0 ? M.accel : M.decel; b.vel.x = approach(b.vel.x, wx, rate * dt); b.vel.z = approach(b.vel.z, wz, rate * dt); }
    else if (mdir && !p.leap) {
      // in the air the stick steers but never brakes: the momentum of a run, a leap or a wall kick is kept
      const before = lenXZ(b.vel);
      b.vel.x += mdir.x * M.airControl * dt; b.vel.z += mdir.z * M.airControl * dt;
      const after = lenXZ(b.vel), cap = Math.max(before, (M.thrust ? M.thrust.airSpeed : M.run) * speedMult(p)); // a jetpack flies at its own air speed
      if (after > cap) { b.vel.x *= cap / after; b.vel.z *= cap / after; }
    }
    if (mdir || (target && mag < 0.02)) p.yaw = turnToward(p.yaw, faceYaw(), M.turn * DEG * dt);
  } else {
    p.gait = 'idle';
    if (b.grounded && p.action?.kind !== 'strike') { b.vel.x = approach(b.vel.x, 0, M.decel * dt); b.vel.z = approach(b.vel.z, 0, M.decel * dt); }
  }

  // ----- jumps: from the ground, off a wall, or once more in the air -----
  if (it.jump) p.jumpBuffer = M.buffer; else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (b.grounded) { p.coyote = M.coyote; p.airJumps = M.airJumps; } else p.coyote = Math.max(0, p.coyote - dt);
  const jumpMult = buffMult(p, 'jump');
  let jumped = false;
  if (p.jumpBuffer > 0 && !staggered && !dash && !busy && p.stamina >= M.stamina.jump) {
    if (b.grounded || p.coyote > 0) {
      b.vel.y = M.jump * jumpMult; b.grounded = false;
      sim.events.push({ kind: 'jump', pos: b.pos, power: 1 });
      jumped = true;
    } else if (b.wall) {
      b.vel.x = b.wall.x * M.wallJump.out; b.vel.z = b.wall.z * M.wallJump.out; b.vel.y = M.wallJump.up * jumpMult;
      p.yaw = yawOf(b.wall); p.airJumps = M.airJumps;
      sim.events.push({ kind: 'walljump', pos: b.pos, yaw: p.yaw });
      jumped = true;
    } else if (p.airJumps > 0) {
      b.vel.y = M.airJump * jumpMult; p.airJumps--;
      if (mdir) { const s = Math.max(M.run, lenXZ(b.vel)); b.vel.x = mdir.x * s; b.vel.z = mdir.z * s; p.yaw = yawOf(mdir); }
      sim.events.push({ kind: 'airjump', pos: b.pos });
      jumped = true;
    }
    if (jumped) {
      p.coyote = 0; p.jumpBuffer = 0; p.slamming = false; p.leap = null;
      p.stamina -= M.stamina.jump; p.staminaDelay = M.stamina.regenDelay;
      oneShot(p, 'jump', 0.9);
    }
  }
  // the slam: drop from the air like a stone and land as a blow
  if (it.slam && !b.grounded && !p.slamming && !dash && !staggered) {
    const above = raycast(sim.world, v3(b.pos.x, b.pos.y + 0.05, b.pos.z), v3(0, -1, 0), 60)?.t ?? 60;
    if (above > 1.2) {
      p.slamming = true; p.action = null; p.queued = false; p.leap = null;
      b.vel.x *= 0.15; b.vel.z *= 0.15;
      oneShot(p, 'slam', above / M.slam.speed + 0.5, 0.15);
      sim.events.push({ kind: 'dash', pos: b.pos, key: 'slam' });
    }
  }

  // ----- gravity and the world -----
  const T = M.thrust; p.thrusting = false;
  if (!b.grounded) {
    if (p.slamming) b.vel.y = -M.slam.speed;
    else if (T && it.thrust && p.fuel > 0 && !dash) {
      // a jetpack: thrust against gravity while the button is held and the tank is not dry; the climb is capped, a
      // body above the cap (fresh off a jump) comes down to it under gravity alone, and the fall multiplier is off
      p.thrusting = true; p.fuel = Math.max(0, p.fuel - T.drain * dt);
      b.vel.y = b.vel.y < T.climb ? Math.min(T.climb, b.vel.y + (T.accel - M.gravity) * dt) : b.vel.y - M.gravity * dt;
    }
    else if (!dash?.flat) { b.vel.y -= M.gravity * (b.vel.y < 0 ? M.fallMult : 1) * dt; if (b.vel.y < -M.terminal) b.vel.y = -M.terminal; }
    p.peak = Math.max(p.peak, b.pos.y);
  } else { p.peak = b.pos.y; if (T) p.fuel = Math.min(T.fuel, p.fuel + T.refill * dt); }
  const wasGrounded = b.grounded, fallSpeed = -b.vel.y;
  moveBody(sim.world, b, dt, { step: M.stepHeight, snap: b.vel.y <= 0 && !dash?.flat });
  separate(sim, p);
  if (!wasGrounded && b.grounded) landed(sim, p, fallSpeed);
  else if (wasGrounded && !b.grounded && !jumped && !dash) oneShot(p, 'jump', 0.7, 0.4);

  // ----- what the body shows -----
  if (p.action || dash || p.slamming || staggered || !b.grounded) return;
  const sp = lenXZ(b.vel);
  if (p.gait === 'idle' || sp < 0.25) loop(p, 'idle');
  else if (p.gait === 'walk') loop(p, 'walk', sp / M.walk);
  else if (p.gait === 'sprint') loop(p, 'sprint', sp / M.sprint);
  else loop(p, 'run', sp / M.run);
}

function landed(sim: Sim, p: Player, fallSpeed = 0): void {
  // a body that can thrust is judged by how hard it hit, not how high it was: a hover down is no fall
  const M = sim.movement, b = p.body, drop = M.thrust ? Math.min(p.peak - b.pos.y, (fallSpeed * fallSpeed) / (2 * M.gravity * M.fallMult)) : p.peak - b.pos.y;
  p.airJumps = M.airJumps;
  if (p.slamming) {
    p.slamming = false;
    for (const t of targetsIn(b.pos, p.yaw, { kind: 'circle', range: M.slam.radius }, sim.enemies)) hurt(sim, t, M.slam.amount * p.vit.strikeMult * buffMult(p, 'damage'), { from: b.pos, knockback: M.slam.knockback, up: M.slam.up, stagger: 0.7, canCrit: true, attacker: p });
    p.status.stagger = Math.max(p.status.stagger, 0.35);
    sim.events.push({ kind: 'slam', pos: b.pos, radius: M.slam.radius, power: 1 });
  } else if (p.leap) {
    const l = p.leap;
    p.leap = null;
    if (l.land) for (const t of targetsIn(b.pos, p.yaw, { kind: 'circle', range: l.land.radius }, sim.enemies)) hurt(sim, t, l.land.amount * p.vit.skillMult * buffMult(p, 'damage'), { from: b.pos, knockback: l.land.knockback, up: l.land.up, stagger: l.land.stagger, canCrit: true, attacker: p });
    sim.events.push({ kind: 'slam', pos: b.pos, radius: l.land?.radius ?? 1.5, power: 0.7, key: l.key });
  } else {
    const power = Math.min(1, drop / 8);
    sim.events.push({ kind: 'land', pos: b.pos, power });
    if (drop > 3.5) p.status.stagger = Math.max(p.status.stagger, 0.1 + power * 0.25);
  }
  p.peak = b.pos.y;
}

/** The player does not walk through shadows: a gentle push out of any it overlaps, unless it is dashing through them. */
function separate(sim: Sim, p: Player): void {
  if (p.dodge?.through) return;
  const b = p.body;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const d = sub(b.pos, e.body.pos), dist = lenXZ(d), min = b.radius + e.body.radius;
    if (dist < min && dist > 1e-4 && Math.abs(d.y) < 1.5) { const push = min - dist; b.pos.x += (d.x / dist) * push; b.pos.z += (d.z / dist) * push; }
  }
}

function startStrike(sim: Sim, p: Player, yaw: number): void {
  const idx = sim.time - p.chainAt < CHAIN_RESET ? p.chain % STRIKES.length : 0;
  const strike = STRIKES[idx]!;
  p.chain = idx + 1; p.queued = false; p.yaw = yaw;
  p.action = { kind: 'strike', strike, index: idx, t: 0, hit: false };
  oneShot(p, strike.anim, strikeTotal(strike));
  sim.events.push({ kind: 'swing', pos: p.body.pos, yaw, range: strike.shape.range, angle: strike.shape.angle, power: idx === STRIKES.length - 1 ? 1 : 0.5, delay: strike.windup, team: 'player' });
}

function tryCast(sim: Sim, p: Player, slot: SkillSlot, yaw: number): boolean {
  const s = p.skills.find((x) => x.slot === slot);
  if (!s || p.cooldowns[slot] > 0) return false;
  if (s.ultimate ? p.ilham < 100 : p.spirit < s.cost) { sim.events.push({ kind: 'cast', pos: p.body.pos, key: 'denied' }); return false; }
  if (s.ultimate) p.ilham = 0; else p.spirit -= s.cost;
  p.cooldowns[slot] = s.cooldown;
  p.yaw = yaw; p.queued = false;
  p.action = { kind: 'skill', skill: s, t: 0, fired: false };
  oneShot(p, s.anim, skillSeconds(s));
  sim.events.push({ kind: s.ultimate ? 'ultimate' : 'cast', pos: p.body.pos, key: s.key, yaw, delay: s.windup });
  return true;
}

function advanceAction(sim: Sim, p: Player, dt: number, faceYaw: () => number): void {
  const a = p.action!, b = p.body, M = sim.movement;
  a.t += dt;
  if (a.kind === 'strike') {
    const s = a.strike, endActive = s.windup + s.active, total = strikeTotal(s);
    if (a.t < endActive) { const v = s.step / endActive, d = fromYaw(p.yaw); if (b.grounded) { b.vel.x = d.x * v; b.vel.z = d.z * v; } }
    else if (b.grounded) { b.vel.x = approach(b.vel.x, 0, M.decel * dt); b.vel.z = approach(b.vel.z, 0, M.decel * dt); }
    if (!a.hit && a.t >= s.windup) {
      a.hit = true;
      const mult = p.vit.strikeMult * buffMult(p, 'damage');
      for (const t of targetsIn(b.pos, p.yaw, s.shape, sim.enemies)) hurt(sim, t, s.amount * mult, { from: b.pos, knockback: s.knockback, up: s.up, stagger: s.stagger, canCrit: true, attacker: p });
    }
    if (a.t >= total || (p.queued && a.t >= endActive + s.recovery * 0.55)) {
      p.action = null; p.chainAt = sim.time;
      if (p.queued) startStrike(sim, p, faceYaw());
    }
  } else {
    const s = a.skill;
    if (!a.fired && a.t >= s.windup) { a.fired = true; castSkill(sim, p, s); }
    if (a.t >= s.windup + s.recovery) p.action = null;
  }
}

function toggleLock(sim: Sim, p: Player): void {
  if (p.lock !== null) { p.lock = null; return; }
  const eye = v3(p.body.pos.x, p.body.pos.y + 1.5, p.body.pos.z);
  let best: number | null = null, score = Infinity;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const d = sub(e.body.pos, p.body.pos), dist = lenXZ(d);
    if (dist > p.vit.lockRange) continue;
    const s = dist + Math.abs(angleDiff(sim.camYaw, yawOf(d))) * 4;
    if (s < score && lineClear(sim.world, eye, v3(e.body.pos.x, e.body.pos.y + 1.2, e.body.pos.z))) { score = s; best = e.id; }
  }
  p.lock = best;
}
