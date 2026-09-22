// Which booth is under the pointer. Worked out from the floor plan, not by asking the GPU: a ray from the eye is tested
// against the boxes of the few booths it passes over, and the first one it enters wins — so a booth hidden behind
// another is never picked through it. Plan space throughout: x east, y north, z up (the same numbers as floor.json).
// A level that draws its plan y compressed (the fair's level 2) passes that mapping in, and gives its rays in the
// drawn space; the picker then keeps every booth's y extent in the same space.

import type { Booth, LevelData } from '../../shared/types';

export interface Ray { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
const CELL = 6;

export class BoothPicker {
  private buckets = new Map<string, Booth[]>();
  private w: number; private h: number;
  /** each booth's y extent, in the space the rays come in */
  private ys = new Map<string, [number, number]>();

  constructor(level: LevelData, fixY: (y: number) => number = (y) => y) {
    this.w = level.booth.w; this.h = level.booth.h;
    const depth = new Map(level.decks.map((d) => [d.level, d.boothD]));
    for (const b of level.booths) {
      const hd = (depth.get(b.deck) ?? level.booth.d) / 2;
      this.ys.set(b.id, [fixY(b.y - hd), fixY(b.y + hd)]);
      const k = `${Math.floor(b.x / CELL)},${Math.floor(fixY(b.y) / CELL)}`; (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(b);
    }
  }

  /** The front-most booth the ray enters, or null: it reached the floor first, or it never comes down. From below
   *  the roofs (a low camera in an aisle) the ray is tested from the eye; the booth the eye itself stands in is
   *  never the answer, a press from inside a booth means the floor or the booth across the aisle. */
  pick(r: Ray): Booth | null {
    if (r.dz >= -1e-6 || r.oz <= 0) return null; // looking up, or under the floor: nothing sensible to say
    // A booth can only be entered between the height of its roof and the floor: that stretch of the ray is a short line on the plan.
    const tTop = r.oz > this.h ? (this.h - r.oz) / r.dz : 0, tFloor = -r.oz / r.dz;
    const ax = r.ox + r.dx * tTop, ay = r.oy + r.dy * tTop, bx = r.ox + r.dx * tFloor, by = r.oy + r.dy * tFloor;
    if (Math.hypot(bx - ax, by - ay) > 60) return null; // a grazing ray near the horizon: not a click on anything
    const x0 = Math.floor((Math.min(ax, bx) - this.w) / CELL), x1 = Math.floor((Math.max(ax, bx) + this.w) / CELL);
    const y0 = Math.floor((Math.min(ay, by) - 4) / CELL), y1 = Math.floor((Math.max(ay, by) + 4) / CELL);
    let best: Booth | null = null, bestT = Infinity;
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (const b of this.buckets.get(`${i},${j}`) ?? []) {
      const t = this.enter(r, b); if (t < bestT) { bestT = t; best = b; }
    }
    return best;
  }

  /** Distance along the ray at which it enters the booth's box (slab test); Infinity if it misses, or starts inside. */
  private enter(r: Ray, b: Booth): number {
    const hw = this.w / 2, [y0, y1] = this.ys.get(b.id)!;
    let t0 = 0, t1 = Infinity, inside = true;
    for (const [o, d, lo, hi] of [[r.ox, r.dx, b.x - hw, b.x + hw], [r.oy, r.dy, y0, y1], [r.oz, r.dz, 0, this.h]] as const) {
      if (o < lo || o > hi) inside = false;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      const a = (lo - o) / d, c = (hi - o) / d; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
      if (t0 > t1) return Infinity;
    }
    return inside ? Infinity : t0;
  }
}
