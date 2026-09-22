// The Playground on screen: white platforms on ink slabs floating in the same space sky, under the same sun and
// fog as the fair; stars, bubbles and the diamond as a few instanced meshes; rings, pads, the gear stands, the
// portal, the start line and the gate; and the landing marker under a body in the air. Flat and matte, a dozen
// draw calls, nothing allocated per frame.
import * as THREE from 'three';
import { Light } from '../fair/light';
import { FAIR } from '../fair/palette';
import { Sky } from '../fair/sky';
import { SLAB, type Course, type Gear, type Pickup, type PickupKind } from './course';
import { GEAR } from './gear';
import { Ribbon } from './ribbon';

const INK = 0x1b2130, WHITE = 0xffffff;
const TINT: Record<Gear, number> = { boots: 0xffffff, skates: FAIR.accent, jetpack: FAIR.orange };
/** Where the eye can read a label over a stand or the portal. */
export interface WorldLabel { text: string; pos: THREE.Vector3; kind: 'stand' | 'portal' }

const flat = (color: number, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: emissive });
const decal = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ ...o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export class PlaygroundWorld {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  readonly light: Light;
  readonly labels: WorldLabel[] = [];
  readonly marker: THREE.Mesh;
  /** the two ribbons the skates leave */
  readonly ribbons: [Ribbon, Ribbon];
  /** the jetpack's exhaust while the thrust is on */
  readonly exhaust: Ribbon;
  private meshes: Record<PickupKind, THREE.InstancedMesh>;
  /** the tinted ring round each star on a gear's line: pickup index → instance */
  private tintRings: THREE.InstancedMesh; private tintSlot: number[] = [];
  /** pickup index → its instance in its kind's mesh */
  private slot: number[] = [];
  private phase: Float32Array;
  private collected: Uint8Array;
  private pops: { i: number; t: number }[] = [];
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpP = new THREE.Vector3(); private tmpS = new THREE.Vector3();

  constructor(private course: Course, lean: boolean, shadows: boolean) {
    this.scene.background = new THREE.Color(FAIR.space);
    this.light = new Light(this.scene, lean, shadows);
    this.sky = new Sky(lean); this.scene.add(this.sky.dome);
    this.platforms(); this.fixtures();
    this.meshes = this.pickups();
    this.phase = new Float32Array(course.pickups.length).map(() => Math.random() * 6.28);
    this.collected = new Uint8Array(course.pickups.length);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 32).rotateX(-Math.PI / 2), decal({ color: FAIR.blue, transparent: true, opacity: 0.85 }));
    this.marker.visible = false; this.marker.renderOrder = 3; this.scene.add(this.marker);
    this.ribbons = [new Ribbon(48, 0.06, 1.2, FAIR.accent), new Ribbon(48, 0.06, 1.2, FAIR.accent)]; for (const r of this.ribbons) this.scene.add(r.mesh);
    this.exhaust = new Ribbon(24, 0.12, 0.45, FAIR.accent); this.scene.add(this.exhaust.mesh);
    this.tintRings = this.tinted();
  }

  /** A thin ring in the gear's tint round every star on that gear's line, facing along the lane: the line reads as
   *  the gear's from the turn on. */
  private tinted(): THREE.InstancedMesh {
    const gated = this.course.pickups.map((p, i) => [p, i] as const).filter(([p]) => p.kind === 'star' && p.line !== 'boots');
    const m = new THREE.InstancedMesh(new THREE.TorusGeometry(0.52, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, gated.length));
    m.count = gated.length; m.frustumCulled = false; const M = this.tmpM, C = new THREE.Color();
    gated.forEach(([p, i], n) => { this.tintSlot[i] = n; M.makeRotationY(Math.PI / 2).setPosition(p.x, p.y, p.z); m.setMatrixAt(n, M); m.setColorAt(n, C.set(TINT[p.line])); });
    this.scene.add(m); return m;
  }

  /** Every platform: an ink slab, a white top a hair smaller, so the edge reads from above and from the side. */
  private platforms() {
    const P = this.course.platforms, unit = new THREE.BoxGeometry(1, 1, 1);
    const slab = new THREE.InstancedMesh(unit, flat(INK), P.length), top = new THREE.InstancedMesh(unit, flat(WHITE), P.length), M = this.tmpM;
    P.forEach((p, i) => {
      M.makeScale(p.x1 - p.x0 + 0.2, SLAB - 0.05, p.z1 - p.z0 + 0.2).setPosition((p.x0 + p.x1) / 2, p.y - 0.05 - (SLAB - 0.05) / 2, (p.z0 + p.z1) / 2); slab.setMatrixAt(i, M);
      M.makeScale(p.x1 - p.x0, 0.05, p.z1 - p.z0).setPosition((p.x0 + p.x1) / 2, p.y - 0.025, (p.z0 + p.z1) / 2); top.setMatrixAt(i, M);
    });
    for (const m of [slab, top]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); this.scene.add(m); }
  }

  /** Rings, pads, stands, the portal, the start line and the gate. */
  private fixtures() {
    const c = this.course;
    const ringGeo = new THREE.TorusGeometry(1.7, 0.09, 10, 36).rotateY(Math.PI / 2), rings = new THREE.InstancedMesh(ringGeo, flat(FAIR.blue), c.rings.length), M = this.tmpM;
    c.rings.forEach((r, i) => { M.makeTranslation(r.x, r.y + 2, (r.z0 + r.z1) / 2); rings.setMatrixAt(i, M); });
    rings.castShadow = true; rings.computeBoundingSphere(); this.scene.add(rings);
    const blue = decal({ color: FAIR.blue });
    for (const p of c.pads) {
      if (p.kind === 'jump') {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(p.w / 2, 32).rotateX(-Math.PI / 2), blue); disc.position.set(p.x, p.y + 0.03, p.z); disc.renderOrder = 2; this.scene.add(disc);
        const eye = new THREE.Mesh(new THREE.CircleGeometry(p.w / 6, 24).rotateX(-Math.PI / 2), decal({ color: WHITE })); eye.position.set(p.x, p.y + 0.035, p.z); eye.renderOrder = 3; this.scene.add(eye);
      } else {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), decal({ map: chevrons(), transparent: true }));
        m.position.set(p.x, p.y + 0.03, p.z); m.rotation.y = Math.atan2(p.dir[0], p.dir[1]) - Math.PI / 2; m.renderOrder = 2; this.scene.add(m);
      }
    }
    for (const s of c.stands) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 40), flat(TINT[s.gear], s.gear === 'boots' ? 0 : 0.25)); disc.position.set(s.x, 0.04, s.z); disc.receiveShadow = true; this.scene.add(disc);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), flat(INK)); post.position.set(s.x, 0.65, s.z - 1.0); post.castShadow = true; this.scene.add(post);
      this.labels.push({ text: `${GEAR[s.gear].name}${GEAR[s.gear].price ? ` · ${GEAR[s.gear].price} ★` : ''}`, pos: new THREE.Vector3(s.x, 2.0, s.z - 1.0), kind: 'stand' });
    }
    const portal = new THREE.Mesh(new THREE.CylinderGeometry(c.portal.r, c.portal.r, 0.08, 40), flat(FAIR.blue, 0.2)); portal.position.set(c.portal.x, 0.04, c.portal.z); this.scene.add(portal);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(c.portal.r + 0.2, 0.06, 8, 40).rotateX(-Math.PI / 2), flat(FAIR.blue)); halo.position.set(c.portal.x, 0.12, c.portal.z); this.scene.add(halo);
    this.labels.push({ text: 'Back to the fair', pos: new THREE.Vector3(c.portal.x, 1.6, c.portal.z), kind: 'portal' });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.16, c.start.z1 - c.start.z0).rotateX(-Math.PI / 2), blue); line.position.set(c.start.x, c.start.y + 0.03, (c.start.z0 + c.start.z1) / 2); line.renderOrder = 2; this.scene.add(line);
    // the gate: two posts and a beam, like the fair's hall gates
    const g = c.gate, post = new THREE.BoxGeometry(0.35, 5, 0.35), beam = new THREE.BoxGeometry(0.35, 0.35, g.z1 - g.z0 + 0.35), ink = flat(INK);
    for (const z of [g.z0, g.z1]) { const m = new THREE.Mesh(post, ink); m.position.set(g.x, g.y + 2.5, z); m.castShadow = true; this.scene.add(m); }
    const b = new THREE.Mesh(beam, ink); b.position.set(g.x, g.y + 5.17, (g.z0 + g.z1) / 2); b.castShadow = true; this.scene.add(b);
  }

  /** Stars, bubbles, cells and the diamond, one instanced mesh each. */
  private pickups(): Record<PickupKind, THREE.InstancedMesh> {
    const K = this.course.pickups, by = (k: PickupKind) => K.filter((p) => p.kind === k);
    const geo: Record<PickupKind, THREE.BufferGeometry> = {
      star: new THREE.OctahedronGeometry(0.32), bubble: new THREE.SphereGeometry(0.33, 16, 12), cell: new THREE.BoxGeometry(0.4, 0.55, 0.4), diamond: new THREE.OctahedronGeometry(0.55).scale(1, 1.5, 1),
    };
    const mat: Record<PickupKind, THREE.Material> = { star: flat(FAIR.gold, 0.35), bubble: flat(FAIR.accent, 0.5), cell: flat(FAIR.orange, 0.35), diamond: flat(FAIR.accent, 0.6) };
    const out = {} as Record<PickupKind, THREE.InstancedMesh>;
    for (const k of ['star', 'bubble', 'cell', 'diamond'] as PickupKind[]) {
      const list = by(k), m = new THREE.InstancedMesh(geo[k], mat[k], Math.max(1, list.length));
      m.count = list.length; m.castShadow = k !== 'bubble'; m.frustumCulled = false; this.scene.add(m); out[k] = m;
    }
    const counter: Record<PickupKind, number> = { star: 0, bubble: 0, cell: 0, diamond: 0 };
    K.forEach((p, i) => { this.slot[i] = counter[p.kind]++; });
    return out;
  }

  /** Spin, bob, breathe; the pops of what was just collected. */
  update(t: number, dt: number) {
    this.sky.update(t);
    const K = this.course.pickups, M = this.tmpM, Q = this.tmpQ, P = this.tmpP, S = this.tmpS;
    for (let i = 0; i < K.length; i++) {
      const p = K[i]!, mesh = this.meshes[p.kind];
      if (this.collected[i]) continue;
      const ph = this.phase[i]!, spin = p.kind === 'diamond' ? t * 0.5 : p.kind === 'bubble' ? 0 : t * 0.9 + ph;
      const bob = p.kind === 'bubble' ? 0 : Math.sin(t * 1.6 + ph) * 0.12, s = p.kind === 'bubble' ? 1 + Math.sin(t * 2.2 + ph) * 0.08 : 1;
      M.compose(P.set(p.x, p.y + bob, p.z), Q.setFromAxisAngle(UP, spin), S.setScalar(s)); mesh.setMatrixAt(this.slot[i]!, M);
    }
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const pop = this.pops[k]!, p = K[pop.i]!, mesh = this.meshes[p.kind]; pop.t += dt;
      const s = pop.t < 0.06 ? 1 + pop.t * 6 : Math.max(0, 1.36 - (pop.t - 0.06) * 14);
      M.compose(P.set(p.x, p.y + 0.3, p.z), Q.setFromAxisAngle(UP, t * 4), S.setScalar(s)); mesh.setMatrixAt(this.slot[pop.i]!, M);
      if (pop.t > 0.16) { M.makeScale(0, 0, 0); mesh.setMatrixAt(this.slot[pop.i]!, M); this.pops.splice(k, 1); }
    }
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }

  /** A pickup taken: it pops and is gone for the run, its tinted ring with it. */
  collect(i: number) {
    if (this.collected[i]) return; this.collected[i] = 1; this.pops.push({ i, t: 0 });
    const n = this.tintSlot[i]; if (n != null) { this.tintRings.setMatrixAt(n, this.tmpM.makeScale(0, 0, 0)); this.tintRings.instanceMatrix.needsUpdate = true; }
  }
  isCollected(i: number): boolean { return this.collected[i] === 1; }
  /** A new run: everything back. */
  reset() {
    this.collected.fill(0); this.pops.length = 0; for (const r of this.ribbons) r.clear(); this.exhaust.clear();
    const K = this.course.pickups, M = this.tmpM;
    for (let i = 0; i < K.length; i++) { const n = this.tintSlot[i]; if (n != null) { const p = K[i]!; M.makeRotationY(Math.PI / 2).setPosition(p.x, p.y, p.z); this.tintRings.setMatrixAt(n, M); } }
    this.tintRings.instanceMatrix.needsUpdate = true;
  }

  /** Where the body would land: a ring on the surface straight below it, while it is in the air. */
  placeMarker(x: number, y: number, z: number) { this.marker.position.set(x, y + 0.02, z); this.marker.visible = true; }
  hideMarker() { this.marker.visible = false; }

  dispose() {
    this.sky.dispose(); for (const r of this.ribbons) r.dispose(); this.exhaust.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); } });
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Three chevrons pointing along +x on a blue ground: a boost pad's face. */
function chevrons(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d')!;
  g.fillStyle = '#2457f5'; g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const x of [56, 120, 184]) { g.beginPath(); g.moveTo(x - 24, 40); g.lineTo(x + 16, 96); g.lineTo(x - 24, 152); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export type { Pickup };
