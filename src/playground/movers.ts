// Orbit 2 in motion: each tile of a plan moved along its movement, the pads and the pickups on it carried too, and the
// body that stands on it carried with it. The physics is the fair's own, unchanged: a tile is an ordinary box moved
// between steps; its rider is moved by the same sweep a step uses (moveBody), so a tile never carries a body into a
// wall; a body a rising tile meets from above is set on its top. The broad-phase grid is built over the room each tile
// may move through, so a tile away from home is still found. A change of plan (waking, a new seed on Again, sleep back
// to Orbit 1) settles the tiles home and then wakes the new movements: every moment of it is a moment of a plan scaled
// toward rest, so the air between tiles and the reach of every gap hold through it as they do in play.
import { buildGrid, moveBody, type Body, type Box, type World } from '../ceritera/game/physics';
import { v3 } from '../ceritera/game/v3';
import type { Course, Platform } from './course';
import { offsetAt, type Motion, type Off } from './motion';
import type { OrbitPlan, Slot } from './orbit';

/** How long the tiles take to wake into their movements, and to settle home from where they are (s). */
export const WAKE_S = 1.6, SLEEP_S = 1.0;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** How close under the feet a tile's top must be for the body to ride it (m). */
const ON = 0.03;
/** How far a rising tile may have come up into a body and still set it on its top (m). */
const LIFT = 0.45;
/** Touching a tile's side is not being inside it (m): a sweep stops a body exactly on a face. */
const TOUCH = 1e-3;

interface Part { box: Box; min: Off; max: Off }

export class Movers {
  /** Each slot's offset from home now, in slot order. */
  readonly now: Off[];
  /** Each pickup's slot when it rides a tile, else −1. */
  readonly riderOf: Int16Array;
  private parts: Part[][];
  private motions: (Motion | null)[];
  private from: Off[]; private at = 0; private settle = 0;
  private tmp: Off = { x: 0, y: 0, z: 0 }; private d: Off = { x: 0, y: 0, z: 0 };
  /** The slot the body rode on the last step (−1: none): for a jump's take-off and the camera. */
  riding = -1;

  /** `boxes`: the world's boxes as courseBoxes() made them (platforms first, then the pads). */
  constructor(readonly course: Course, readonly slots: readonly Slot[], boxes: Box[]) {
    const n = course.platforms.length;
    this.parts = slots.map((s) => [s.i, ...s.pads.map((j) => n + j)].map((k) => { const box = boxes[k]!; return { box, min: { ...box.min }, max: { ...box.max } }; }));
    this.now = slots.map(() => ({ x: 0, y: 0, z: 0 }));
    this.from = slots.map(() => ({ x: 0, y: 0, z: 0 }));
    this.motions = slots.map(() => null);
    this.riderOf = new Int16Array(course.pickups.length).fill(-1);
    slots.forEach((s, k) => { for (const j of s.riders) this.riderOf[j] = k; });
  }

  /** The broad phase over the room each tile may move through (the world's boxes, index for index, each moving one
   *  grown by its reach): a tile away from home is still found by every sweep and ray. */
  gridFor(world: World) {
    const n = this.course.platforms.length, grow = new Map<number, Off>();
    this.slots.forEach((s) => { const r = { x: s.bound.x + 0.1, y: s.bound.y + 0.1, z: s.bound.z + 0.1 }; grow.set(s.i, r); for (const j of s.pads) grow.set(n + j, r); });
    world.grid = buildGrid(world.boxes.map((b, k) => { const g = grow.get(k); return g ? { min: v3(b.min.x - g.x, b.min.y - g.y, b.min.z - g.z), max: v3(b.max.x + g.x, b.max.y + g.y, b.max.z + g.z), tag: b.tag } : b; }));
  }

  /** Play a plan from `t` (null: rest): the tiles settle home from wherever they are, then wake into it. */
  set(plan: OrbitPlan | null, t: number) {
    this.from = this.now.map((o) => ({ ...o })); this.at = t; this.settle = this.from.some((o) => o.x || o.y || o.z) ? SLEEP_S : 0;
    this.motions = plan ? plan.motions.slice() : this.slots.map(() => null);
  }
  /** Is anything moving, or still settling? */
  get awake(): boolean { return this.motions.some((m) => m) || this.now.some((o) => o.x || o.y || o.z); }

