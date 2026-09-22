// The Nexova fair on screen: MITEC's three levels as white platforms in space, each kept in by glass, the video sky
// all around, the booths built clearly as booths, and the same signs of meaning as Mission X: orange where an
// exhibitor is online (MIHAS's colour), gold where you have stamped, blue for what you can do. Everything is flat
// and matte, drawn in a few dozen calls, so a phone keeps its frame rate; the only textures are the roof names, the
// floor lettering, the sky and the light baked into the carpets. One sun throws real shadows from a map that
// follows the player; fog gives the far end of a hall its distance.
import * as THREE from 'three';
import type { Booth, LevelData, StationView } from '../../shared/types';
import { type Place, type Tone } from '../game/places';
import { BoothSet } from './booths';
import { FAIR } from './palette';
import { css } from '../theme';
import { DECK_MARGIN, GLASS_H, toWorld, wallRect, type FairLevel } from './level';
import { Light } from './light';
import { Sky } from './sky';

export { FAIR };
const TONE: Record<Tone, number> = { white: 0xffffff, soft: 0xeceff3, mid: FAIR.inkSoft, ink: FAIR.ink, area: FAIR.area };
export interface Label { text: string; pos: THREE.Vector3; kind: 'area' | 'gate' | 'hero' | 'lift' }
const W = (x: number, y: number, h = 0) => { const p = toWorld(x, y, h); return new THREE.Vector3(p.x, p.y, p.z); };

export class FairWorld {
  readonly scene = new THREE.Scene();
  readonly labels: Label[] = [];
  readonly heroPos: THREE.Vector3;
  readonly places: Place[];
  private boothIndex = new Map<string, number>();
  private booths!: BoothSet;
  private pins!: THREE.InstancedMesh;
  private pinned: number[] = [];
  private boothH: number;
  private marks: Partial<Record<'hover' | 'goal', THREE.Group>> = {};
  private heroBits!: { X: THREE.Group; ring: THREE.Mesh };
  private sky: Sky;
  private light: Light;
  private tmpM = new THREE.Matrix4();

  /** lean: the phone tier; shadows: whether the sun throws any (the engine turns them off under load). */
  constructor(private level: LevelData, fair: FairLevel, private lean = false, shadows = true) {
    this.places = fair.places;
    this.boothH = level.booth.h;
    this.heroPos = W(level.hero.x, level.hero.y);
    this.scene.background = new THREE.Color(FAIR.space);
    this.light = new Light(this.scene, lean, shadows);
    this.sky = new Sky(lean); this.scene.add(this.sky.dome); this.sky.onVideo = (tex) => this.booths?.setScreen(tex);
    this.levels(fair); this.glass(fair); this.furnish(); this.gates(); this.lifts(); this.stands(fair); this.theX();
  }

  private flat(color: number) { return new THREE.MeshLambertMaterial({ color }); }

