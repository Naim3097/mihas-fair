// Orbit 2: the course awake. Which tiles move (never the pad, a checkpoint ring's, the gate's, the turn, a diamond's
// ledge or a jump pad's), how far each may go (worked out from the body's own jump: every gap by a moving tile stays one
// a Boots body clears with the air jump from half a metre early, with a metre of air between tiles, always), and, for a
// run's seed, which movement each tile makes. The course grows livelier as it goes; no movement is used twice in a run;
// movements a player has not seen lately come first. The plan is data: movers.ts plays it, the tests walk it.
import type { Course, Platform } from './course';
import { BOOTS, jumpReach } from './gear';
import { CATALOGUE, PATHS, ampOf, measure, type Motion, type Off, type Program } from './motion';
import { pickWeighted, rng } from './rng';

export type Lane = 'east' | 'return' | 'skates';
export interface Slot {
  /** the platform's index in the course */
  i: number;
  /** where it rests (a copy: the course's own platform moves with it) */
  home: Platform;
  lane: Lane;
  /** how bold its movements are: the course grows livelier as it goes, 0.4 on the boardwalk to 1 on the way back */
  bold: number;
  /** the most it may move each way along each axis (m) */
  bound: Off;
  /** the pads on it (course.pads), and the pickups on it (course.pickups): they ride along */
  pads: number[];
  riders: number[];
  /** its neighbours along the lane (platform indices): two neighbours never both open a gap, nor both change height */
  prev: number | null; next: number | null;
}

/** Air between a moving tile and a tile beside it, always (m): a body's width and more. */
export const CLEAR = 1.0;
/** What is kept back from the air jump's carry from half a metre early (m): a thumb that is a little late too. */
const MARGIN = 0.3;
/** The fastest an Orbit 2 tile goes (m/s), at its boldest: under a walk's pace plus a step, far under a run. */
export const ORBIT_VMAX = 2.2;
/** Across a 6 m lane a tile may slide this far (m): at the most, 4.8 m of the landing is still where it was. */
const SIDE = 1.2;

const on = (p: Platform, x: number, z: number, y?: number) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && (y === undefined || Math.abs(y - p.y) < 0.02);
const gap = (a: Platform, b: Platform) => (b.x0 >= a.x1 ? b.x0 - a.x1 : a.x0 - b.x1);
/** How far a Boots body carries with the air jump from half a metre before the edge, onto a landing `rise` higher. */
const carry = (rise: number) => jumpReach(BOOTS, BOOTS.run, rise, true) - 0.5 - MARGIN;

function laneOf(p: Platform): Lane | null {
  if (p.z0 >= -3.01 && p.z1 <= 3.01 && p.z1 - p.z0 >= 5.9) return 'east';
  if (p.z0 === 17 && p.z1 === 23) return 'return';
  if (p.z0 === 27 && p.z1 === 33) return 'skates';
  return null;
}

/** The tiles that may move, and how far, read off the course by rule. */
export function slotsFor(c: Course): Slot[] {
  const P = c.platforms, out: Slot[] = [];
  const lanes = new Map<Lane, number[]>();
  P.forEach((p, i) => { const l = laneOf(p); if (l) (lanes.get(l) ?? lanes.set(l, []).get(l)!).push(i); });
  // in the order the lane is run: east out, west back
  for (const [l, ids] of lanes) ids.sort((a, b) => (l === 'east' ? P[a]!.x0 - P[b]!.x0 : P[b]!.x0 - P[a]!.x0));
  for (const [lane, ids] of lanes) ids.forEach((i, n) => {
    const p = P[i]!;
    const anchor = i === 0
      || c.rings.some((r) => on(p, r.at.x, r.at.z, r.at.y - 0.05))
      || c.pads.some((d) => d.kind === 'jump' && on(p, d.x, d.z, d.y))
      || c.pickups.some((k) => k.kind === 'diamond' && on(p, k.x, k.z) && k.y - p.y < 3)
      || (c.gate.x >= p.x0 && c.gate.x <= p.x1 && p.z1 > c.gate.z0 && p.z0 < c.gate.z1)
      || (c.start.x >= p.x0 && c.start.x <= p.x1 && p.z1 > c.start.z0 && p.z0 < c.start.z1);
    if (anchor) return;
    const pads = c.pads.flatMap((d, j) => (on(p, d.x, d.z, d.y) ? [j] : []));
    const riders = c.pickups.flatMap((k, j) => (k.line !== 'jetpack' && on(p, k.x, k.z) && k.y >= p.y && k.y - p.y <= 3 ? [j] : []));
    const prev = n > 0 ? ids[n - 1]! : null, next = n < ids.length - 1 ? ids[n + 1]! : null;
    const bold = lane === 'east' ? (p.x0 < 72 ? 0.4 : 0.7) : lane === 'return' ? 1 : 0.9;
    let bound: Off;
    if (pads.length || lane === 'skates') bound = { x: 0, y: 0, z: lane === 'skates' ? 1.0 : SIDE }; // a boost pad pushes along the lane: its tile only slides across
    else if (lane === 'return' && c.hills.some((h) => h.x0 >= p.x0 - 0.1 && h.x0 <= p.x1)) bound = { x: 0.3, y: 0.4, z: 0.4 }; // the Jetpack lifts off it: it barely stirs
    else bound = room(p, prev == null ? null : P[prev]!, next == null ? null : P[next]!);
    out.push({ i, home: { ...p }, lane, bold, bound, pads, riders, prev, next });
  });
  return out.sort((a, b) => a.i - b.i);
}