  /** Where slot `k` is at `t`: settling home from where it was when the plan changed, then its movement waking. */
  offset(k: number, t: number, out: Off): Off {
    const s = t - this.at, m = this.motions[k];
    if (s < this.settle) { const f = this.from[k]!, e = 1 - smooth(s / this.settle); out.x = f.x * e; out.y = f.y * e; out.z = f.z * e; return out; }
    if (!m) { out.x = 0; out.y = 0; out.z = 0; return out; }
    offsetAt(m, t, out); const e = smooth((s - this.settle) / WAKE_S); out.x *= e; out.y *= e; out.z *= e;
    return out;
  }

  /** The slot whose top the feet stand on (its slab or a pad on it), or −1. */
  under(b: Body): number {
    if (!b.grounded) return -1;
    const p = b.pos, r = b.radius;
    for (let k = 0; k < this.parts.length; k++) for (const { box } of this.parts[k]!) {
      if (Math.abs(p.y - box.max.y) <= ON && p.x + r > box.min.x && p.x - r < box.max.x && p.z + r > box.min.z && p.z - r < box.max.z) return k;
    }
    return -1;
  }

  /** One simulation step: every tile to where it is at `t`, the rider carried by its tile's move, a body a rising tile
   *  met set on its top. Called before the body's own step. */
  step(t: number, world: World, b: Body) {
    const rider = this.under(b); this.riding = rider;
    const P = this.course.platforms;
    for (let k = 0; k < this.slots.length; k++) {
      const o = this.offset(k, t, this.tmp), n = this.now[k]!, d = this.d;
      d.x = o.x - n.x; d.y = o.y - n.y; d.z = o.z - n.z;
      if (!d.x && !d.y && !d.z) continue;
      for (const { box, min, max } of this.parts[k]!) { box.min.x = min.x + o.x; box.min.y = min.y + o.y; box.min.z = min.z + o.z; box.max.x = max.x + o.x; box.max.y = max.y + o.y; box.max.z = max.z + o.z; }
      const h = this.slots[k]!.home, p: Platform = P[this.slots[k]!.i]!; p.x0 = h.x0 + o.x; p.x1 = h.x1 + o.x; p.y = h.y + o.y; p.z0 = h.z0 + o.z; p.z1 = h.z1 + o.z;
      n.x = o.x; n.y = o.y; n.z = o.z;
      if (k === rider) carry(world, b, d);
    }
    if (rider < 0) this.lift(b);
  }

  /** A body a tile has risen into from below its top by a little (a landing met by a rising tile): on the top. */
  private lift(b: Body) {
    const p = b.pos, r = b.radius;
    for (const parts of this.parts) for (const { box } of parts) {
      if (p.x + r <= box.min.x + TOUCH || p.x - r >= box.max.x - TOUCH || p.z + r <= box.min.z + TOUCH || p.z - r >= box.max.z - TOUCH) continue;
      const into = box.max.y - p.y;
      if (into > 0 && into <= LIFT && p.y + b.height > box.min.y) { p.y = box.max.y + 1e-4; if (b.vel.y < 0) b.vel.y = 0; b.grounded = true; b.groundTag = box.tag; }
    }
  }

  /** Where pickup `j` is now: its own place, moved by the tile it rides. */
  pickupAt(j: number, out: Off): Off {
    const k = this.riderOf[j]!, q = this.course.pickups[j]!;
    if (k < 0) { out.x = q.x; out.y = q.y; out.z = q.z; } else { const o = this.now[k]!; out.x = q.x + o.x; out.y = q.y + o.y; out.z = q.z + o.z; }
    return out;
  }
}

/** The rider moved with its tile: the same sweep as a step, on a borrowed velocity, colliding with everything but the
 *  tile under it (which has already moved), and the body's own flags and velocity given back. */
function carry(world: World, b: Body, d: Off) {
  const vel = b.vel, grounded = b.grounded, tag = b.groundTag, wall = b.wall, ceiling = b.ceiling, STEP = 1 / 60;
  b.vel = v3(d.x / STEP, d.y / STEP, d.z / STEP); moveBody(world, b, STEP, { step: 0, snap: false });
  b.vel = vel; b.grounded = grounded; b.groundTag = tag; b.wall = wall; b.ceiling = ceiling;
}
