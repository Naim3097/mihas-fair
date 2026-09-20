// What skills do when they fire: the effect kinds of the content package become damage queries, projectiles,
// dashes, leaps, buffs, shields, pulls and a slower world. Delayed and repeated effects are scheduled on the
// sim's clock; a telegraph on the floor announces the ones that land later.
import { MOVEMENT, type EffectDef, type ShapeDef, type SkillDef } from '../../../content';
import { heal, hurt, targetsIn } from './combat';
import type { Player } from './controller';
import { addBuff, buffMult, type Team } from './entities';
import type { Sim } from './sim';
import { fromYaw, lenXZ, scale, sub, v3, yawOf, type V3 } from './v3';

export interface Projectile {
  id: number; team: Team; key: string;
  pos: V3; vel: V3; speed: number; radius: number;
  amount: number; left: number; homing: number; pierce: boolean; knockback: number; mark: number; markFor: number;
  hit: Set<number>;
}
/** A patch of floor that is about to be hit. */
export interface Zone { pos: V3; radius: number; born: number; at: number; key: string }
export interface Pending { at: number; run: () => void }

const DEG = Math.PI / 180;
let nextProjectile = 1;

/** How long the character is visibly busy with a skill: its timing, or the dash or leap it starts, whichever is longer. */
export function skillSeconds(s: SkillDef): number {
  let t = s.windup + s.recovery;
  for (const e of s.effects) {
    if (e.kind === 'dash') t = Math.max(t, e.duration + 0.1);
    if (e.kind === 'leap') t = Math.max(t, leapFlight(e.height) + 0.2);
  }
  return t + 0.1;
}

/** Seconds in the air for a leap of this height under the game's asymmetric gravity. */
export function leapFlight(height: number): number {
  const g = MOVEMENT.gravity, vy = Math.sqrt(2 * g * height);
  return vy / g + Math.sqrt((2 * height) / (g * MOVEMENT.fallMult));
}

export function castSkill(sim: Sim, p: Player, skill: SkillDef): void {
  const mult = p.vit.skillMult * buffMult(p, 'damage');
  for (const e of skill.effects) runEffect(sim, p, skill, e, mult);
}

