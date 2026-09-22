// The light every world stands in: a bright hemisphere (Lambert divides by pi), one sun from the south-west that
// throws the shadows from a map that follows the player a whole texel at a time, a fill from the north so no wall
// in shadow goes dark, and fog to a pale haze that gives the far end its distance.
import * as THREE from 'three';
import { FAIR } from './palette';

/** Half the width of the sun's shadow map on the floor (m): it follows the player, so this is all it needs to cover. */
const SHADOW_R = 32;
/** Where the sun stands relative to what it lights: south-west and 50° up. */
const SUN_OFF = new THREE.Vector3(-80, 120, 60);

export class Light {
  readonly sun: THREE.DirectionalLight;
  private tmp = new THREE.Vector3();

  /** lean: the phone tier's coarser map; shadows: whether the sun throws any (the stage's ladder turns them off under load). */
  constructor(scene: THREE.Scene, lean: boolean, shadows: boolean, fog = true) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd5dc, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.copy(SUN_OFF); scene.add(sun, sun.target); this.sun = sun;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -SHADOW_R; sc.right = sc.top = SHADOW_R; sc.near = 10; sc.far = 340;
    sun.shadow.mapSize.setScalar(lean ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = this.texel(); sun.castShadow = shadows;
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(40, 90, -90); scene.add(fill);
    if (fog) scene.fog = new THREE.Fog(FAIR.haze, 90, 460);
  }

  get shadows(): boolean { return this.sun.castShadow; }
  /** One texel of the shadow map on the floor (m): what the normal bias has to cover so curved surfaces do not stripe. */
  private texel(): number { return (2 * SHADOW_R) / this.sun.shadow.mapSize.width; }

  /** Shadows on or off, and how fine. Every material in `scene` is compiled again on a change: for a change of tier, not a frame. */
  setShadows(scene: THREE.Scene, on: boolean, mapSize?: number) {
    if (mapSize && mapSize !== this.sun.shadow.mapSize.width) { this.sun.shadow.mapSize.setScalar(mapSize); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; this.sun.shadow.normalBias = this.texel(); }
    if (on === this.sun.castShadow) return;
    this.sun.castShadow = on;
    scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true; });
  }

  /** The shadow map is a window that follows the player, moved a whole texel at a time so its edges never swim. */
  follow(x: number, z: number) {
    const s = this.sun.shadow, cam = s.camera, texel = (cam.right - cam.left) / s.mapSize.width, t = this.tmp.set(x, 0, z);
    t.applyMatrix4(cam.matrixWorldInverse); t.x = Math.round(t.x / texel) * texel; t.y = Math.round(t.y / texel) * texel; t.applyMatrix4(cam.matrixWorld);
    this.sun.target.position.copy(t); this.sun.position.copy(t).add(SUN_OFF); this.sun.target.updateMatrixWorld();
  }
}
