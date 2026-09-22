// A ribbon behind something that moves: a strip of quads through the last samples, wide at the head, gone at the
// tail, fading with age. One geometry, a fixed number of samples, every buffer updated in place: nothing is
// allocated after construction. Flat colour, no glow.
import * as THREE from 'three';

export class Ribbon {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array; private col: Float32Array;
  /** samples as a ring: centre x y z, side x z (unit, across the travel), age */
  private cx: Float32Array; private cy: Float32Array; private cz: Float32Array; private sx: Float32Array; private sz: Float32Array; private age: Float32Array;
  private head = 0; private count = 0;
  private r: number; private g: number; private b: number;

  constructor(readonly n: number, readonly width: number, readonly life: number, color: number) {
    this.cx = new Float32Array(n); this.cy = new Float32Array(n); this.cz = new Float32Array(n); this.sx = new Float32Array(n); this.sz = new Float32Array(n); this.age = new Float32Array(n);
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const c = new THREE.Color(color); this.r = c.r; this.g = c.g; this.b = c.b;
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
    this.geo.setDrawRange(0, 0);
  }

  /** A new sample at the head: where the thing is, and the direction it moves in (the ribbon lies across it). */
  push(x: number, y: number, z: number, dirX: number, dirZ: number) {
    const l = Math.hypot(dirX, dirZ) || 1;
    const i = this.head; this.cx[i] = x; this.cy[i] = y; this.cz[i] = z; this.sx[i] = -dirZ / l; this.sz[i] = dirX / l; this.age[i] = 0;
    this.head = (this.head + 1) % this.n; if (this.count < this.n) this.count++;
  }

  /** Age every sample, drop the dead, rebuild the strip from the newest to the oldest. */
  update(dt: number) {
    for (let k = 0; k < this.count; k++) { const i = (this.head - 1 - k + this.n) % this.n; this.age[i] = this.age[i]! + dt; }
    while (this.count > 0 && this.age[(this.head - this.count + this.n) % this.n]! >= this.life) this.count--;
    if (this.count < 2) { this.mesh.visible = false; this.geo.setDrawRange(0, 0); return; }
    let v = 0;
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - 1 - k + this.n) % this.n, a = 1 - this.age[i]! / this.life, w = (this.width / 2) * Math.min(1, a * 1.5), alpha = a * a * 0.85;
      const x = this.cx[i]!, y = this.cy[i]!, z = this.cz[i]!, ox = this.sx[i]! * w, oz = this.sz[i]! * w;
      this.pos[v * 3] = x - ox; this.pos[v * 3 + 1] = y; this.pos[v * 3 + 2] = z - oz;
      this.pos[v * 3 + 3] = x + ox; this.pos[v * 3 + 4] = y; this.pos[v * 3 + 5] = z + oz;
      for (let j = 0; j < 2; j++) { const c = (v + j) * 4; this.col[c] = this.r; this.col[c + 1] = this.g; this.col[c + 2] = this.b; this.col[c + 3] = alpha; }
      v += 2;
    }
    this.mesh.visible = true;
    this.geo.setDrawRange(0, (this.count - 1) * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** How many samples are alive. */
  get alive(): number { return this.count; }
  /** The alpha of the k-th newest sample, for the tests. */
  alphaAt(k: number): number { return this.col[(k * 2) * 4 + 3]!; }
  clear() { this.count = 0; this.geo.setDrawRange(0, 0); this.mesh.visible = false; }
  dispose() { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
