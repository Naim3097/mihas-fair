// The course, as data: platforms floating in space in the Playground's own metres (x along the course, y up, z
// across), the stars and bubbles on them, the checkpoint rings, the pads, the gear stands, the start line and the
// finish gate, and per section the way the camera should face. The world draws what is here, the engine walks it,
// and the tests jump every gap on the real physics. Nothing is placed by a picture: every number is a rule.
import type { Box } from '../ceritera/game/physics';
import { box } from '../ceritera/game/physics';

export type Gear = 'boots' | 'skates' | 'jetpack';
/** A platform: its top at `y`, the slab 0.6 m thick below it. */
export interface Platform { x0: number; x1: number; z0: number; z1: number; y: number }
export type PickupKind = 'star' | 'bubble' | 'cell' | 'diamond';
/** A pickup: a point with a radius; `line` is the gear whose line it is on (boots: everyone's). */
export interface Pickup { kind: PickupKind; x: number; y: number; z: number; line: Gear }
/** A plane across the course at `x`, between z0..z1 and y..y+h, crossed in the course's direction (`dir` ±1 along x). */
export interface Crossing { x: number; z0: number; z1: number; y: number; h: number; dir: 1 | -1 }
/** A checkpoint ring: where a fall returns you (`at`), the plane that sets it, and how far along the course it is
 *  (`order`: a fall goes back to the ring of the highest order passed, whichever lane it was on). */
export interface Ring extends Crossing { at: { x: number; y: number; z: number; yaw: number }; order: number }
/** A pad on a platform's top: a boost along `dir`, or a jump straight up. */
export interface Pad { kind: 'boost' | 'jump'; x: number; z: number; y: number; w: number; d: number; dir: [number, number] }
export interface Stand { gear: Gear; x: number; z: number }
/** Where the camera settles while the body is in this rectangle; `gear` limits it to one gear's line. */
export interface Section { name: string; x0: number; x1: number; z0: number; z1: number; yaw: number; gear?: Gear }
/** One hill of the Jetpack line: the edge it lifts from, the crest to let go at, where the fall lands. */
export interface Hill { x0: number; xc: number; land: number; climb: number }
export interface Course {
  platforms: Platform[]; pickups: Pickup[]; rings: Ring[]; pads: Pad[]; stands: Stand[];
  /** the Jetpack line's hills, for the tests and the flight's own hints */
  hills: Hill[];
  portal: { x: number; z: number; r: number }; start: Crossing; gate: Crossing; sections: Section[];
  spawn: { x: number; y: number; z: number; yaw: number };
  /** the ceiling every world has, so a body never leaves the shadow map's reach */
  ceiling: number;
}

export const PICKUP_R: Record<PickupKind, number> = { star: 0.55, bubble: 0.6, cell: 0.6, diamond: 0.7 };
export const STAR_Y = 0.6;
/** How thick a platform's slab is, and how far below the lowest platform a body has fallen off. */
export const SLAB = 0.6, FALL_Y = -3;
/** A boost pad's push (m/s) and a jump pad's launch (m/s): 3 m up under gravity 22. */
export const BOOST = 6, JUMP_PAD = 11.5;
/** Facing along +x, +z, −x as the body's yaw (rotation.y: yaw = atan2(dir.x, dir.z)). */
export const YAW_EAST = Math.PI / 2, YAW_NORTH = 0, YAW_WEST = -Math.PI / 2;

/** The glass ceiling every world has, so a body never leaves the shadow map's reach. */
const CEILING = 18;

