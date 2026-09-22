// The third-person camera: an orbit behind the avatar that follows with a little lag, looks ahead along the
// velocity, pulls in when a shelf or column is in the way (and eases back out), turns toward a locked target,
// widens on a sprint or a dash, and shakes when something lands hard. The pull-in is worked out from five rays
// (the centre and a whisker each side, above and below), so a post or a corner beside the view pulls the camera
// in before it is cut through.
import * as THREE from 'three';
import { raycast, type World } from './physics';
import { clamp, damp, angleDiff, type V3 } from './v3';

export class CameraRig {
  yaw = 0;
  pitch = 0.3;
  dist = 4.8;
  private curDist = 4.8;
  private kickFov = 0;
  private shakeAmp = 0;
  private ahead = new THREE.Vector3();
  private target = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private side = new THREE.Vector3();
  private from = { x: 0, y: 0, z: 0 };
  /** The field of view at rest; the screen sets it (a phone held upright wants a wider one). */
  baseFov = 55;

  constructor(readonly camera: THREE.PerspectiveCamera, private world: World) {}

  turn(dx: number, dy: number): void {
    this.yaw -= dx * 0.0024;
    this.pitch = clamp(this.pitch + dy * 0.0022, -0.4, 1.15);
  }
  zoom(wheel: number): void { this.dist = clamp(this.dist * Math.exp(wheel * 0.0012), 2.2, 8); }
  kick(fov: number): void { this.kickFov = Math.max(this.kickFov, fov); }
  shake(amp: number): void { this.shakeAmp = Math.max(this.shakeAmp, amp); }

  /** How far back from the target the camera can go along `dir` before something is in the way: the shortest of
   *  five rays, the centre and whiskers 0.3 m either side and 0.25 m above and below, so a corner at the edge of the
   *  frame counts as much as a wall in the middle. */
  private clearance(dir: THREE.Vector3): number {
    const t = this.target, d = { x: dir.x, y: dir.y, z: dir.z }, reach = this.dist + 0.35, side = this.side.set(dir.z, 0, -dir.x).normalize();
    let best = reach;
    for (const [sx, uy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.25], [0, -0.25]] as const) {
      const f = this.from; f.x = t.x + side.x * sx; f.y = t.y + uy; f.z = t.z + side.z * sx;
      const hit = raycast(this.world, f, d, best);
      if (hit && hit.t < best) best = hit.t;
    }
    return best;
  }

  /** Put the camera behind the avatar for the start of a session. */
  snapBehind(yaw: number): void { this.yaw = yaw; this.curDist = this.dist; }

  update(dt: number, feet: V3, vel: V3, lockAt: V3 | null, sprinting: boolean): void {
    if (lockAt) {
      const want = Math.atan2(lockAt.x - feet.x, lockAt.z - feet.z);
      this.yaw += angleDiff(this.yaw, want) * (1 - Math.exp(-5 * dt));
      this.pitch = damp(this.pitch, 0.22, 4, dt);
    }
    // the point the camera looks at: the chest, plus a little of where the avatar is going
    const k = 1 - Math.exp(-4 * dt);
    this.ahead.x += (vel.x * 0.14 - this.ahead.x) * k;
    this.ahead.z += (vel.z * 0.14 - this.ahead.z) * k;
    this.target.set(feet.x + this.ahead.x, feet.y + 1.35, feet.z + this.ahead.z);
    // where the camera wants to be, and how far it can actually go
    const cp = Math.cos(this.pitch);
    const dir = this.tmp.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const want = Math.max(0.7, this.clearance(dir) - 0.35);
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 3, dt);
    const pos = this.camera.position;
    pos.copy(this.target).addScaledVector(dir, this.curDist);
    if (this.shakeAmp > 0) {
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 2.2);
      const a = this.shakeAmp * 0.14;
      pos.x += (Math.random() - 0.5) * a; pos.y += (Math.random() - 0.5) * a; pos.z += (Math.random() - 0.5) * a;
    }
    this.lookAt.copy(this.target);
    if (lockAt) this.lookAt.lerp(new THREE.Vector3(lockAt.x, lockAt.y + 1.2, lockAt.z), 0.25);
    this.camera.lookAt(this.lookAt);
    this.kickFov = damp(this.kickFov, 0, 5, dt);
    const fov = this.baseFov + (sprinting ? 7 : 0) + this.kickFov;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = damp(this.camera.fov, fov, 8, dt); this.camera.updateProjectionMatrix(); }
  }
}
