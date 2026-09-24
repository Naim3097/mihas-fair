// Platforms as both worlds draw them: an ink slab, a white top a hair smaller, so an edge reads from above and from
// the side. Two instanced meshes for any number of them. The Playground draws its course with these; the fair draws
// the same course in its sky, so the view at the top of a ride is the same in either world; Orbit 2 moves them.
import * as THREE from 'three';
import { SLAB, type Platform } from './course';
import { FAIR } from '../fair/palette';

const INK = 0x1b2130, WHITE = 0xffffff;

export class Slabs {
  readonly slab: THREE.InstancedMesh;
  readonly top: THREE.InstancedMesh;
  private M = new THREE.Matrix4();

  constructor(n: number) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.slab = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: INK }), n);
    this.top = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: WHITE }), n);
  }

  /** Platform `i` where `p` says, moved by (ox, oy, oz): the fair's sky puts the course over the X this way. */
  set(i: number, p: Platform, ox = 0, oy = 0, oz = 0) {
    const M = this.M, cx = (p.x0 + p.x1) / 2 + ox, cz = (p.z0 + p.z1) / 2 + oz;
    M.makeScale(p.x1 - p.x0 + 0.2, SLAB - 0.05, p.z1 - p.z0 + 0.2).setPosition(cx, p.y + oy - 0.05 - (SLAB - 0.05) / 2, cz); this.slab.setMatrixAt(i, M);
    M.makeScale(p.x1 - p.x0, 0.05, p.z1 - p.z0).setPosition(cx, p.y + oy - 0.025, cz); this.top.setMatrixAt(i, M);
  }

  /** After a batch of set(): upload them. */
  commit() { this.slab.instanceMatrix.needsUpdate = true; this.top.instanceMatrix.needsUpdate = true; }

  /** Every platform placed once, with its bounds for culling, grown so a tile moving across its room stays inside them. */
  fill(P: Platform[], ox = 0, oy = 0, oz = 0) {
    P.forEach((p, i) => this.set(i, p, ox, oy, oz)); this.commit();
    for (const m of [this.slab, this.top]) { m.computeBoundingSphere(); m.boundingSphere!.radius += 2; }
  }

  shadows(cast: boolean, receive: boolean) { for (const m of [this.slab, this.top]) { m.castShadow = cast; m.receiveShadow = receive; } }
  addTo(scene: THREE.Scene) { scene.add(this.slab, this.top); }
}

/** The X painted on the pad where the body stands: the pad floats over the X in the fair. Both worlds paint it. */
export function paintX(scene: THREE.Scene, x: number, y: number, z: number) {
  for (const [color, rz] of [[FAIR.xBlue, Math.PI / 5], [FAIR.xYellow, -Math.PI / 5]] as const) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 3.2).rotateZ(rz).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    bar.position.set(x, y + 0.02, z); bar.renderOrder = 1; scene.add(bar);
  }
}