/** The one course. Built by rule from a handful of numbers, so a tweak to a gap is one number. */
export function buildCourse(): Course {
  const P: Platform[] = [], K: Pickup[] = [], R: Ring[] = [], pads: Pad[] = [];
  const lane = (x0: number, x1: number, y: number, z0 = -3, z1 = 3) => { P.push({ x0, x1, z0, z1, y }); };
  const star = (x: number, y: number, z: number, line: Gear = 'boots') => K.push({ kind: 'star', x, y, z, line });
  const bubble = (x: number, y: number, z: number) => K.push({ kind: 'bubble', x, y, z, line: 'boots' });
  /** three stars in an arc over a gap between two platforms (their tops at ya and yb), centred on the gap */
  const arc = (xa: number, xb: number, ya: number, yb: number, z: number, line: Gear = 'boots') => {
    const c = (xa + xb) / 2, base = Math.max(ya, yb);
    star(c - 1, base + 0.9, z, line); star(c, base + 1.5, z, line); star(c + 1, base + 0.9, z, line);
  };
  /** stars along a platform's top, every 2.5 m from its start, a little in from both ends */
  const run = (p: Platform, z: number, line: Gear = 'boots') => { for (let x = p.x0 + 1.5; x <= p.x1 - 1.2; x += 2.5) star(x, p.y + STAR_Y, z, line); };
  const ring = (x: number, y: number, z: number, dir: 1 | -1, yaw: number, order: number) => R.push({ x, z0: z - 3.2, z1: z + 3.2, y, h: 4, dir, at: { x, y: y + 0.05, z, yaw }, order });

  // the pad: gear stands to the north, the portal to the south-west, the start line to the east
  P.push({ x0: -8, x1: 8, z0: -8, z1: 8, y: 0 });
  const stands: Stand[] = [{ gear: 'boots', x: -4, z: 5 }, { gear: 'skates', x: 0, z: 5 }, { gear: 'jetpack', x: 4, z: 5 }];
  const start: Crossing = { x: 8, z0: -4, z1: 4, y: 0, h: 4, dir: 1 };

  // Boardwalk: floor at 0, gaps of 1.8–2.2 m (a running jump at the edge clears 3.2, half a metre early 2.7), an arc
  // over each, a boost pad, bubbles on the line and just off it
  const A: [number, number][] = [[8, 16], [17.8, 26], [28, 36], [38, 46], [48.2, 58], [60.2, 72]];
  A.forEach(([x0, x1], i) => { lane(x0, x1, 0); if (i) arc(A[i - 1]![1], x0, 0, 0, 0); });
  run(P[1]!, 0); run(P[3]!, 0); run(P[4]!, 0); run(P[6]!, 0);
  bubble(14, 0.8, 0); bubble(23, 0.8, -1.2); bubble(34, 0.8, 0); bubble(55, 0.8, 1.2); bubble(66, 0.8, 0);
  pads.push({ kind: 'boost', x: 41.5, z: 0, y: 0, w: 3, d: 2.4, dir: [1, 0] });
  ring(10, 0, 0, 1, YAW_EAST, 10); ring(50, 0, 0, 1, YAW_EAST, 50);

  // Stairs: a metre up at a time with 2.6–2.8 m gaps (the air jump clears 4.7 level, about 3.6 a metre up; half a metre
  // early, less): the air jump; a jump pad at the end of the third for the tall step; the top, and the turn north
  const B: [number, number, number][] = [[74.6, 82, 1], [84.8, 92, 2], [94.8, 102, 3], [103, 110, 5.5], [112.8, 120, 6.5], [122.8, 130, 7.5], [132.6, 149, 8.5]];
  let prev: Platform = P[6]!;
  for (const [x0, x1, y] of B) { const p: Platform = { x0, x1, z0: -3, z1: 3, y }; P.push(p); arc(prev.x1, x0, prev.y, y, 0); if (x1 - x0 >= 6) { star(x0 + 2, y + STAR_Y, 0); star(x1 - 2, y + STAR_Y, 0); } prev = p; }
  pads.push({ kind: 'jump', x: 101.2, z: 0, y: 3, w: 1.6, d: 2.4, dir: [0, 0] });
  bubble(88, 2.8, 0); bubble(106, 6.3, -1.2); bubble(127, 8.3, 0); bubble(117, 7.3, 1.2);
  ring(78, 1, 0, 1, YAW_EAST, 78); ring(105, 5.5, 0, 1, YAW_EAST, 105); ring(137, 8.5, 0, 1, YAW_EAST, 137);
  // the Boots diamond: a ledge four metres past the top's end, a double jump (or a top-speed one) out and back
  P.push({ x0: 153, x1: 156, z0: -1.5, z1: 1.5, y: 8.5 });
  K.push({ kind: 'diamond', x: 154.5, y: 9.7, z: 0, line: 'boots' });
  // the turn: north along the top's end, then the return lanes head west: Boots at z 20, Skates at z 30; the
  // platform runs three metres past the last lane, room for a skater's drift
  P.push({ x0: 143, x1: 149, z0: 3, z1: 36, y: 8.5 });
  star(146, 8.5 + STAR_Y, 8); star(146, 8.5 + STAR_Y, 12); star(146, 8.5 + STAR_Y, 16); bubble(146, 9.3, 20);

  // Return lane at z 20, heading west: 2.4 m gaps and a step down every platform, two boost pads, home and the gate
  const C: [number, number, number][] = [[130.6, 140.6, 8.5], [118.2, 128.2, 7], [105.8, 115.8, 5.5], [93.4, 103.4, 4], [81, 91, 2.5], [68.6, 78.6, 1], [56.2, 66.2, 0], [43.8, 53.8, 0], [31.4, 41.4, 0], [8, 29, 0]];
  let last: Platform = { x0: 143, x1: 149, z0: 17, z1: 23, y: 8.5 };
  for (const [x0, x1, y] of C) { const p: Platform = { x0, x1, z0: 17, z1: 23, y }; P.push(p); arc(x1, last.x0, y, last.y, 20); run(p, 20); last = p; }
  pads.push({ kind: 'boost', x: 61.5, z: 20, y: 0, w: 3, d: 2.4, dir: [-1, 0] }, { kind: 'boost', x: 36.5, z: 20, y: 0, w: 3, d: 2.4, dir: [-1, 0] });
  bubble(123, 7.8, 20); bubble(98, 4.8, 18.8); bubble(73, 1.8, 20); bubble(60, 0.8, 21.2); bubble(36, 0.8, 20); bubble(20, 0.8, 18.8);
  const west = (x: number) => 200 + 149 - x; // the return lanes' order: how far west of the turn
  ring(135, 8.5, 20, -1, YAW_WEST, west(135)); ring(110, 5.5, 20, -1, YAW_WEST, west(110)); ring(86, 2.5, 20, -1, YAW_WEST, west(86)); ring(60, 0, 20, -1, YAW_WEST, west(60));

  // The Skates line at z 30, heading west: a 5 m gap off the turn then 5.5 m gaps between 10 m platforms, each about a
  // metre lower than the last, so a single jump at the tuck, a double at the cruise, and a boost pad's push with
  // either all land on the next (the landing zone is 5.5–15.5 m out; the tuck's single carries 6.6, the cruise's
  // double 7.9, a boosted tuck's double under 14). The pads sit four metres in from the edge, so their push has
  // settled by the jump. Cyan-ringed stars, a ring and a bubble on every other platform, and the Skates diamond on
  // the home stretch, before the gate
  const S: [number, number, number][] = [[128, 138, 7.4], [112.5, 122.5, 6.3], [97, 107, 5.3], [81.5, 91.5, 4.2], [66, 76, 3.2], [50.5, 60.5, 2.1], [35, 45, 1.1]];
  let lastS: Platform = { x0: 143, x1: 149, z0: 27, z1: 33, y: 8.5 };
  for (const [x0, x1, y] of S) { const p: Platform = { x0, x1, z0: 27, z1: 33, y }; P.push(p); arc(x1, lastS.x0, y, lastS.y, 30, 'skates'); run(p, 30, 'skates'); lastS = p; }
  // home runs on past the gate to the pad's side, so a skater through the gate coasts to a stop instead of the edge
  const homeS: Platform = { x0: -8, x1: 29.5, z0: 23, z1: 33, y: 0 }; P.push(homeS); arc(29.5, 35, 0, 1.1, 30, 'skates');
  for (const x of [26, 23.5, 21, 18.5]) star(x, STAR_Y, 30, 'skates');
  K.push({ kind: 'diamond', x: 14, y: 1.2, z: 30, line: 'skates' });
  for (const [x, y] of [[116.5, 6.3], [85.5, 4.2], [54.5, 2.1]] as const) pads.push({ kind: 'boost', x, z: 30, y, w: 3, d: 2.4, dir: [-1, 0] });
  bubble(135, 8.2, 28.8); bubble(104, 6.1, 31.2); bubble(73, 4.0, 28.8); bubble(42, 1.9, 31.2);
  ring(132, 7.4, 30, -1, YAW_WEST, west(132)); ring(101, 5.3, 30, -1, YAW_WEST, west(101)); ring(70, 3.2, 30, -1, YAW_WEST, west(70)); ring(39, 1.1, 30, -1, YAW_WEST, west(39));

  // The Jetpack line, in hills over the Boots lane: from a platform's west edge, a climb at the full thrust (6.5 m/s
  // up, 7 along) to a crest, then the fall a body makes once the button is let go (up a little more, then down at
  // the fall's gravity), landing two platforms on, a couple of metres inside its edge; then the floor to the next
  // edge, which refills the tank. Stars sit on the climb and on the fall a third of a second apart, so holding to the
  // crest and letting go carries the chest through every one; the crest holds the diamond, a cell, or a hoop. The
  // first hill lifts from the middle of the first platform, under the ceiling, and lands on the next
  const UP = 6.5, ALONG = 7, G = 22, GF = G * 1.3, COAST = UP / G, LIFT = (UP * UP) / (2 * G);
  const chestAfter = (crest: number, t: number) => (t <= COAST ? crest + UP * t - 0.5 * G * t * t : crest + LIFT - 0.5 * GF * (t - COAST) ** 2);
  const hills: Hill[] = [];
  const hill = (x0: number, landFloor: number, crest: PickupKind | 'hoop', flight: number) => {
    const chest0 = laneTopAt(P, x0, 20) + 0.9;
    let climb = 0.8, best = 99; // the climb whose fall lands `flight` metres out, with a head's room under the ceiling
    for (let c = 0.8; c <= 1.5; c += 0.01) {
      if (chest0 + UP * c + LIFT > CEILING - 1.1) break;
      const drop = chest0 + UP * c + LIFT - (landFloor + 0.9), len = ALONG * c + ALONG * (COAST + Math.sqrt(Math.max(0, drop) / (0.5 * GF)));
      if (Math.abs(len - flight) < best) { best = Math.abs(len - flight); climb = c; }
    }
    const xc = x0 - ALONG * climb, yc = chest0 + UP * climb;
    for (let t = 0.3; t < climb - 0.12; t += 0.3) star(x0 - ALONG * t, chest0 + UP * t, 20, 'jetpack');
    if (crest === 'hoop') { star(xc, yc, 20, 'jetpack'); R.push({ x: xc, z0: 16.8, z1: 23.2, y: yc - 2, h: 4, dir: -1, at: { x: xc, y: laneTopAt(P, xc, 20) + 0.05, z: 20, yaw: YAW_WEST }, order: west(xc) }); }
    else K.push({ kind: crest, x: xc, y: yc, z: 20, line: 'jetpack' });
    let land = xc;
    for (let t = 0.28; t < 3; t += 0.22) { const x = xc - ALONG * t, y = chestAfter(yc, t); land = x; if (y < landFloor + 0.9 + 1.4) break; star(x, y, 20, 'jetpack'); }
    hills.push({ x0, xc, land, climb });
  };
  hill(137.8, 7, 'diamond', 14.6); hill(118.2, 4, 'cell', 17.2); hill(93.4, 1, 'hoop', 17.2); hill(68.6, 0, 'cell', 17.2); hill(43.8, 0, 'hoop', 17.2);
  K.push({ kind: 'cell', x: 135, y: 9.1, z: 0, line: 'jetpack' }); // on the stairs' top: a full tank before the sky
  const gate: Crossing = { x: 12, z0: 14, z1: 33, y: 0, h: 6, dir: -1 };
  // the bridge from home back to the pad, for walking around after the gate
  P.push({ x0: 6, x1: 14, z0: 8, z1: 14, y: 0 });

  const sections: Section[] = [
    { name: 'pad', x0: -10, x1: 14, z0: -10, z1: 16, yaw: YAW_EAST },
    { name: 'boardwalk', x0: 8, x1: 74, z0: -6, z1: 10, yaw: YAW_EAST },
    { name: 'stairs', x0: 74, x1: 160, z0: -6, z1: 3.5, yaw: YAW_EAST },
    { name: 'turn', x0: 141, x1: 151, z0: 3.5, z1: 16, yaw: YAW_NORTH },
    { name: 'turn-skates', x0: 141, x1: 151, z0: 16, z1: 26, yaw: YAW_NORTH, gear: 'skates' }, // on skates the turn faces north until the z 30 lane is near
    { name: 'skyline', x0: 0, x1: 151, z0: 12, z1: 38, yaw: YAW_WEST },
  ];
  return { platforms: P, pickups: K, rings: R, pads, stands, hills, portal: { x: -5, z: -5, r: 1.4 }, start, gate, sections, spawn: { x: 0, y: 0.05, z: 0, yaw: YAW_EAST }, ceiling: CEILING };
}

