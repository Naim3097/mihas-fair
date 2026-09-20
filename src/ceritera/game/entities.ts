// The things that fight. The player and the shadows share one shape, so damage, status and animation are one code
// path: the sim mutates these, the renderer only reads them. Nothing here knows about three.js.
import type { AnimKey, BuffStat, ClassKey } from '../../../content';
import { newBody, type Body } from './physics';
import { v3, type V3 } from './v3';

export type Team = 'player' | 'enemy';

export interface Buff { stat: BuffStat; mult: number; left: number }

export interface Status {
  /** Seconds left in which the fighter cannot act. */
  stagger: number;
  slow: number; slowMult: number;
  invuln: number;
  mark: number; markBonus: number;
  shield: number; shieldLeft: number;
  stance: number; stanceReduction: number; stanceCounter: number;
  buffs: Buff[];
  /** Seconds since the last wound: dummies regrow after a pause, shadows remember who hit them. */
  sinceHurt: number;
}

export interface AnimState {
  key: AnimKey;
  loop: boolean;
  /** Squeeze or stretch a one-shot to this many seconds so strikes and casts fit their mechanics; 0 = natural. */
  fit: number;
  /** Start this far into the clip (0–1). */
  from: number;
  /** Bumped on every one-shot so the renderer notices a restart of the same clip. */
  serial: number;
  /** Speed for loops: walk cycles match the feet to the floor. */
  rate: number;
}

export interface Fighter {
  id: number;
  team: Team;
  model: ClassKey | 'dummy';
  body: Body;
  yaw: number;
  /** For hit tests: the body plus a little forgiveness. */
  hitRadius: number;
  health: number;
  maxHealth: number;
  status: Status;
  anim: AnimState;
  dead: boolean;
  deadFor: number;
  /** Seconds of tint left after a hit. */
  hitFlash: number;
}

export const newStatus = (): Status => ({ stagger: 0, slow: 0, slowMult: 1, invuln: 0, mark: 0, markBonus: 0, shield: 0, shieldLeft: 0, stance: 0, stanceReduction: 0, stanceCounter: 0, buffs: [], sinceHurt: 999 });

let nextId = 1;
export function newFighter(team: Team, model: ClassKey | 'dummy', pos: V3, radius: number, height: number, health: number): Fighter {
  return {
    id: nextId++, team, model, body: newBody(v3(pos.x, pos.y, pos.z), radius, height), yaw: 0, hitRadius: radius + 0.3,
    health, maxHealth: health, status: newStatus(),
    anim: { key: 'idle', loop: true, fit: 0, from: 0, serial: 0, rate: 1 }, dead: false, deadFor: 0, hitFlash: 0,
  };
}

/** Ask for a looping clip, switching only when it changes, so a walk cycle is never restarted mid-stride. */
export function loop(f: Fighter, key: AnimKey, rate = 1): void {
  const a = f.anim;
  if (a.key === key && a.loop) { a.rate = rate; return; }
  a.key = key; a.loop = true; a.fit = 0; a.from = 0; a.rate = rate; a.serial++;
}

/** Play a one-shot clip from `from`, fitted to `fit` seconds when given. */
export function oneShot(f: Fighter, key: AnimKey, fit = 0, from = 0): void {
  const a = f.anim;
  a.key = key; a.loop = false; a.fit = fit; a.from = from; a.rate = 1; a.serial++;
}

export const buffMult = (f: Fighter, stat: BuffStat): number => f.status.buffs.reduce((m, b) => (b.stat === stat ? m * b.mult : m), 1);
export const speedMult = (f: Fighter): number => buffMult(f, 'speed') * (f.status.slow > 0 ? f.status.slowMult : 1);

export function addBuff(f: Fighter, stat: BuffStat, mult: number, duration: number): void {
  const b = f.status.buffs.find((x) => x.stat === stat && x.mult === mult);
  if (b) b.left = Math.max(b.left, duration); else f.status.buffs.push({ stat, mult, left: duration });
}

export function tickStatus(f: Fighter, dt: number): void {
  const s = f.status;
  s.stagger = Math.max(0, s.stagger - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  s.mark = Math.max(0, s.mark - dt); if (s.mark === 0) s.markBonus = 0;
  s.slow = Math.max(0, s.slow - dt); if (s.slow === 0) s.slowMult = 1;
  s.shieldLeft = Math.max(0, s.shieldLeft - dt); if (s.shieldLeft === 0) s.shield = 0;
  s.stance = Math.max(0, s.stance - dt); if (s.stance === 0) { s.stanceReduction = 0; s.stanceCounter = 0; }
  for (const b of s.buffs) b.left -= dt;
  s.buffs = s.buffs.filter((b) => b.left > 0);
  s.sinceHurt += dt;
  f.hitFlash = Math.max(0, f.hitFlash - dt);
}
