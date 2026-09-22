// Walking somewhere on its own: a tap on the floor, "Take me there", the way to a seat. The follower turns the next
// node of a route into the push a thumb would give the controller (camera-relative), at a jog rather than a sprint,
// with the last step at a walk so the body stops where it was sent. When the body is pressed against something the
// grid did not know about, it plans again from where it is; after three of those it gives up rather than run on the
// spot. No screen, no DOM: the same code runs under a test.
import type { Intent } from '../ceritera/game/controller';
import { fromYaw } from '../ceritera/game/v3';
import type { NavGrid, P2 } from '../game/nav';

/** Reaching a node (m), reaching the last one, and the walk-in distance before it. */
const NODE_R = 0.5, END_R = 0.35, WALK_IN = 1.2;
/** Stuck: slower than this for this long, then plan again; this many times, then give up. */
const STALL_SPEED = 0.3, STALL_S = 0.6, REPLANS = 3;

export type Step = 'idle' | 'moving' | 'arrived' | 'lost';

export class RouteFollower {
  private route: P2[] = [];
  private end: P2 | null = null;
  private stall = 0; private replans = 0;

  constructor(private nav: NavGrid) {}

  get active(): boolean { return this.route.length > 0; }
  /** Where the route ends, while there is one. */
  get goal(): P2 | null { return this.end; }

  /** Take a path as `NavGrid.path` returns it (it starts where the body is). False when there is none. */
  set(path: P2[] | null): boolean {
    if (!path || path.length < 2) { this.clear(); return false; }
    this.route = path.slice(1); this.end = path[path.length - 1]!; this.stall = 0; this.replans = 0;
    return true;
  }

  clear(): void { this.route = []; this.end = null; this.stall = 0; this.replans = 0; }

  /** Fill in this frame's move. `camYaw` is the camera's (the controller reads a push relative to it); `speed` is
   *  the body's over the floor. */
  step(it: Intent, pos: P2, camYaw: number, speed: number, dt: number): Step {
    if (!this.route.length) return 'idle';
    let n = this.route[0]!, dx = n.x - pos.x, dy = n.y - pos.y, l = Math.hypot(dx, dy);
    if (l < (this.route.length === 1 ? END_R : NODE_R)) {
      this.route.shift(); this.stall = 0;
      if (!this.route.length) { this.end = null; return 'arrived'; }
      n = this.route[0]!; dx = n.x - pos.x; dy = n.y - pos.y; l = Math.hypot(dx, dy) || 1e-6;
    }
    // plan (x east, y north) → world (x, −z) → screen (x right, y forward)
    const wx = dx / l, wz = -dy / l, f = fromYaw(camYaw), r = fromYaw(camYaw - Math.PI / 2);
    it.move.x = wx * r.x + wz * r.z; it.move.y = wx * f.x + wz * f.z;
    it.sprint = false; it.walk = this.route.length === 1 && l < WALK_IN;
    if (speed < STALL_SPEED) {
      this.stall += dt;
      if (this.stall > STALL_S) {
        this.stall = 0;
        const path = ++this.replans > REPLANS || !this.end ? null : this.nav.path(pos, this.end);
        if (!path || path.length < 2) { this.clear(); return 'lost'; }
        this.route = path.slice(1);
      }
    } else this.stall = 0;
    return 'moving';
  }
}