  get shadows(): boolean { return this.light.shadows; }
  /** Shadows on or off, and how fine: every material is compiled again, so this is for a change of tier, not a frame. */
  setShadows(on: boolean, mapSize?: number) { this.light.setShadows(this.scene, on, mapSize); }
  /** The sun's shadow map follows the player. */
  followSun(x: number, z: number) { this.light.follow(x, z); }
  private decal(o: THREE.MeshBasicMaterialParameters) { return new THREE.MeshBasicMaterial({ ...o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }

  /** Autoplay is allowed muted; some browsers still want a gesture first, so the engine calls this again on the first touch. */
  playSky() { this.sky.play(); }

  private levels(fair: FairLevel) {
    const slab = this.flat(FAIR.floor), curb = this.flat(FAIR.curb);
    for (const d of this.level.decks) {
      const w = d.x1 - d.x0 + DECK_MARGIN * 2, dp = d.y1 - d.y0 + DECK_MARGIN * 2, c = W((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, dp), slab); m.position.set(c.x, -0.5, c.z); m.receiveShadow = true; this.scene.add(m);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.18, dp + 0.6), this.flat(FAIR.frame)); rim.position.set(c.x, -1.0, c.z); this.scene.add(rim);
    }
    for (const h of this.level.halls) {
      // under the booths' own carpets (0.02): what shows is the aisles, with the light baked along the partitions
      const carpet = new THREE.MeshLambertMaterial({ color: FAIR.hall, map: this.bakedLight(h, fair), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h.x1 - h.x0, h.y1 - h.y0).rotateX(-Math.PI / 2), carpet);
      m.position.copy(W((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, 0.008)); m.renderOrder = 1; m.receiveShadow = true; this.scene.add(m);
      this.floorText(`HALL ${h.id}`, h.x0 + (h.x1 - h.x0) * 0.82, h.y0 - 4.5, 5);
    }
    this.floorText('HALL 5 · REGISTRATION', 196, 64, 4, -Math.PI / 2);
    for (const r of this.level.walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, r.x1 - r.x0), 0.8, Math.max(0.4, r.y1 - r.y0)), curb);
      m.position.copy(W((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0.4)); this.scene.add(m);
    }
  }

  /** The light on a hall's carpet, baked: white, darkened a little at the foot of every partition and low wall and
   *  blurred out over half a metre, so the booths stand on the floor where the sun's shadow does not say so. An open
   *  front gets none: nothing stands there. Drawn with the canvas's own shadow (the shape itself is drawn off the
   *  canvas), which every browser can do. */
  private bakedLight(h: { x0: number; y0: number; x1: number; y1: number }, fair: FairLevel): THREE.CanvasTexture {
    const w = h.x1 - h.x0, d = h.y1 - h.y0, k = Math.min(8, 1024 / Math.max(w, d)), c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(d * k);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    const OFF = 4096; g.shadowColor = 'rgba(20,26,40,0.3)'; g.shadowBlur = 0.55 * k * 2; g.shadowOffsetX = OFF; g.fillStyle = '#000';
    const rect = (x0: number, y0: number, x1: number, y1: number) => g.fillRect((x0 - h.x0) * k - OFF, (h.y1 - y1) * k, (x1 - x0) * k, (y1 - y0) * k);
    const inHall = (x: number, y: number) => x >= h.x0 - 1 && x <= h.x1 + 1 && y >= h.y0 - 1 && y <= h.y1 + 1;
    for (const st of fair.stands) for (const c of st.cells) { if (!inHall(c.b.x, c.b.y)) continue; for (const s of c.walled) { const r = wallRect(c.b, s, st.w, st.d); rect(r.x0 - 0.22, r.y0 - 0.22, r.x1 + 0.22, r.y1 + 0.22); } }
    for (const wl of this.level.walls) rect(wl.x0 - 0.2, wl.y0 - 0.2, Math.max(wl.x1, wl.x0 + 0.4) + 0.2, Math.max(wl.y1, wl.y0 + 0.4) + 0.2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  /** The containment: one pane per side of each level with a silver frame every twelve metres and a rail along the top. */
  private glass(fair: FairLevel) {
    const pane = new THREE.MeshBasicMaterial({ color: FAIR.glass, transparent: true, opacity: 0.13, depthWrite: false }); // one face: the near one is what you see through
    const frame = this.flat(FAIR.frame), post = new THREE.BoxGeometry(0.28, GLASS_H, 0.28), unit = new THREE.BoxGeometry(1, 1, 1);
    const posts: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = [], M = new THREE.Matrix4();
    for (const { box } of fair.glass) {
      const w = box.max.x - box.min.x, d = box.max.z - box.min.z, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, GLASS_H, d), pane); m.position.set(cx, GLASS_H / 2, cz); m.renderOrder = 4; this.scene.add(m);
      const along = w > d, len = along ? w : d;
      rails.push(M.makeScale(along ? len : 0.34, 0.34, along ? 0.34 : len).setPosition(cx, GLASS_H + 0.1, cz).clone());
      for (let k = 0; k <= len; k += 12) posts.push(M.makeTranslation(along ? box.min.x + k : cx, GLASS_H / 2, along ? cz : box.min.z + k).clone());
    }
    const pm = new THREE.InstancedMesh(post, frame, posts.length); posts.forEach((m, i) => pm.setMatrixAt(i, m)); pm.castShadow = true;
    const rm = new THREE.InstancedMesh(unit, frame, rails.length); rails.forEach((m, i) => rm.setMatrixAt(i, m));
    this.scene.add(pm, rm);
  }

  private floorText(txt: string, x: number, y: number, size: number, rot = 0) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const g = c.getContext('2d')!; g.font = '800 150px Urbanist, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css(FAIR.ink); g.fillText(txt, 512, 136);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), this.decal({ map: t, transparent: true, opacity: 0.16 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.copy(W(x, y, 0.03)); m.renderOrder = 2; this.scene.add(m);
  }

  /** Cafés, lounges, stages, kitchens: their floors and furniture, a handful of instanced meshes. */
  private furnish() {
    const floor = new THREE.MeshLambertMaterial({ color: FAIR.area, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), M = new THREE.Matrix4(), C = new THREE.Color();
    const white = this.flat(0xffffff), boxGeo = new THREE.BoxGeometry(1, 1, 1), roundGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const build = (list: Place['solids'], geo: THREE.BufferGeometry) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, white, list.length);
      list.forEach((s, i) => { M.makeScale(s.w, s.h, s.d).setPosition(W(s.x, s.y, s.z + s.h / 2)); m.setMatrixAt(i, M); m.setColorAt(i, C.set(TONE[s.tone])); });
      m.computeBoundingSphere(); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    };
    const all = this.places.flatMap((pl) => pl.solids);
    build(all.filter((s) => !s.round), boxGeo); build(all.filter((s) => s.round), roundGeo);
    for (const pl of this.places) {
      const r = pl.rect, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      if (pl.open) { const f = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.y1 - r.y0).rotateX(-Math.PI / 2), floor); f.position.copy(W(cx, cy, 0.025)); f.renderOrder = 2; f.receiveShadow = true; this.scene.add(f); }
      this.labels.push({ text: pl.name, pos: W(cx, cy, pl.open ? 4.4 : 2.8), kind: 'area' });
      if (pl.spot) this.backdrop(pl);
    }
    // No scenery people: every figure in the fair is a real player.
  }

  private backdrop(pl: Place) {
    const { wall, x, y } = pl.spot!, c = document.createElement('canvas'); c.width = 1024; c.height = 420;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 420); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = css(FAIR.ink); g.font = '800 150px Urbanist, Arial'; g.fillText(wall.text, 512, 190); g.fillStyle = css(FAIR.inkSoft); g.font = '600 44px Urbanist, Arial'; g.fillText('MITEC · KUALA LUMPUR', 512, 320);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const len = Math.max(wall.w, wall.d), art = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.4, (len - 0.4) * 0.41), new THREE.MeshBasicMaterial({ map: t }));
    const n = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[wall.face] as [number, number];
    art.position.copy(W(wall.x + n[0] * 0.17, wall.y + n[1] * 0.17, 1.8)); art.rotation.y = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[wall.face]; this.scene.add(art);
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40).rotateX(-Math.PI / 2), this.decal({ color: FAIR.blue })); mark.position.copy(W(x, y, 0.035)); mark.renderOrder = 3; this.scene.add(mark);
  }

  private gates() {
    const m = this.flat(FAIR.inkSoft), post = new THREE.BoxGeometry(0.35, 5, 0.35), top = new THREE.BoxGeometry(9.35, 0.35, 0.35);
    for (const g of this.level.gates) {
      const grp = new THREE.Group(), a = new THREE.Mesh(post, m), b = new THREE.Mesh(post, m), t = new THREE.Mesh(top, m);
      a.position.set(-4.5, 2.5, 0); b.position.set(4.5, 2.5, 0); t.position.set(0, 5.17, 0); grp.add(a, b, t); a.castShadow = b.castShadow = t.castShadow = true;
      if (g.axis === 'y') grp.rotation.y = Math.PI / 2;
      grp.position.copy(W(g.x, g.y, 0)); this.scene.add(grp);
      this.labels.push({ text: g.name, pos: W(g.x, g.y, 6.6), kind: 'gate' });
    }
  }

  private lifts() {
    const disc = new THREE.CylinderGeometry(2.2, 2.2, 0.12, 40), inner = new THREE.CylinderGeometry(1.5, 1.5, 0.14, 40), m = this.flat(FAIR.blue), mi = this.flat(0xffffff);
    for (const l of this.level.lifts) {
      const a = new THREE.Mesh(disc, m), b = new THREE.Mesh(inner, mi);
      a.position.copy(W(l.x, l.y, 0.06)); b.position.copy(W(l.x, l.y, 0.08)); this.scene.add(a, b);
      this.labels.push({ text: l.label, pos: W(l.x, l.y, 2.4), kind: 'lift' });
    }
  }

  /** The stands: every cell dressed as the shell scheme it is, the blocks and islands as such, Lean X Digital's own by hand. */
  private stands(fair: FairLevel) {
    this.level.booths.forEach((b, i) => this.boothIndex.set(b.id, i));
    this.booths = new BoothSet(this.level, fair.stands, this.lean); this.scene.add(this.booths.group);
    if (this.lean) this.booths.setScreen(this.sky.still); // the hero screen shows the sky still where there is no video
    this.pins = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.55), this.flat(FAIR.orange), 256);
    this.pins.count = 0; this.pins.frustumCulled = false; this.pins.castShadow = true; this.scene.add(this.pins);
  }

  /** Blue on the floor of the booth under the pointer or the one you asked to walk to. */
  mark(kind: 'hover' | 'goal', b: Booth | null) {
    let g = this.marks[kind];
    if (!b) { if (g) g.visible = false; return; }
    const BW = this.level.booth.w, BD = this.level.booth.d;
    if (!g) {
      g = new THREE.Group(); const blue = new THREE.MeshBasicMaterial({ color: FAIR.blue }), T = 0.14;
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, transparent: true, opacity: kind === 'goal' ? 0.22 : 0.14, depthWrite: false })); wash.position.y = 0.03;
      const bar = (bw: number, bd: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd), blue); m.position.set(x, 0.05, z); return m; };
      g.add(wash, bar(BW + T, T, 0, -BD / 2), bar(BW + T, T, 0, BD / 2), bar(T, BD - T, -BW / 2, 0), bar(T, BD - T, BW / 2, 0));
      g.renderOrder = 7; this.marks[kind] = g; this.scene.add(g);
    }
    const p = toWorld(b.x, b.y, 0), dz = toWorld(b.x, b.y, 0).z - toWorld(b.x, b.y + BD, 0).z; // the cell's world depth: level 2 is drawn at true scale
    g.position.set(p.x, p.y, p.z); g.scale.set(1, 1, dz / BD); g.visible = true;
  }

  /** Booths exhibitors have brought online: MIHAS orange on their fascia, and a turning marker where the exhibitor is at the counter. */
  setStations(list: StationView[]) {
    this.booths.setOnline(list.map((s) => s.id));
    this.booths.setLogos(list);
    this.pinned = [];
    for (const s of list) { const i = this.boothIndex.get(s.id); if (i != null && s.hosted && this.pinned.length < 256) this.pinned.push(i); }
    this.pins.count = this.pinned.length;
  }

  setStamped(ids: Iterable<string>) { this.booths.setStamped(ids); }

  /** Booth 8H18A, built by hand: open to the west aisle, the X turning above it. */
  private theX() {
    const hero = new THREE.Group(); hero.position.copy(this.heroPos); this.scene.add(hero);
    const X = new THREE.Group(), bar = (color: number, rz: number, depth: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, depth), this.flat(color)); m.rotation.z = rz; m.castShadow = true; return m; };
    X.add(bar(FAIR.xBlue, Math.PI / 5, 0.7), bar(FAIR.xYellow, -Math.PI / 5, 0.56)); X.position.y = 8.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), this.decal({ color: FAIR.gold, transparent: true })); ring.position.y = 0.04; ring.renderOrder = 3;
    hero.add(X, ring);
    this.heroBits = { X, ring };
    this.labels.push({ text: 'The X · Booth ' + this.level.hero.id, pos: this.heroPos.clone().setY(12.6), kind: 'hero' });
  }

  update(t: number, _dt: number) {
    this.sky.update(t);
    const { X, ring } = this.heroBits;
    X.rotation.y = t * 0.6; X.position.y = 8.5 + Math.sin(t * 1.2) * 0.25;
    const k = (t * 0.35) % 1, s = 3 + k * 9; ring.scale.set(s, 1, s); (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    if (this.pinned.length) {
      const M = this.tmpM, y = this.boothH + 1.5 + Math.sin(t * 2) * 0.18;
      this.pinned.forEach((bi, n) => { const b = this.level.booths[bi]!, p = toWorld(b.x, b.y, y); M.makeRotationY(t * 0.9).setPosition(p.x, p.y, p.z); this.pins.setMatrixAt(n, M); });
      this.pins.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.sky.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); });
  }
}
