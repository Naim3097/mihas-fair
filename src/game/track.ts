// Where an on-site player is, from three unequal witnesses: a QR scan (exact, now), their steps (good for a minute or
// two, then drifting), and GPS (always there, ~25 m off indoors). One position and one variance; each witness moves the
// position as far as its confidence allows. No browser APIs here, so it is tested with synthetic walks.
import type { P2 } from './nav';

/** An adult's walking step. Learned per person from the distance between two scans. */
export const STEP_M = 0.7;
/** Variance a step adds: stride length and heading are both a little off every time. */
const STEP_VAR = 0.35 ** 2;
/** Without step counting, a person may have walked anywhere: the position loosens by this much per second. */
const IDLE_VAR_PER_S = 2;
/** Right after a scan: the person is within about a metre of the poster. */
const ANCHOR_VAR = 1;
/** Indoor GPS error drifts slowly, so consecutive fixes are not independent: each counts for less than its accuracy says. */
const GPS_CORRELATION = 2;
/** Aisles run along the plan's axes: a heading this close to one is taken to be it. */
const AISLE_SNAP = (20 * Math.PI) / 180;
/** Learning from two scans needs a real walk between them, recently. */
const LEARN_MIN_M = 12, LEARN_MAX_MS = 5 * 60_000;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Plan angle (radians, counter-clockwise from +x) of a walk heading along the nearest aisle, if it is close to one. */
export function snapToAisle(a: number, tol = AISLE_SNAP): number {
  const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(wrap(a - q)) <= tol ? q : a;
}

/** Compass bearing (degrees clockwise from north) → plan angle, given how the plan is turned against north. */
export function bearingToPlan(bearingDeg: number, planRotDeg: number): number {
  return wrap(((90 - bearingDeg + planRotDeg) * Math.PI) / 180);
}

/**
 * Steps from the accelerometer: the magnitude of acceleration (gravity included) swings above and below 1 g once per
 * step. A step is a swing up past HIGH and back under LOW, no sooner than MIN_GAP after the last one.
 */
export class StepDetector {
  private smooth = 9.81; private high = false; private peak = 0; private lastStep = -Infinity;
  static readonly HIGH = 10.8; static readonly LOW = 9.9; static readonly MIN_GAP_MS = 280; static readonly MIN_SWING = 1.2;
  /** One sample: |acceleration| in m/s², at t ms. True when it completes a step. */
  sample(mag: number, t: number): boolean {
    this.smooth += 0.35 * (mag - this.smooth);
    const a = this.smooth;
    if (!this.high) { if (a > StepDetector.HIGH) { this.high = true; this.peak = a; } return false; }
    this.peak = Math.max(this.peak, a);
    if (a >= StepDetector.LOW) return false;
    this.high = false;
    if (t - this.lastStep < StepDetector.MIN_GAP_MS || this.peak - a < StepDetector.MIN_SWING) return false;
    this.lastStep = t; return true;
  }
  get lastStepAt() { return this.lastStep; }
}

/** Keeps a noisy compass steady: averages direction as a unit vector, so 359° and 1° average to 0°, not 180°. */
export class HeadingFilter {
  private c = 0; private s = 0; private has = false;
  push(deg: number, k = 0.2) {
    const r = (deg * Math.PI) / 180;
    if (!this.has) { this.c = Math.cos(r); this.s = Math.sin(r); this.has = true; return; }
    this.c += k * (Math.cos(r) - this.c); this.s += k * (Math.sin(r) - this.s);
  }
  /** Degrees clockwise from north, or null before the first reading. */
  get deg(): number | null { return this.has ? (((Math.atan2(this.s, this.c) * 180) / Math.PI) + 360) % 360 : null; }
}

export class Tracker {
  x = 0; y = 0; private P = Infinity;
  /** What the person's own compass and stride get wrong, learned between scans. */
  bias = 0; scale = 1;
  private last: { x: number; y: number; t: number } | null = null;
  /** Dead reckoning since the last scan with no learning applied: compared against the true walk at the next scan. */
  private raw = { x: 0, y: 0 };

  /** move clamps a step to where people can walk (the nav grid slides along walls instead of passing through booths). */
  constructor(private move: (p: P2, dx: number, dy: number) => P2 = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy })) {}

  get ready() { return Number.isFinite(this.P); }
  get sigma() { return Math.sqrt(this.P); }
  /** A scan within this long ago. */
  anchoredWithin(ms: number, t: number) { return !!this.last && t - this.last.t <= ms; }

  reset() { this.P = Infinity; this.last = null; this.raw = { x: 0, y: 0 }; }

  /** A QR scan: the person is right here. If they walked here from the last scan, learn their compass error and stride. */
  anchor(x: number, y: number, t: number) {
    const l = this.last;
    if (l && t - l.t <= LEARN_MAX_MS) {
      const tx = x - l.x, ty = y - l.y, tl = Math.hypot(tx, ty), rl = Math.hypot(this.raw.x, this.raw.y);
      if (tl >= LEARN_MIN_M && rl >= LEARN_MIN_M) {
        const turn = wrap(Math.atan2(ty, tx) - Math.atan2(this.raw.y, this.raw.x));
        if (Math.abs(turn) < Math.PI / 3) this.bias = wrap(this.bias * 0.5 + turn * 0.5);
        this.scale = Math.min(1.4, Math.max(0.7, this.scale * 0.5 + (tl / rl) * 0.5));
      }
    }
    this.x = x; this.y = y; this.P = ANCHOR_VAR; this.last = { x, y, t }; this.raw = { x: 0, y: 0 };
  }

  /** One step, heading `planAngle` straight from the compass. */
  step(planAngle: number) {
    if (!this.ready) return;
    this.raw.x += STEP_M * Math.cos(planAngle); this.raw.y += STEP_M * Math.sin(planAngle);
    const a = snapToAisle(planAngle + this.bias), len = STEP_M * this.scale;
    const p = this.move({ x: this.x, y: this.y }, len * Math.cos(a), len * Math.sin(a));
    this.x = p.x; this.y = p.y; this.P += STEP_VAR;
  }

  /** No step counter: time passing is all we know. */
  idle(dtS: number) { if (this.ready && dtS > 0) this.P += IDLE_VAR_PER_S * Math.min(dtS, 30); }

  /** A GPS position on the plan, sigma metres. Before anything else, it is the position. */
  gps(x: number, y: number, sigma: number) {
    const R = (sigma * GPS_CORRELATION) ** 2;
    if (!this.ready) { this.x = x; this.y = y; this.P = R; return; }
    const K = this.P / (this.P + R);
    this.x += K * (x - this.x); this.y += K * (y - this.y); this.P *= 1 - K;
  }
}