/** How far a tile may go between its neighbours: up and down first (the steps into it and out of it stay within the air
 *  jump), then along the lane (a metre of air kept each side, and the gap it opens still within the air jump). */
function room(p: Platform, a: Platform | null, b: Platform | null): Off {
  const jumps = (dy: number, dx: number) => {
    if (a && carry(p.y + dy - a.y) < gap(a, p) + dx) return false; // onto it, when it has risen
    if (b && carry(b.y - (p.y - dy)) < gap(p, b) + dx) return false; // off it, when it has sunk
    return true;
  };
  let y = 0; for (let k = 0.45; k >= 0; k -= 0.05) if (jumps(k, 0)) { y = +k.toFixed(2); break; }
  let x = 0; for (let k = 1.2; k >= 0; k -= 0.05) if ((!a || gap(a, p) - k >= CLEAR) && (!b || gap(p, b) - k >= CLEAR) && jumps(y, k)) { x = +k.toFixed(2); break; }
  return { x, y, z: SIDE };
}

export interface OrbitPlan { seed: number; /** per slot, in slot order: its movement, or none */ motions: (Motion | null)[]; /** the movements used */ programs: string[] }

/** A run's course: for each tile that may move, a movement from the catalogue that fits its room (no two alike), as
 *  bold as the tile is, never faster than the orbit allows there, from a random point in its cycle. `seen`: movements
 *  met lately, drawn a third as often, so a player keeps meeting new ones. */
export function planOrbit(slots: readonly Slot[], seed: number, seen: ReadonlySet<string> = new Set()): OrbitPlan {
  const r = rng(seed), used = new Set<string>(), alongX = new Set<number>(), upDown = new Set<number>(), motions: (Motion | null)[] = [];
  for (const s of slots) {
    const beside = (set: Set<number>) => (s.prev != null && set.has(s.prev)) || (s.next != null && set.has(s.next));
    const bx = beside(alongX) ? 0 : s.bound.x, by = beside(upDown) ? 0 : s.bound.y, bz = s.bound.z;
    const fits = CATALOGUE.filter((p) => { const w = PATHS[p.path].w; return !used.has(p.id) && (!w.x || bx >= 0.15) && (!w.y || by >= 0.1) && (!w.z || bz >= 0.15); });
    if (!fits.length) { motions.push(null); continue; }
    const want = 0.4 + 0.4 * s.bold; // easier movements early, bolder ones later: a weight, never a rule
    const prog: Program = pickWeighted(r, fits, (p) => (seen.has(p.id) ? 1 : 8) * (0.25 + Math.exp(-(((p.difficulty - want) / 0.18) ** 2))));
    const k = 0.6 + 0.4 * s.bold, a = ampOf(prog.path, prog.reach, k);
    const amp = { x: Math.min(a.x, bx), y: Math.min(a.y, by), z: Math.min(a.z, bz) };
    const cap = ORBIT_VMAX * (0.65 + 0.35 * s.bold), unit = measure({ shape: prog.shape, path: prog.path, amp, period: 1, phase: 0 });
    const period = Math.max(prog.period, unit.vmax / cap); // slowed, never sped up: a slow drift is fine, a fast tile is not
    motions.push({ shape: prog.shape, path: prog.path, amp, period, phase: r() });
    used.add(prog.id);
    const w = PATHS[prog.path].w;
    if (w.x && amp.x > 0.05) alongX.add(s.i);
    if (w.y && amp.y > 0.05) upDown.add(s.i);
  }
  return { seed, motions, programs: [...used] };
}
