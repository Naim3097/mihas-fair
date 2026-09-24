// The way up between the worlds: rings of light climbing from the X's dock to the Playground's pad overhead. The fair
// draws the column rising out of its floor, the Playground draws the same column coming up to its pad from the fair
// below: one lift, seen from either end. Blue, like every lift: blue is what you can do.
import * as THREE from 'three';
import { FAIR } from './palette';

/** How many rings climb at once, and how fast (m/s). */
const RINGS = 14, SPEED = 1.4;

export function makeRings(): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.TorusGeometry(1.25, 0.09, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, transparent: true, opacity: 0.55, depthWrite: false }), RINGS);
  m.frustumCulled = false; m.renderOrder = 8;
  return m;
}

/** The rings climbing from `y0` to `y1` over (x, z), evenly spaced: each grows in over the first metres and shrinks away
 *  over the last, so the column begins and ends softly. Nothing is allocated. */
export function climbRings(rings: THREE.InstancedMesh, x: number, z: number, y0: number, y1: number, t: number, M: THREE.Matrix4) {
  const span = y1 - y0, gap = span / rings.count;
  for (let i = 0; i < rings.count; i++) {
    const h = (t * SPEED + i * gap) % span, s = Math.max(0.001, Math.min(1, h / 3, (span - h) / 8));
    M.makeScale(s, 1, s).setPosition(x, y0 + h, z); rings.setMatrixAt(i, M);
  }
  rings.instanceMatrix.needsUpdate = true;
}
