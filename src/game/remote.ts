// How other people move on your screen. Their position reaches you every couple of seconds; drawn naively that is a
// figure that lurches toward each new point and brakes. Instead every update opens a segment — from wherever the figure
// is drawn right now to the new point — walked at constant speed over the time updates take to arrive. They are shown
// one update late and perfectly smooth: the same trade every multiplayer game makes.

export interface Snap { t: number; x: number; y: number; h: number; /** metres above the floor (a jetpack); absent = on the ground */ z?: number }
const turn = (from: number, to: number, k: number) => { const d = Math.atan2(Math.sin(to - from), Math.cos(to - from)); return from + d * k; };

export class RemoteTrack {
  x: number; y: number; h: number;
  /** metres above the floor, carried along the segment like x and y */
  z: number;
  /** metres per second along the current segment; 0 when standing */
  speed = 0;
  /** metres per second up (+) or down (−) along the segment; 0 when level */
  vz = 0;
  /** how fast the body is turning, radians per second (left positive), for the lean on skates */
  turnRate = 0;
  private from: Snap; private to: Snap; private span = 2000; private lastAt: number;

  constructor(s: Snap) { this.x = s.x; this.y = s.y; this.h = s.h; this.z = s.z ?? 0; this.from = this.to = s; this.lastAt = s.t; } // arrives airborne if it is airborne

  /** A new position arrived at time s.t (our clock). */
  push(s: Snap) {
    const gap = s.t - this.lastAt; this.lastAt = s.t;
    if (gap > 250) this.span = Math.min(4000, Math.max(600, this.span * 0.5 + gap * 0.5)); // learn their rhythm, ignore bursts
    const d = Math.hypot(s.x - this.x, s.y - this.y);
    if (d > 28) { this.x = s.x; this.y = s.y; this.h = s.h; this.z = s.z ?? 0; this.from = this.to = s; return; } // took a lift, or just arrived: no sliding across the hall
    this.from = { t: s.t, x: this.x, y: this.y, h: this.h, z: this.z }; this.to = s;
  }

  /** Put a seated or anchored figure exactly where they are. */
  place(s: Snap) { this.x = s.x; this.y = s.y; this.h = s.h; this.z = s.z ?? 0; this.from = this.to = s; this.lastAt = s.t; this.speed = 0; this.vz = 0; }

  /** Advance to `now`; dt in seconds is only used to ease the turn. */
  step(now: number, dt: number) {
    const len = Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y), k = Math.min(1, Math.max(0, (now - this.from.t) / this.span));
    this.x = this.from.x + (this.to.x - this.from.x) * k; this.y = this.from.y + (this.to.y - this.from.y) * k;
    const z0 = this.from.z ?? 0, dz = (this.to.z ?? 0) - z0; this.z = z0 + dz * k; this.vz = k < 1 && Math.abs(dz) > 0.05 ? dz / (this.span / 1000) : 0;
    const moving = len > 0.25 && k < 1; this.speed = moving ? len / (this.span / 1000) : 0;
    // walking: face where you are going; standing: face where they said they were facing
    const want = moving ? Math.atan2(this.to.x - this.from.x, -(this.to.y - this.from.y)) : this.to.h;
    const before = this.h; this.h = turn(this.h, want, Math.min(1, dt * 9));
    this.turnRate = dt > 0 ? Math.atan2(Math.sin(this.h - before), Math.cos(this.h - before)) / dt : 0;
  }
}
