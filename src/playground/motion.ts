// How Orbit 2's tiles move: a small grammar, not a list. A shape says how a tile goes and comes back over one cycle (a
// smooth sway, a steady glide, a rest at each end, a piston's snap, a spring's ring…); a path says where it goes (along
// the course, across it, up and down, round a circle, a figure of eight…). Twelve shapes by eleven paths are 132
// candidates; each is fitted (how far, how fast) and kept only if a tile doing it stays readable: never faster than a
// walking body can correct, and near home for part of every cycle. The catalogue is what passes. A movement is a pure
// function of time, so the physics, the drawing and the tests all ask the same question and get the same answer.

const TAU = Math.PI * 2;
const smooth = (t: number) => t * t * (3 - 2 * t);

export type ShapeKey = 'sine' | 'triangle' | 'dwell' | 'piston' | 'conveyor' | 'hopper' | 'spring' | 'stepper' | 'drift' | 'pulse' | 'swing' | 'heartbeat';
type Shape = (u: number) => number;
/** A shape scaled so its furthest point is exactly 1 either way: a movement's reach is never exceeded. */
const unit = (f: Shape): Shape => { let m = 0; for (let i = 0; i < 2000; i++) m = Math.max(m, Math.abs(f(i / 2000))); return (u) => Math.max(-1, Math.min(1, f(u) / m)); };
/** A shape: the phase u ∈ [0, 1) to [−1, 1]. Periodic and continuous: a tile never jumps. */
const RAW: Record<ShapeKey, Shape> = {
  /** the plain sway */
  sine: (u) => Math.sin(TAU * u),
  /** a steady glide, turning at the ends */
  triangle: (u) => (u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4),
  /** a rest at each end, a smooth move between */
  dwell: (u) => (u < 0.25 ? -1 : u < 0.5 ? -1 + 2 * smooth((u - 0.25) / 0.25) : u < 0.75 ? 1 : 1 - 2 * smooth((u - 0.75) / 0.25)),
  /** long rests, a quick snap between */
  piston: (u) => (u < 0.4 ? -1 : u < 0.5 ? -1 + 2 * smooth((u - 0.4) / 0.1) : u < 0.9 ? 1 : 1 - 2 * smooth((u - 0.9) / 0.1)),
  /** out slowly, back quickly */
  conveyor: (u) => (u < 0.8 ? -1 + 2 * smooth(u / 0.8) : 1 - 2 * smooth((u - 0.8) / 0.2)),
  /** a bounce: quick at the floor of its travel, slow at the top */
  hopper: (u) => 2 * Math.abs(Math.sin(Math.PI * u)) - 1,
  /** plucked, it rings down to rest */
  spring: (u) => Math.sin(TAU * 3 * u) * Math.exp(-4 * u),
  /** four stops, a smooth step between each */
  stepper: (u) => { const k = u * 4, i = Math.min(3, Math.floor(k)), f = k - i, a = [-1, -1 / 3, 1 / 3, 1][i]!, b = [-1 / 3, 1 / 3, 1, -1][i]!; return f < 0.6 ? a : a + (b - a) * smooth((f - 0.6) / 0.4); },
  /** three sways at once: smooth, and never quite the same twice in a cycle */
  drift: (u) => Math.sin(TAU * u) + 0.5 * Math.sin(TAU * 2 * u + 1.3) + 0.25 * Math.sin(TAU * 3 * u + 2.1),
  /** a quick out-and-back, then a long rest */
  pulse: (u) => (u < 0.15 ? -1 + 2 * smooth(u / 0.15) : u < 0.3 ? 1 - 2 * smooth((u - 0.15) / 0.15) : -1),
  /** a pendulum: it lingers at the ends */
  swing: (u) => Math.sin(TAU * u) * (1 - 0.35 * Math.cos(TAU * 2 * u)),
  /** two beats, then a rest */
  heartbeat: (u) => { const beat = (c: number) => Math.exp(-((u - c) ** 2) / 0.0025); return Math.min(1, 2 * (beat(0.2) + 0.7 * beat(0.35)) - 1); },
};
export const SHAPES = Object.fromEntries((Object.keys(RAW) as ShapeKey[]).map((k) => [k, unit(RAW[k])])) as Record<ShapeKey, Shape>;

export type PathKey = 'x' | 'z' | 'y' | 'xy' | 'zy' | 'orbitXZ' | 'wheelXY' | 'eightXZ' | 'eightZY' | 'diagXZ' | 'lissXY';
type Axis = 0 | 1 | 2;
/** A path: which wave drives each axis (1 the shape, 2 its second value, 0 still), how much of a movement's reach each
 *  axis takes, and how the second value is had: a quarter cycle on (a circle) or twice as fast (a figure of eight). */