/** The boxes the body collides with: every platform's slab, each pad as a hair-thin box on top carrying its kind as
 *  the tag, the gear stands the same, and the ceiling. */
export function courseBoxes(c: Course): Box[] {
  const out: Box[] = c.platforms.map((p) => box(p.x0, p.y - SLAB, p.z0, p.x1, p.y, p.z1, 'platform'));
  for (const p of c.pads) out.push(box(p.x - p.w / 2, p.y, p.z - p.d / 2, p.x + p.w / 2, p.y + 0.02, p.z + p.d / 2, p.kind === 'jump' ? 'jump' : `boost:${p.dir[0]},${p.dir[1]}`));
  for (const s of c.stands) out.push(box(s.x - 1.4, 0, s.z - 1.4, s.x + 1.4, 0.02, s.z + 1.4, `stand:${s.gear}`));
  out.push(box(-40, c.ceiling, -40, 200, c.ceiling + 1, 60, 'ceiling'));
  return out;
}

/** The floor's height along a lane at `x`: the top of the lane's platform there (the lane: platforms within four
 *  metres of `z` either side), or, over a gap, the line from the platform before to the one after; beyond the lane's
 *  ends, the end platform's top. */
export function laneTopAt(platforms: Platform[], x: number, z: number): number {
  const lane = platforms.filter((p) => p.z0 >= z - 4 && p.z1 <= z + 4 && p.z0 <= z && z <= p.z1).sort((a, b) => a.x0 - b.x0);
  if (!lane.length) return 0;
  for (let i = 0; i < lane.length; i++) {
    const p = lane[i]!, n = lane[i + 1];
    if (x >= p.x0 && x <= p.x1) return p.y;
    if (n && x > p.x1 && x < n.x0) return p.y + ((n.y - p.y) * (x - p.x1)) / (n.x0 - p.x1);
  }
  return x < lane[0]!.x0 ? lane[0]!.y : lane[lane.length - 1]!.y;
}

