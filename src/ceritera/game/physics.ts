// Collision for a hall made of boxes. Every wall, shelf, step and floor slab is an axis-aligned box, and every
// moving thing is a box too (a capsule's stand-in), moved one axis at a time and stopped at the first face it
// would enter: the method behind most block worlds, and enough for a library of shelves. Feet can climb anything
// lower than a step; a body walking off a step is snapped down so stairs feel like stairs. Deterministic,
// allocation-light and three.js-free, so it runs under node:test and reads the same in C++.
import { type V3, v3 } from './v3';

export interface Box { min: V3; max: V3; tag?: string }
/** A world is its boxes; with thousands of them (a fair) a grid over x and z says which few a body can touch. */
export interface World { boxes: Box[]; grid?: Grid }
export interface Grid { cell: number; x0: number; z0: number; cols: number; rows: number; cells: Int32Array[] }

/** Index the boxes by grid cell. Cells are square, `cell` metres on a side; a box is listed in every cell it covers. */
export function buildGrid(boxes: Box[], cell = 8): Grid {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z); }
  if (!boxes.length) { x0 = z0 = 0; x1 = z1 = cell; }
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), rows = Math.max(1, Math.ceil((z1 - z0) / cell) + 1);
  const lists: number[][] = Array.from({ length: cols * rows }, () => []);
  boxes.forEach((b, i) => {
    const cx0 = Math.floor((b.min.x - x0) / cell), cx1 = Math.min(cols - 1, Math.floor((b.max.x - x0) / cell));
    const cz0 = Math.floor((b.min.z - z0) / cell), cz1 = Math.min(rows - 1, Math.floor((b.max.z - z0) / cell));
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) lists[cz * cols + cx]!.push(i);
  });
  return { cell, x0, z0, cols, rows, cells: lists.map((l) => Int32Array.from(l)) };
}

const scratch: Box[] = [];
let marks = new Int32Array(0), stamp = 0;
/** The boxes that can meet a region of space: the grid's cells under it, or every box when there is no grid. */
function near(world: World, x0: number, z0: number, x1: number, z1: number): Box[] {
  const g = world.grid;
  if (!g) return world.boxes;
  scratch.length = 0;
  const cx0 = Math.max(0, Math.floor((x0 - g.x0) / g.cell)), cx1 = Math.min(g.cols - 1, Math.floor((x1 - g.x0) / g.cell));
  const cz0 = Math.max(0, Math.floor((z0 - g.z0) / g.cell)), cz1 = Math.min(g.rows - 1, Math.floor((z1 - g.z0) / g.cell));
  if (cx0 > cx1 || cz0 > cz1) return scratch;
  if (cx0 === cx1 && cz0 === cz1) { const l = g.cells[cz0 * g.cols + cx0]!; for (let k = 0; k < l.length; k++) scratch.push(world.boxes[l[k]!]!); return scratch; }
  // several cells: each box once, marked with a stamp that only changes, never clears
  if (marks.length < world.boxes.length) { marks = new Int32Array(world.boxes.length); stamp = 0; }
  if (++stamp === 0x7fffffff) { marks.fill(0); stamp = 1; }
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const l = g.cells[cz * g.cols + cx]!;
    for (let k = 0; k < l.length; k++) { const i = l[k]!; if (marks[i] !== stamp) { marks[i] = stamp; scratch.push(world.boxes[i]!); } }
  }
  return scratch;
}

export interface Body {
  /** The feet: centre of the footprint, on the ground when standing. */
  pos: V3;
  vel: V3;
  radius: number;
  height: number;
  grounded: boolean;
  /** The tag of what the feet stand on, for footsteps and for what a slam hits. */
  groundTag: string | undefined;
  /** Outward normal of a wall touched this step, for wall kicks; null when nothing was touched. */
  wall: V3 | null;
  ceiling: boolean;
}

export interface MoveOptions {
  /** How high a ledge the feet climb without a jump. */
  step: number;
  /** Keep the feet on the ground when walking off a step (not while jumping). */
  snap: boolean;
}

export interface RayHit { t: number; box: Box; normal: V3 }

const EPS = 1e-4;
/** The longest move along one axis in one pass: a faster body is moved in pieces so it never skips a wall. */
const MAX_PASS = 0.25;
/** How far below the feet the floor may be and still count as stood on. */
const REST_PROBE = 0.002;

export const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag?: string): Box => ({
  min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
  max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
  tag,
});

export const newBody = (pos: V3, radius: number, height: number): Body => ({ pos, vel: v3(), radius, height, grounded: false, groundTag: undefined, wall: null, ceiling: false });

type Axis = 'x' | 'y' | 'z';

/** Does the body's (slightly shrunk) box enter any world box? */
export function overlapsAny(world: World, b: Body): boolean {
  const r = b.radius, p = b.pos;
  const x0 = p.x - r + EPS, x1 = p.x + r - EPS, y0 = p.y + EPS, y1 = p.y + b.height - EPS, z0 = p.z - r + EPS, z1 = p.z + r - EPS;
  for (const bx of near(world, x0, z0, x1, z1)) {
    if (bx.max.x <= x0 || bx.min.x >= x1 || bx.max.y <= y0 || bx.min.y >= y1 || bx.max.z <= z0 || bx.min.z >= z1) continue;
    return true;
  }
  return false;
}