function runEffect(sim: Sim, p: Player, skill: SkillDef, e: EffectDef, mult: number): void {
  const key = skill.key, b = p.body;
  switch (e.kind) {
    case 'damage': {
      const reps = e.repeat ?? 1, every = e.every ?? 0, delay = e.delay ?? 0;
      const fixed = e.shape.at !== undefined || e.scatter !== undefined;
      for (let i = 0; i < reps; i++) {
        const at = sim.time + delay + i * every;
        let origin: V3 | null = null;
        if (fixed) {
          const fwd = fromYaw(p.yaw), ahead = e.shape.at ?? 0;
          origin = v3(b.pos.x + fwd.x * ahead, b.pos.y, b.pos.z + fwd.z * ahead);
          if (e.scatter) { const a = sim.rng() * Math.PI * 2, r = Math.sqrt(sim.rng()) * e.scatter; origin.x += Math.cos(a) * r; origin.z += Math.sin(a) * r; }
          if (at - sim.time > 0.15) {
            sim.zones.push({ pos: origin, radius: e.shape.range, born: sim.time, at, key });
            sim.events.push({ kind: 'telegraph', pos: origin, radius: e.shape.range, delay: at - sim.time, key });
          }
        }
        const shape: ShapeDef = fixed ? { kind: 'circle', range: e.shape.range } : e.shape;
        const fire = () => {
          const o = origin ?? v3(b.pos.x, b.pos.y, b.pos.z), yaw = origin ? 0 : p.yaw;
          for (const t of targetsIn(o, yaw, shape, sim.enemies)) hurt(sim, t, e.amount * mult, { from: o, knockback: e.knockback, up: e.up, stagger: e.stagger, slow: e.slow, slowFor: e.slowFor, canCrit: true, attacker: p });
          sim.events.push({ kind: 'zone', pos: o, yaw, shape: shape.kind, radius: shape.range, range: shape.range, angle: shape.angle, width: shape.width, key, power: e.amount / 30 });
        };
        if (at <= sim.time) fire(); else sim.pending.push({ at, run: fire });
      }
      break;
    }
    case 'projectile': {
      const n = e.count ?? 1, spread = (e.spread ?? 0) * DEG;
      const target = p.lock === null ? null : sim.enemies.find((x) => x.id === p.lock && !x.dead);
      const base = target ? yawOf(sub(target.body.pos, b.pos)) : p.yaw;
      for (let i = 0; i < n; i++) {
        const yaw = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), dir = fromYaw(yaw);
        sim.projectiles.push({
          id: nextProjectile++, team: 'player', key,
          pos: v3(b.pos.x + dir.x * 0.6, b.pos.y + 1.3, b.pos.z + dir.z * 0.6), vel: scale(dir, e.speed), speed: e.speed, radius: e.radius,
          amount: e.amount * mult, left: e.range, homing: e.homing ?? 0, pierce: !!e.pierce, knockback: e.knockback ?? 2, mark: e.mark ?? 0, markFor: e.markFor ?? 0,
          hit: new Set(),
        });
      }
      sim.events.push({ kind: 'projectile', pos: v3(b.pos.x, b.pos.y + 1.3, b.pos.z), key, yaw: base });
      break;
    }
    case 'dash': {
      const dir = fromYaw(e.back ? p.yaw + Math.PI : p.yaw);
      p.dodge = { t: 0, dur: e.duration, dir, speed: e.distance / e.duration, flat: true, through: !!e.through, turn: !e.back };
      if (e.invulnerable) p.status.invuln = Math.max(p.status.invuln, e.duration + 0.05);
      sim.events.push({ kind: 'dash', pos: b.pos, yaw: yawOf(dir), key });
      break;
    }
    case 'leap': {
      const g = MOVEMENT.gravity, vy = Math.sqrt(2 * g * e.height), flight = leapFlight(e.height), dir = fromYaw(p.yaw);
      b.vel.x = dir.x * (e.distance / flight); b.vel.z = dir.z * (e.distance / flight); b.vel.y = vy; b.grounded = false;
      p.leap = { land: e.land ?? null, key };
      p.airJumps = 0; p.coyote = 0;
      sim.events.push({ kind: 'jump', pos: b.pos, power: 1.5, key });
      break;
    }
    case 'heal': heal(sim, p, e.amount); break;
    case 'buff': addBuff(p, e.stat, e.mult, e.duration); break;
    case 'shield':
      p.status.shield = Math.max(p.status.shield, e.amount); p.status.shieldLeft = Math.max(p.status.shieldLeft, e.duration);
      sim.events.push({ kind: 'shield', pos: b.pos, key, power: e.duration });
      break;
    case 'slow-time':
      sim.slow = { factor: e.factor, left: e.duration };
      sim.events.push({ kind: 'slowmo', pos: b.pos, power: e.duration, key });
      break;
    case 'pull': {
      for (const t of targetsIn(b.pos, p.yaw, e.shape, sim.enemies)) {
        const d = sub(b.pos, t.body.pos), dist = lenXZ(d) || 1;
        const k = Math.min(e.strength, dist * 3);
        t.body.vel.x += (d.x / dist) * k; t.body.vel.z += (d.z / dist) * k;
        t.body.vel.y = Math.max(t.body.vel.y, 3); t.body.grounded = false;
        t.status.stagger = Math.max(t.status.stagger, 0.8);
      }
      sim.events.push({ kind: 'pull', pos: b.pos, radius: e.shape.range, key });
      break;
    }
    case 'stance':
      p.status.stance = e.duration; p.status.stanceReduction = e.reduction; p.status.stanceCounter = e.counter ?? 0;
      break;
  }
}