export interface PathDef { x: Axis; y: Axis; z: Axis; w: { x: number; y: number; z: number }; second?: 'quarter' | 'double' }
export const PATHS: Record<PathKey, PathDef> = {
  /** along the course: the gaps open and close */
  x: { x: 1, y: 0, z: 0, w: { x: 1, y: 0, z: 0 } },
  /** across the course: the landing slides aside */
  z: { x: 0, y: 0, z: 1, w: { x: 0, y: 0, z: 1 } },
  /** up and down: the step changes height */
  y: { x: 0, y: 1, z: 0, w: { x: 0, y: 0.6, z: 0 } },
  xy: { x: 1, y: 1, z: 0, w: { x: 0.7, y: 0.4, z: 0 } },
  zy: { x: 0, y: 1, z: 1, w: { x: 0, y: 0.4, z: 0.7 } },
  /** round a flat circle */
  orbitXZ: { x: 1, y: 0, z: 2, w: { x: 0.7, y: 0, z: 0.7 }, second: 'quarter' },
  /** round an upright circle, the tile kept level: a Ferris wheel's car */
  wheelXY: { x: 1, y: 2, z: 0, w: { x: 0.6, y: 0.4, z: 0 }, second: 'quarter' },
  eightXZ: { x: 1, y: 0, z: 2, w: { x: 0.6, y: 0, z: 0.6 }, second: 'double' },
  eightZY: { x: 0, y: 2, z: 1, w: { x: 0, y: 0.35, z: 0.7 }, second: 'double' },
  diagXZ: { x: 1, y: 0, z: 1, w: { x: 0.5, y: 0, z: 0.8 } },
  /** a Lissajous: along, and up and down twice as fast */
  lissXY: { x: 1, y: 2, z: 0, w: { x: 0.6, y: 0.35, z: 0 }, second: 'double' },
};

export interface Off { x: number; y: number; z: number }
/** A movement as a tile does it: a shape on a path, its reach on each axis (m), its cycle (s) and where in it it starts. */
export interface Motion { shape: ShapeKey; path: PathKey; amp: Off; period: number; phase: number }

/** Where a movement has the tile at `t` seconds, from its home. Nothing is allocated. */
export function offsetAt(m: Motion, t: number, out: Off): Off {
  const u = (((t / m.period + m.phase) % 1) + 1) % 1, f = SHAPES[m.shape], p = PATHS[m.path];
  const a = f(u), b = p.second === 'quarter' ? f((u + 0.25) % 1) : p.second === 'double' ? f((2 * u) % 1) : a;
  out.x = p.x === 1 ? a * m.amp.x : p.x === 2 ? b * m.amp.x : 0;
  out.y = p.y === 1 ? a * m.amp.y : p.y === 2 ? b * m.amp.y : 0;
  out.z = p.z === 1 ? a * m.amp.z : p.z === 2 ? b * m.amp.z : 0;
  return out;
}

const SAMPLES = 240;
const tmp: Off = { x: 0, y: 0, z: 0 };
/** The fastest the tile goes over a cycle (m/s), and how long in a cycle it is near home (s): within 0.35 m along the
 *  course and 0.25 m up or down (sideways does not change a jump). */
export function measure(m: Motion): { vmax: number; home: number } {
  let vmax = 0, near = 0, px = 0, py = 0, pz = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const o = offsetAt({ ...m, phase: 0 }, (i / SAMPLES) * m.period, tmp);
    if (i) vmax = Math.max(vmax, Math.hypot(o.x - px, o.y - py, o.z - pz) / (m.period / SAMPLES));
    if (i < SAMPLES && Math.abs(o.x) <= 0.35 && Math.abs(o.y) <= 0.25) near++;
    px = o.x; py = o.y; pz = o.z;
  }
  return { vmax, home: (near / SAMPLES) * m.period };
}

/** The fastest a catalogued movement may be (m/s): under a walk (1.6) plus a step's correction, well under a run (4.4). */
export const VMAX = 2.6;
/** The cycles a movement may have (s): quick enough to read as motion, slow enough to be learned in a run. */
export const PERIOD = { min: 1.8, max: 7 } as const;
/** The least time near home in a cycle (s): every tile rests near where it belongs for part of every cycle. */
export const HOME_S = 0.45;

export interface Program { id: string; shape: ShapeKey; path: PathKey; /** its reach, before a path's weights */ reach: number; period: number; vmax: number; home: number; difficulty: number }

const SHARP = new Set<ShapeKey>(['piston', 'pulse', 'stepper', 'heartbeat', 'hopper', 'spring']);
/** A movement's reach on each axis: its reach by the path's weights, scaled. */
export const ampOf = (path: PathKey, reach: number, k = 1): Off => { const w = PATHS[path].w; return { x: w.x * reach * k, y: w.y * reach * k, z: w.z * reach * k }; };

/** Fit a shape on a path: the largest reach (1.2 m down to 0.6) and the quickest cycle for it under VMAX with a rest
 *  near home each cycle. Speed scales as reach over period, so each reach is measured once, at a one-second cycle. */
function fit(shape: ShapeKey, path: PathKey): Program | null {
  for (const reach of [1.2, 1.0, 0.8, 0.6]) {
    const unit = measure({ shape, path, amp: ampOf(path, reach), period: 1, phase: 0 }); // vmax at a 1 s cycle; home as a share of it
    const period = Math.max(PERIOD.min, unit.vmax / VMAX);
    if (period > PERIOD.max || unit.home * period < HOME_S) continue;
    const vmax = unit.vmax / period, home = unit.home * period;
    const d = 0.35 * (vmax / VMAX) + 0.2 * (PERIOD.min / period) + 0.15 * (1 - Math.min(1, home / period / 0.5)) + (SHARP.has(shape) ? 0.15 : 0) + (PATHS[path].y ? 0.1 : 0) + ([PATHS[path].x, PATHS[path].y, PATHS[path].z].filter(Boolean).length > 1 ? 0.05 : 0);
    return { id: `${shape}·${path}`, shape, path, reach, period, vmax, home, difficulty: Math.min(1, d) };
  }
  return null;
}

/** Every movement that passes: the vocabulary Orbit 2 draws each run's tiles from. */
export const CATALOGUE: readonly Program[] = (Object.keys(SHAPES) as ShapeKey[]).flatMap((s) => (Object.keys(PATHS) as PathKey[]).map((p) => fit(s, p)).filter((x): x is Program => !!x));