/** Move the body by `d` along one axis, stopping at the first face in the way. Returns what stopped it. */
function sweep(world: World, b: Body, axis: Axis, d: number): Box | null {
  if (d === 0) return null;
  const r = b.radius, p = b.pos;
  const x0 = p.x - r + EPS, x1 = p.x + r - EPS, y0 = p.y + EPS, y1 = p.y + b.height - EPS, z0 = p.z - r + EPS, z1 = p.z + r - EPS;
  const lead = axis === 'x' ? (d > 0 ? p.x + r : p.x - r) : axis === 'z' ? (d > 0 ? p.z + r : p.z - r) : d > 0 ? p.y + b.height : p.y;
  let limit = lead + d, best: Box | null = null;
  const reach = Math.abs(d) + r;
  for (const bx of near(world, p.x - reach, p.z - reach, p.x + reach, p.z + reach)) {
    if (axis !== 'x' && (bx.max.x <= x0 || bx.min.x >= x1)) continue;
    if (axis !== 'y' && (bx.max.y <= y0 || bx.min.y >= y1)) continue;
    if (axis !== 'z' && (bx.max.z <= z0 || bx.min.z >= z1)) continue;
    if (d > 0) { const face = bx.min[axis]; if (face >= lead - EPS && face < limit) { limit = face; best = bx; } }
    else { const face = bx.max[axis]; if (face <= lead + EPS && face > limit) { limit = face; best = bx; } }
  }
  p[axis] += limit - lead;
  return best;
}

/**
 * Advance the body by its velocity for `dt`. Horizontal axes first (with step-ups), then vertical; the flags on the
 * body say what it touched. Velocity into a wall, floor or ceiling is cancelled. A body that did not move
 * vertically is still checked for the floor under its feet, so resting bodies stay grounded.
 */
export function moveBody(world: World, b: Body, dt: number, o: MoveOptions): void {
  const dx = b.vel.x * dt, dy = b.vel.y * dt, dz = b.vel.z * dt;
  const passes = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / MAX_PASS));
  const wasGrounded = b.grounded;
  let grounded = false, groundTag: string | undefined;
  b.wall = null;
  b.ceiling = false;
  for (let i = 0; i < passes; i++) {
    for (const axis of ['x', 'z'] as const) {
      const d = (axis === 'x' ? dx : dz) / passes;
      if (d === 0) continue;
      const start = b.pos[axis];
      const hit = sweep(world, b, axis, d);
      if (!hit) continue;
      let stepped = false;
      if ((wasGrounded || grounded) && b.vel.y <= 0.01) {
        const rise = hit.max.y - b.pos.y;
        if (rise > EPS && rise <= o.step + EPS) {
          const y0 = b.pos.y, atWall = b.pos[axis];
          b.pos.y = hit.max.y + EPS;
          if (!overlapsAny(world, b) && !sweep(world, b, axis, start + d - atWall)) { stepped = true; grounded = true; groundTag = hit.tag; }
          else { b.pos.y = y0; b.pos[axis] = atWall; }
        }
      }
      if (!stepped) {
        b.wall = axis === 'x' ? v3(-Math.sign(d), 0, 0) : v3(0, 0, -Math.sign(d));
        b.vel[axis] = 0;
      }
    }
    const dyi = dy / passes;
    if (dyi !== 0) {
      const hit = sweep(world, b, 'y', dyi);
      if (hit) {
        if (dyi < 0) { grounded = true; groundTag = hit.tag; } else b.ceiling = true;
        b.vel.y = 0;
      }
    }
  }
  if (!grounded && b.vel.y <= 0) {
    const probe = wasGrounded && o.snap ? o.step : REST_PROBE;
    const y0 = b.pos.y;
    const hit = sweep(world, b, 'y', -probe);
    if (hit) { grounded = true; groundTag = hit.tag; b.vel.y = 0; } else b.pos.y = y0;
  }
  b.grounded = grounded;
  b.groundTag = grounded ? groundTag : undefined;
}

/** The first box along a ray, with the face it entered. `dir` is unit length. */
export function raycast(world: World, from: V3, dir: V3, maxDist: number): RayHit | null {
  let best: RayHit | null = null, tBest = maxDist;
  const ex = from.x + dir.x * maxDist, ez = from.z + dir.z * maxDist;
  for (const bx of near(world, Math.min(from.x, ex), Math.min(from.z, ez), Math.max(from.x, ex), Math.max(from.z, ez))) {
    let tmin = 0, tmax = tBest, nAxis: Axis = 'x', nSign = 0, miss = false;
    for (const axis of ['x', 'y', 'z'] as const) {
      const o = from[axis], dd = dir[axis];
      if (Math.abs(dd) < 1e-9) { if (o < bx.min[axis] || o > bx.max[axis]) { miss = true; break; } continue; }
      let t1 = (bx.min[axis] - o) / dd, t2 = (bx.max[axis] - o) / dd, sign = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sign = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = sign; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { miss = true; break; }
    }
    if (miss || tmin >= tBest || nSign === 0) continue;
    tBest = tmin;
    best = { t: tmin, box: bx, normal: v3(nAxis === 'x' ? nSign : 0, nAxis === 'y' ? nSign : 0, nAxis === 'z' ? nSign : 0) };
  }
  return best;
}

/** Is there a clear line between two points? Used for lock-on and for the camera. */
export function lineClear(world: World, a: V3, b: V3): boolean {
  const d = v3(b.x - a.x, b.y - a.y, b.z - a.z), l = Math.hypot(d.x, d.y, d.z);
  if (l < 1e-6) return true;
  return !raycast(world, a, v3(d.x / l, d.y / l, d.z / l), l);
}
