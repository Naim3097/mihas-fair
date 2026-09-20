// The shadows: sparring partners that notice, chase, swing, stagger, fall and come back. One small state machine
// over the enemy definitions in content/enemies.ts; the training posts are the same thing without legs.
import { MOVEMENT, type EnemyDef } from '../../../content';
import { hurt } from './combat';
import { loop, newFighter, newStatus, oneShot, speedMult, tickStatus, type Fighter } from './entities';
import { moveBody } from './physics';
import type { Sim } from './sim';
import { angleDiff, approach, copy, lenXZ, sub, turnToward, v3, yawOf, type V3 } from './v3';

export interface Enemy extends Fighter {
  def: EnemyDef;
  home: V3;
  state: 'idle' | 'chase' | 'attack';
  t: number;
  cooldown: number;
  wander: V3 | null;
  wanderIn: number;
  alert: boolean;
  hitDone: boolean;
}

const RESPAWN = 8, DEG = Math.PI / 180;

export function newEnemy(def: EnemyDef, pos: V3, yaw: number): Enemy {
  const post = def.model === 'dummy';
  const f = newFighter('enemy', def.model, pos, post ? 0.45 : MOVEMENT.radius, post ? 1.9 : MOVEMENT.height, def.health);
  return { ...f, yaw, def, home: v3(pos.x, pos.y, pos.z), state: 'idle', t: 0, cooldown: 1, wander: null, wanderIn: 1, alert: false, hitDone: false };
}

export function stepEnemy(sim: Sim, e: Enemy, dt: number): void {
  const M = MOVEMENT, b = e.body, d = e.def;
  tickStatus(e, dt);
  if (e.dead) {
    e.deadFor += dt;
    b.vel.x = approach(b.vel.x, 0, 10 * dt); b.vel.z = approach(b.vel.z, 0, 10 * dt);
    if (!b.grounded) b.vel.y -= M.gravity * dt;
    moveBody(sim.world, b, dt, { step: M.stepHeight, snap: true });
    if (e.deadFor > RESPAWN) respawn(sim, e);
    return;
  }
  if (d.training) {
    b.vel.x = b.vel.z = 0;
    if (!b.grounded) { b.vel.y -= M.gravity * dt; moveBody(sim.world, b, dt, { step: 0, snap: true }); }
    if (e.status.sinceHurt > 3 && e.health < e.maxHealth) e.health = Math.min(e.maxHealth, e.health + e.maxHealth * 0.3 * dt);
    if (e.status.stagger <= 0) loop(e, 'idle');
    return;
  }

  const p = sim.player, to = sub(p.body.pos, b.pos), dist = lenXZ(to);
  e.cooldown = Math.max(0, e.cooldown - dt);
  if (dist <= d.aggro || e.status.sinceHurt < 6) e.alert = true; else if (dist > d.aggro * 2.2) e.alert = false;
  const aware = e.alert && !p.dead, staggered = e.status.stagger > 0;
  let wantX = 0, wantZ = 0, faceYaw: number | null = null;
  if (staggered) { e.state = 'idle'; e.t = 0; }
  else if (e.state === 'attack') {
    e.t += dt;
    if (!e.hitDone && e.t >= d.windup) {
      e.hitDone = true;
      const inFront = Math.abs(angleDiff(e.yaw, yawOf(to))) < 75 * DEG;
      if (dist <= d.reach * 1.3 && inFront) hurt(sim, p, d.damage, { from: b.pos, knockback: 3.5, stagger: 0.3, attacker: e });
    }
    if (e.t >= d.windup + d.recovery) { e.state = 'chase'; e.cooldown = d.cooldown; }
  } else if (aware) {
    e.state = 'chase';
    faceYaw = yawOf(to);
    if (dist <= d.reach && e.cooldown <= 0 && b.grounded) {
      e.state = 'attack'; e.t = 0; e.hitDone = false; e.yaw = faceYaw;
      oneShot(e, sim.rng() < 0.5 ? 'attack-1' : 'attack-2', d.windup + d.recovery);
      sim.events.push({ kind: 'swing', pos: b.pos, yaw: e.yaw, range: d.reach, angle: 90, power: 0.4, delay: d.windup, team: 'enemy' });
    } else if (dist > d.reach * 0.8) {
      const sp = d.speed * speedMult(e);
      wantX = (to.x / dist) * sp; wantZ = (to.z / dist) * sp;
    }
  } else {
    e.state = 'idle';
    e.wanderIn -= dt;
    if (e.wanderIn <= 0) {
      e.wanderIn = 3 + sim.rng() * 4;
      e.wander = sim.rng() < 0.6 ? v3(e.home.x + (sim.rng() - 0.5) * 8, e.home.y, e.home.z + (sim.rng() - 0.5) * 8) : null;
    }
    if (e.wander) {
      const w = sub(e.wander, b.pos), wd = lenXZ(w);
      if (wd < 0.5) e.wander = null;
      else { const sp = M.walk * 0.9; wantX = (w.x / wd) * sp; wantZ = (w.z / wd) * sp; faceYaw = yawOf(w); }
    }
  }
  // shadows keep out of each other's way
  for (const o of sim.enemies) {
    if (o === e || o.dead) continue;
    const s = sub(b.pos, o.body.pos), sd = lenXZ(s), min = b.radius + o.body.radius + 0.3;
    if (sd < min && sd > 1e-3) { wantX += (s.x / sd) * (min - sd) * 6; wantZ += (s.z / sd) * (min - sd) * 6; }
  }
  const rate = staggered ? 10 : b.grounded ? 18 : 4;
  b.vel.x = approach(b.vel.x, wantX, rate * dt); b.vel.z = approach(b.vel.z, wantZ, rate * dt);
  if (faceYaw !== null && !staggered) e.yaw = turnToward(e.yaw, faceYaw, 540 * DEG * dt);
  if (!b.grounded) { b.vel.y -= M.gravity * (b.vel.y < 0 ? M.fallMult : 1) * dt; if (b.vel.y < -M.terminal) b.vel.y = -M.terminal; }
  const was = b.grounded;
  moveBody(sim.world, b, dt, { step: M.stepHeight, snap: b.vel.y <= 0 });
  if (!was && b.grounded) sim.events.push({ kind: 'land', pos: b.pos, power: 0.3, team: 'enemy' });

  if (e.state === 'attack' || staggered || !b.grounded) return;
  const sp = lenXZ(b.vel);
  if (sp < 0.3) loop(e, 'idle'); else if (sp < 2.6) loop(e, 'walk', sp / M.walk); else loop(e, 'run', sp / M.run);
}

function respawn(sim: Sim, e: Enemy): void {
  e.dead = false; e.deadFor = 0; e.health = e.maxHealth; e.status = newStatus(); e.hitFlash = 0;
  copy(e.body.pos, e.home); e.body.vel = v3(); e.body.grounded = false;
  e.state = 'idle'; e.alert = false; e.cooldown = 1.5; e.wander = null;
  loop(e, 'idle');
  sim.events.push({ kind: 'respawn', pos: e.home, team: 'enemy' });
}
