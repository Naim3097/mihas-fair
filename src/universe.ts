// One universe. The Playground's course floats over the fair, its pad straight above the X's dock, under the same sky
// and the same sun, with nothing turned between them: a view from above the pad is the same view in either world.
// Every trip between places is one move, a ride: the body lifts, the camera rises, crosses and comes down. Going up
// to the Playground ends on that shared view and cuts there, so the change of world does not show; Warp is the same
// ride from one booth to another, without leaving the fair.
import type { LevelData } from '../shared/types';
import { toWorld } from './fair/level';

/** How high the pad floats over the fair's floor (m): above every checkpoint's column of light, which tops out near 48. */
export const SKY_Y = 56;
/** Where the pad's centre is from the X's dock, across the floor (m): the way up rises from the dock just past the pad's
 *  west edge, beside its portal, so nothing rides up through a platform; the course runs on east from the pad. */
export const PAD_FROM_DOCK = { x: 11, z: 5 } as const;
/** The view at the top of a ride up: behind the pad and above it, facing east along the course, as the Playground's
 *  camera faces on the pad. Both worlds start or end their half of the ride here. */
export const SKY_VIEW = { dist: 14, pitch: 0.62, yaw: Math.PI / 2 } as const;

export interface P3 { x: number; y: number; z: number }

/** The pad's centre (the Playground's origin) in the fair's world, over the X. The course's own axes are the fair's, so
 *  a point on the course is this plus its metres. */
export function skyAnchor(level: Pick<LevelData, 'hero'>): P3 {
  const d = toWorld(level.hero.dock.x, level.hero.dock.y, 0);
  return { x: d.x + PAD_FROM_DOCK.x, y: SKY_Y, z: d.z + PAD_FROM_DOCK.z };
}

/** A trip from `from` to `to` over `s` seconds. `arc`: how far above the end it passes. `rise`: the share of the trip
 *  spent going straight up before it crosses (0: one arc all the way, as a warp from booth to booth). */
export interface Ride { from: P3; to: P3; arc: number; s: number; rise?: number }

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** Where the ride is at `k` ∈ [0, 1]. With `rise`: straight up to `arc` over the end's height, then across and down
 *  onto it (the way up to the Playground). Without: across on an ease in and out, up on an ease out, the arc on top, so
 *  a trip between two booths climbs over the partitions and comes down at the other end. */
export function ridePoint(r: Ride, k: number, out: P3): P3 {
  const c = Math.min(1, Math.max(0, k));
  if (r.rise) {
    const up = easeOut(Math.min(1, c / r.rise)), across = easeInOut(Math.max(0, (c - r.rise) / (1 - r.rise)));
    out.x = r.from.x + (r.to.x - r.from.x) * across;
    out.z = r.from.z + (r.to.z - r.from.z) * across;
    out.y = r.from.y + (r.to.y + r.arc - r.from.y) * up - r.arc * across;
    return out;
  }
  const h = easeInOut(c), v = easeOut(c);
  out.x = r.from.x + (r.to.x - r.from.x) * h;
  out.z = r.from.z + (r.to.z - r.from.z) * h;
  out.y = r.from.y + (r.to.y - r.from.y) * v + r.arc * Math.sin(Math.PI * c);
  return out;
}

/** How the camera's distance, tilt and heading go over a ride: eased from where they were to where they end, pulled back
 *  and tipped down in the middle (`wide`, `tip`) so the way is seen from above. */
export function rideView(from: { dist: number; pitch: number; yaw: number }, to: { dist: number; pitch: number; yaw: number }, k: number, wide: number, tip: number): { dist: number; pitch: number; yaw: number } {
  const c = Math.min(1, Math.max(0, k)), e = easeInOut(c), mid = Math.sin(Math.PI * c);
  let dy = (to.yaw - from.yaw) % (2 * Math.PI); if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
  return { dist: from.dist + (to.dist - from.dist) * e + wide * mid, pitch: from.pitch + (to.pitch - from.pitch) * e + tip * mid, yaw: from.yaw + dy * e };
}

/** How long a ride takes: a second and a half, a little more for a longer or a higher way, never dragging. */
export const rideSeconds = (from: P3, to: P3): number => Math.min(2.4, 1.3 + Math.hypot(to.x - from.x, to.z - from.z) / 140 + Math.abs(to.y - from.y) / 120);