/** Which section the body is in, if any: the first whose rectangle holds it, skipping those for another gear. */
export function sectionAt(c: Course, x: number, z: number, gear?: Gear): Section | null {
  return c.sections.find((s) => (!s.gear || s.gear === gear) && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) ?? null;
}

/** Did the body cross this plane in its direction between two positions? */
export function crossed(k: Crossing, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean {
  const a = (from.x - k.x) * k.dir, b = (to.x - k.x) * k.dir;
  if (!(a < 0 && b >= 0)) return false;
  return to.z >= k.z0 && to.z <= k.z1 && to.y >= k.y - 0.5 && to.y <= k.y + k.h;
}

/** The platform under a point, if any (its top at or below the point). */
export function platformUnder(c: Course, x: number, y: number, z: number): Platform | null {
  let best: Platform | null = null;
  for (const p of c.platforms) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.y <= y + 0.05 && (!best || p.y > best.y)) best = p;
  return best;
}

/** The pickups near a point, through a coarse hash: the same few every step, not all of them. */
export class PickupIndex {
  private cells = new Map<string, number[]>();
  constructor(private pickups: Pickup[], readonly cell = 4) {
    pickups.forEach((p, i) => { const k = this.key(p.x, p.z); (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i); });
  }
  private key(x: number, z: number) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  /** Indices of pickups within `r` of the point (a sphere test on each candidate). */
  near(x: number, y: number, z: number, r: number, out: number[]): number {
    let n = 0;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const k of this.cells.get(`${i},${j}`) ?? []) {
      const p = this.pickups[k]!, rr = r + PICKUP_R[p.kind];
      if ((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 <= rr * rr) out[n++] = k;
    }
    return n;
  }
}
