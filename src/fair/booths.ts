// The stands on screen, from the plan's stand model, in a handful of instanced meshes: a carpet in every cell, a
// partition on every walled side, a fascia board with the exhibitor's name over every open side, the aluminium
// posts and rails of the shell scheme, spotlights on the fascia, an information counter with two chairs and a bin
// in every booth; for an island a raised floor and a tower that carries the name on all four sides. Online stands
// turn MIHAS orange on the fascia and the counter, stamped cells get a gold band. Booth 8H18A, Lean X Digital's
// own, is dressed by hand from the company's booth design: the back-wall graphic, the roll-ups, the screen, the
// counter with the logo, the A-frame at the aisle.
import * as THREE from 'three';
import type { Booth, LevelData, Rect } from '../../shared/types';
import { boothLabel } from '../../shared/rules';
import { css } from '../theme';
import { WALL_H, WALL_T, rectBox, toWorld, wallKey, wallRect } from './level';
import { FAIR } from './palette';
import { DIR, counterOf, signOf, type Side, type StandInfo } from './stands';

const FASCIA_H = 0.32, FASCIA_T = 0.05;
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
const FACE_ROT: Record<Side, number> = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }; // rotation.y of a plane facing out of that side
const flat = (color: number) => new THREE.MeshLambertMaterial({ color });

/** An instanced part: unit geometry, one transform per use, built once all uses are known. */
class Part {
  readonly items: { m: THREE.Matrix4; color?: number }[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material) {}
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color?: number): number {
    this.items.push({ m: new THREE.Matrix4().makeScale(x1 - x0, y1 - y0, z1 - z0).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color });
    return this.items.length - 1;
  }
  at(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, color?: number): number {
    this.items.push({ m: new THREE.Matrix4().compose(P.set(x, y, z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), S.set(sx, sy, sz)), color });
    return this.items.length - 1;
  }
  build(): THREE.InstancedMesh | null {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); if (it.color != null) mesh.setColorAt(i, C.set(it.color)); });
    mesh.computeBoundingSphere(); mesh.frustumCulled = false;
    return mesh;
  }
}

export class BoothSet {
  readonly group = new THREE.Group();
  private fascia!: THREE.InstancedMesh;
  private counters: THREE.InstancedMesh | null = null;
  private carpets!: THREE.InstancedMesh;
  private bands: THREE.InstancedMesh;
  private bandAt: { x: number; y: number; z: number; sx: number; sz: number }[] = [];
  private fasciaOf = new Map<number, number[]>();   // cell index → fascia instances
  private counterOf = new Map<number, number>();    // cell index → counter instance
  private carpetOf = new Map<number, number>();
  private standOfCell = new Map<number, StandInfo>();
  private cellOfId = new Map<string, number>();
  private online = new Set<string>();
  private screen: THREE.MeshBasicMaterial | null = null;
  private unit = new THREE.BoxGeometry(1, 1, 1);
  /** every partition's plan rectangle, to find the face a photo hangs on */
  private wallRects: Rect[] = [];

  /** lean: the phone tier, which skips the small parts (rails, spotlights, chairs, bins) and keeps the booths. */
  constructor(private level: LevelData, private stands: StandInfo[], private lean = false) {
    level.booths.forEach((b, i) => this.cellOfId.set(b.id, i));
    for (const st of stands) for (const c of st.cells) this.standOfCell.set(c.i, st);
    const white = flat(0xffffff), alu = flat(FAIR.frame), dark = flat(0x2b2f36), grey = flat(0xb7bcc6);
    const carpet = new Part(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    const wall = new Part(this.unit, white), fascia = new Part(this.unit, white), post = new Part(this.unit, alu), rail = new Part(this.unit, alu);
    const spot = new Part(this.unit, dark), counter = new Part(this.unit, white), seat = new Part(this.unit, flat(0x3a3f47)), back = new Part(this.unit, flat(0x3a3f47));
    const bin = new Part(new THREE.CylinderGeometry(0.5, 0.45, 1, 8), grey), platform = new Part(this.unit, flat(0xe3e7ec)), tower = new Part(this.unit, white), plinth = new Part(this.unit, white);
    const seenWall = new Set<string>(), seenPost = new Set<string>();
    const postAt = (x: number, y: number, deck: number) => { const k = `${deck}|${x.toFixed(1)}|${y.toFixed(1)}`; if (seenPost.has(k)) return; seenPost.add(k); const p = toWorld(x, y); post.box(p.x - 0.035, 0, p.z - 0.035, p.x + 0.035, WALL_H + 0.06, p.z + 0.035); };
    for (const st of stands) {
      const hero = st.cells.length === 1 && st.cells[0]!.b.id === level.hero.id;
      for (const c of st.cells) {
        const b = c.b, hw = st.w / 2, hd = st.d / 2;
        if (st.kind !== 'island') {
          const r = rectBox({ x0: b.x - hw + 0.02, y0: b.y - hd + 0.02, x1: b.x + hw - 0.02, y1: b.y + hd - 0.02 }, 0, 0.012);
          this.carpetOf.set(c.i, carpet.at((r.min.x + r.max.x) / 2, 0.012, (r.min.z + r.max.z) / 2, r.max.x - r.min.x, 1, r.max.z - r.min.z, 0, hero ? 0x3d424a : FAIR.carpet));
        }
        if (st.kind === 'island') continue; // an island is open all round: a platform, a tower, plinths, no shell scheme
        for (const s of c.walled) {
          const k = wallKey(b, s); if (seenWall.has(k)) continue; seenWall.add(k);
          const wr = wallRect(b, s, st.w, st.d), r = rectBox(wr, 0, WALL_H); this.wallRects.push(wr);
          wall.box(r.min.x, 0, r.min.z, r.max.x, WALL_H, r.max.z);
          if (!this.lean) rail.box(r.min.x - 0.01, WALL_H, r.min.z - 0.01, r.max.x + 0.01, WALL_H + 0.06, r.max.z + 0.01);
        }
        for (const s of c.open) {
          const wr = wallRect(b, s, st.w, st.d), r = rectBox(wr, WALL_H - FASCIA_H, WALL_H);
          const [dx, dy] = DIR[s], t = (FASCIA_T - WALL_T) / 2;
          const id = fascia.box(r.min.x - (dx === 0 ? 0 : t), WALL_H - FASCIA_H, r.min.z - (dy === 0 ? 0 : t), r.max.x + (dx === 0 ? 0 : t), WALL_H, r.max.z + (dy === 0 ? 0 : t), 0xffffff);
          (this.fasciaOf.get(c.i) ?? this.fasciaOf.set(c.i, []).get(c.i)!).push(id);
          if (this.lean) continue;
          rail.box(r.min.x - 0.01, WALL_H, r.min.z - 0.01, r.max.x + 0.01, WALL_H + 0.06, r.max.z + 0.01);
          // two spotlights on the fascia's top edge, a hand inside it
          const cx = (r.min.x + r.max.x) / 2, cz = (r.min.z + r.max.z) / 2, along = dx === 0 ? 'x' : 'z';
          for (const q of [-0.8, 0.8]) { const x = along === 'x' ? cx + q : cx - dx * 0.18, z = along === 'z' ? cz + q : cz + dy * 0.18; spot.box(x - 0.06, WALL_H + 0.06, z - 0.06, x + 0.06, WALL_H + 0.15, z + 0.06); }
        }
        // posts at every corner that carries a wall or a fascia
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const sides: Side[] = [sy > 0 ? 'N' : 'S', sx > 0 ? 'E' : 'W'];
          if (sides.some((s) => c.walled.has(s) || c.open.has(s))) postAt(b.x + sx * hw, b.y + sy * hd, b.deck);
        }
      }
      if (st.kind === 'island') {
        const r = rectBox(st.rect, 0, 0.1); platform.box(r.min.x, 0, r.min.z, r.max.x, 0.1, r.max.z);
        rail.box(r.min.x, 0.1, r.min.z, r.max.x, 0.13, r.min.z + 0.05); rail.box(r.min.x, 0.1, r.max.z - 0.05, r.max.x, 0.13, r.max.z); rail.box(r.min.x, 0.1, r.min.z, r.min.x + 0.05, 0.13, r.max.z); rail.box(r.max.x - 0.05, 0.1, r.min.z, r.max.x, 0.13, r.max.z);
        const cx = (r.min.x + r.max.x) / 2, cz = (r.min.z + r.max.z) / 2;
        tower.box(cx - 0.8, 0.1, cz - 0.8, cx + 0.8, 3.7, cz + 0.8);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) { const x = cx + sx * 0.9, z = cz + sz * 0.9; spot.box(x - 0.08, 3.7, z - 0.08, x + 0.08, 3.82, z + 0.08); }
        const rx = (r.max.x - r.min.x) / 2 - 1.2, rz = (r.max.z - r.min.z) / 2 - 1.2;
        if (rx > 1.5 && rz > 1.5) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) plinth.box(cx + sx * rx - 0.3, 0.1, cz + sz * rz - 0.3, cx + sx * rx + 0.3, 1.0, cz + sz * rz + 0.3);
      } else if (!hero) {
        const co = counterOf(st);
        if (co) {
          const r = rectBox(co.rect, 0, 1.0);
          this.counterOf.set(st.cells[0]!.i, counter.box(r.min.x, 0, r.min.z, r.max.x, 1.0, r.max.z, 0xffffff));
          // two chairs a step behind the counter, a bin in the back corner
          const [dx, dy] = DIR[st.front], along = dx === 0 ? 'x' : 'y';
          if (this.lean) continue;
          for (const q of [-0.32, 0.32]) {
            const x = co.x - dx * 0.95 + (along === 'x' ? q : 0), y = co.y - dy * 0.95 + (along === 'y' ? q : 0), p = toWorld(x, y);
            seat.box(p.x - 0.22, 0.42, p.z - 0.22, p.x + 0.22, 0.47, p.z + 0.22);
            const bp = toWorld(x - dx * 0.2, y - dy * 0.2);
            if (along === 'x') back.box(bp.x - 0.22, 0.47, bp.z - 0.025, bp.x + 0.22, 0.9, bp.z + 0.025); else back.box(bp.x - 0.025, 0.47, bp.z - 0.22, bp.x + 0.025, 0.9, bp.z + 0.22);
          }
          const back0 = st.cells[0]!.b, bx = back0.x - dx * (st.w / 2 - 0.35) + (along === 'x' ? -(st.w / 2 - 0.35) : 0), by = back0.y - dy * (st.d / 2 - 0.35) + (along === 'y' ? -(st.d / 2 - 0.35) : 0);
          const bp = toWorld(bx, by); bin.at(bp.x, 0.22, bp.z, 0.3, 0.44, 0.3);
        }
      }
    }
    for (const part of [carpet, wall, fascia, post, rail, spot, counter, seat, back, bin, platform, tower, plinth]) { const m = part.build(); if (m) this.group.add(m); }
    this.carpets = carpet.build()!; // kept apart so the hero cell and online stands can be recoloured
    this.group.remove(this.group.children.find((o) => (o as THREE.InstancedMesh).geometry === carpet.geo)!); this.group.add(this.carpets);
    this.fascia = this.group.children.find((o) => (o as THREE.InstancedMesh).geometry === fascia.geo && (o as THREE.InstancedMesh).count === fascia.items.length) as THREE.InstancedMesh;
    this.counters = (this.group.children.find((o) => (o as THREE.InstancedMesh).geometry === counter.geo && (o as THREE.InstancedMesh).count === counter.items.length) as THREE.InstancedMesh) ?? null;
    this.bands = new THREE.InstancedMesh(this.unit, flat(FAIR.gold), 512); this.bands.count = 0; this.bands.frustumCulled = false; this.group.add(this.bands);
    this.names();
    this.hero();
  }

  /** Every booth's name on every open side of its fascia — a stand of eight cells carries it eight times, as the
   *  real shell scheme does. A booth shows its number until an exhibitor registers it; then its number and their
   *  company. Drawn from packed atlases (named booths, and a smaller one for bare numbers), one draw call each, fading
   *  with distance; rebuilt only when a name changes. */
  private labelMeshes: THREE.InstancedMesh[] = [];
  private live = new Map<string, string>();
  private labelKey = '';

  private labelOf(b: Booth): string {
    return b.id === this.level.hero.id ? b.name : boothLabel(b.id, this.live.get(b.id));
  }

  /** Registered booths (the list leaves out revoked ones): the company goes up the moment the exhibitor registers. */
  private setLiveNames(list: { id: string; company: string }[]) {
    this.live = new Map(list.filter((s) => s.company && s.id !== this.level.hero.id).map((s) => [s.id, shortCompany(s.company)]));
    this.names();
  }

  private names() {
    type Label = { text: string; x: number; y: number; h: number; face: Side; len: number };
    const labels: Label[] = [];
    for (const st of this.stands) {
      if (st.kind === 'island') { // the tower carries the stand's name on all four faces
        const text = this.labelOf(st.cells[0]!.b), cx = (st.rect.x0 + st.rect.x1) / 2, cy = (st.rect.y0 + st.rect.y1) / 2;
        for (const f of ['N', 'E', 'S', 'W'] as Side[]) { const [dx, dy] = DIR[f]; labels.push({ text, x: cx + dx * 0.82, y: cy + dy * 0.82, h: 3.2, face: f, len: 2.1 }); }
        continue;
      }
      for (const c of st.cells) {
        const text = this.labelOf(c.b);
        for (const f of c.open) {
          const [dx, dy] = DIR[f], across = f === 'N' || f === 'S', half = (across ? st.d : st.w) / 2;
          labels.push({ text, x: c.b.x + dx * (half + FASCIA_T / 2), y: c.b.y + dy * (half + FASCIA_T / 2), h: WALL_H - FASCIA_H / 2, face: f, len: across ? st.w : st.d });
        }
      }
    }
    const key = labels.map((l) => l.text).join('\n');
    if (key === this.labelKey) return;
    this.labelKey = key;
    for (const m of this.labelMeshes) { m.geometry.dispose(); const mat = m.material as THREE.ShaderMaterial; (mat.uniforms.map!.value as THREE.Texture).dispose(); mat.dispose(); m.removeFromParent(); }
    this.labelMeshes = [];
    // names get wide slots; bare booth numbers ("7C17") narrow ones, so every booth fits in two textures
    const isNumber = (t: string) => /^\S+$/.test(t);
    this.labelMeshes.push(...atlasMeshes(labels.filter((l) => !isNumber(l.text)), 256, 32), ...atlasMeshes(labels.filter((l) => isNumber(l.text)), 128, 32));
    for (const m of this.labelMeshes) this.group.add(m);
  }


  /** Lean X Digital's own booth, 8H18A: the company's design in its shell-scheme cell, opening to the west aisle. */
  private hero() {
    const i = this.cellOfId.get(this.level.hero.id); if (i == null) return;
    const b = this.level.booths[i]!, st = this.standOfCell.get(i); if (!st) return;
    const c = toWorld(b.x, b.y), h = st.w / 2 - WALL_T, g = new THREE.Group(); g.position.set(c.x, 0, c.z); this.group.add(g);
    const tex = (canvas: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const art = (canvas: HTMLCanvasElement, w: number, hgt: number) => new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: tex(canvas) }));
    // the back wall (east) carries the brand graphic; the side wall the screen and two roll-ups — the south wall in a
    // booth open only to the west, the north wall in a corner booth that also opens south (8H18A). World +z is south.
    const backArt = art(heroBackWall(), 2.72, 2.2); backArt.position.set(h - 0.012, 1.24, 0); backArt.rotation.y = -Math.PI / 2; g.add(backArt);
    const cell = st.cells[0]!, s = cell.walled.has('S') || !cell.walled.has('N') ? 1 : -1, face = s > 0 ? Math.PI : 0;
    const z = (inset: number) => s * (h - 0.012 - inset);
    const r1 = art(heroRollup(), 0.84, 2.0); r1.position.set(-0.85, 1.06, z(0.06)); r1.rotation.y = face; g.add(r1);
    const r2 = art(heroRollupDark(), 0.84, 2.0); r2.position.set(1.02, 1.06, z(0.06)); r2.rotation.y = face; g.add(r2);
    for (const x of [-0.85, 1.02]) { const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.16), flat(0x2b2f36)); base.position.set(x, 0.025, z(0.1)); g.add(base); }
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.64, 0.05), flat(0x111318)); tv.position.set(0.1, 1.5, z(0.14)); g.add(tv);
    this.screen = new THREE.MeshBasicMaterial({ color: 0x0b1626 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.58), this.screen); screen.position.set(0.1, 1.5, z(0.17)); screen.rotation.y = face; g.add(screen);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), flat(0x2b2f36)); pole.position.set(0.1, 0.6, z(0.14)); g.add(pole);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.42), flat(0x2b2f36)); foot.position.set(0.1, 0.02, z(0.3)); g.add(foot);
    // the counter at the front-left with the logo on its face (the same rectangle the body collides with), two
    // chairs behind it, two laptops on top; the A-frame by the aisle on the right
    const co = counterOf(st);
    if (co) {
      const r = rectBox(co.rect, 0, 1.0), cx = (r.min.x + r.max.x) / 2 - c.x, cz = (r.min.z + r.max.z) / 2 - c.z, w = r.max.x - r.min.x, d = r.max.z - r.min.z;
      const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), flat(0xffffff)); counter.position.set(cx, 0.5, cz); g.add(counter);
      const face = art(heroCounter(), d - 0.02, 0.9); face.position.set(cx - w / 2 - 0.005, 0.5, cz); face.rotation.y = -Math.PI / 2; g.add(face);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.04, d + 0.06), flat(0xeef1f5)); top.position.set(cx, 1.01, cz); g.add(top);
      for (const q of [-0.3, 0.3]) {
        const z = cz + q;
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.32), flat(0xc9ccd2)); lap.position.set(cx, 1.04, z); g.add(lap);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.21, 0.32), flat(0x2b2f36)); lid.position.set(cx + 0.1, 1.14, z); lid.rotation.z = 0.25; g.add(lid);
        const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), flat(0x3a3f47)); seatM.position.set(cx + w / 2 + 0.5, 0.45, z); g.add(seatM);
        const backM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.44), flat(0x3a3f47)); backM.position.set(cx + w / 2 + 0.72, 0.7, z); g.add(backM);
      }
    }
    const sg = signOf(st, this.level.hero.id);
    if (sg) {
      const r = rectBox(sg, 0, 1.0), frame = new THREE.Group(); frame.position.set((r.min.x + r.max.x) / 2 - c.x, 0, (r.min.z + r.max.z) / 2 - c.z); frame.rotation.y = -0.6; g.add(frame);
      const board = art(heroPoster(), 0.6, 0.92); board.position.set(0, 0.55, 0.03); board.rotation.x = -0.12; frame.add(board);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.98, 0.04), flat(0x1e2126)); legs.position.set(0, 0.5, 0); legs.rotation.x = -0.12; frame.add(legs);
    }
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.42, 14), flat(0xffffff)); bin.position.set(h - 0.3, 0.21, -z(0.35)); g.add(bin);
  }

  /** The screen in the Lean X booth shows this (the fair's sky video, once it plays). */
  setScreen(map: THREE.Texture) { if (this.screen) { this.screen.map = map; this.screen.color.set(0xffffff); this.screen.needsUpdate = true; } }

  standOf(cellIndex: number): StandInfo | undefined { return this.standOfCell.get(cellIndex); }

  /** Booths exhibitors have brought online: MIHAS orange on their fascia and their counter. */
  setOnline(ids: Iterable<string>) {
    const next = new Set(ids);
    const paint = (id: string, on: boolean) => {
      const i = this.cellOfId.get(id); if (i == null) return;
      const st = this.standOfCell.get(i); const cells = st ? st.cells.map((c) => c.i) : [i];
      for (const k of cells) {
        for (const f of this.fasciaOf.get(k) ?? []) this.fascia.setColorAt(f, C.set(on ? FAIR.orange : 0xffffff));
        const ci = this.counterOf.get(k); if (ci != null && this.counters) this.counters.setColorAt(ci, C.set(on ? FAIR.orangeSoft : 0xffffff));
      }
    };
    for (const id of this.online) if (!next.has(id)) paint(id, false);
    for (const id of next) paint(id, true);
    this.online = next;
    if (this.fascia.instanceColor) this.fascia.instanceColor.needsUpdate = true;
    if (this.counters?.instanceColor) this.counters.instanceColor.needsUpdate = true;
  }

  /** Approved exhibitors' logos: on the face of their counter and on a sign hung over the open side of the booth,
   *  the way Lean X Digital's own booth carries its brand (an island: on all four faces of its tower). */
  setLogos(list: { id: string; company: string; status: string; logo: string | null; photo: string | null }[]) {
    this.setLiveNames(list);
    const want = new Map(list.filter((s) => s.id !== this.level.hero.id && (s.logo || s.photo)).map((s) => [s.id, s]));
    const key = (s: { logo: string | null; photo: string | null }) => `${s.logo ?? ''}|${s.photo ?? ''}`;
    for (const [id, l] of this.logos) { const w = want.get(id); if (!w || key(w) !== l.url) { disposeGroup(l.group); this.logos.delete(id); } }
    for (const [id, s] of want) {
      if (this.logos.has(id)) continue;
      const i = this.cellOfId.get(id), st = i != null ? this.standOfCell.get(i) : undefined; if (!st) continue;
      const group = new THREE.Group(); this.group.add(group); this.logos.set(id, { url: key(s), group });
      const load = (url: string, dress: (art: Art) => void) => new THREE.TextureLoader().load(url, (tex) => {
        if (this.logos.get(id)?.group !== group) { tex.dispose(); return; } // replaced while loading
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const img = tex.image as { width: number; height: number }, aspect = img.width / Math.max(1, img.height);
        dress((maxW, maxH) => { const w = Math.min(maxW, maxH * aspect), h = w / aspect; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02 })); });
      }, undefined, () => { /* an image that will not load leaves the booth as it was */ });
      if (s.logo) load(s.logo, (art) => dressWithLogo(st, group, art));
      if (s.photo) load(s.photo, (art) => dressWithPhoto(st, group, art, this.backFace(st)));
    }
  }
  private logos = new Map<string, { url: string; group: THREE.Group }>();

  /** Where the inside face of a stand's back wall is, on the plan axis across it. Cells are drawn a little wider than
   *  the plan spaces them, so the booth behind can put its own partition a few centimetres inside this one: the face
   *  is the innermost of the walls along the back edge, not the edge itself. */
  private backFace(st: StandInfo): number {
    const b = BACK[st.front], vertical = b === 'E' || b === 'W';
    const edge = b === 'E' ? st.rect.x1 : b === 'W' ? st.rect.x0 : b === 'N' ? st.rect.y1 : st.rect.y0;
    const at = vertical ? st.label.y : st.label.x, inward = b === 'E' || b === 'N' ? -1 : 1;
    let face = edge + inward * (WALL_T / 2);
    for (const r of this.wallRects) {
      const [lo, hi, a0, a1] = vertical ? [r.x0, r.x1, r.y0, r.y1] : [r.y0, r.y1, r.x0, r.x1];
      if (hi - lo > 0.3 || at < a0 || at > a1 || hi < edge - 0.3 || lo > edge + 0.3) continue; // only partitions along this edge
      face = inward < 0 ? Math.min(face, lo) : Math.max(face, hi);
    }
    return face;
  }

  /** Stamped cells: a gold band along the top of their fascia. */
  setStamped(ids: Iterable<string>) {
    this.bandAt = [];
    for (const id of ids) {
      const i = this.cellOfId.get(id); if (i == null) continue;
      const st = this.standOfCell.get(i), cell = st?.cells.find((c) => c.i === i); if (!st || !cell) continue;
      for (const s of cell.open) { const r = rectBox(wallRect(cell.b, s, st.w, st.d), WALL_H - 0.06, WALL_H + 0.02); this.bandAt.push({ x: (r.min.x + r.max.x) / 2, y: WALL_H + 0.09, z: (r.min.z + r.max.z) / 2, sx: r.max.x - r.min.x + 0.06, sz: r.max.z - r.min.z + 0.06 }); }
    }
    this.bands.count = Math.min(512, this.bandAt.length);
    this.bandAt.slice(0, 512).forEach((b, n) => this.bands.setMatrixAt(n, M.makeScale(b.sx, 0.07, b.sz).setPosition(b.x, b.y, b.z)));
    this.bands.instanceMatrix.needsUpdate = true;
  }

  /** The world position of a cell's fascia top, for markers that hang over it. */
  fasciaTop(b: Booth): THREE.Vector3 { const p = toWorld(b.x, b.y, WALL_H + 0.1); return new THREE.Vector3(p.x, p.y, p.z); }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { const t = (mat as THREE.MeshBasicMaterial).map; t?.dispose(); mat.dispose(); } });
    this.group.removeFromParent();
  }
}

/** A company as it fits on a fascia: without the legal suffix. */
export function shortCompany(name: string): string {
  return name.replace(/\s+c\/o\s.*$/i, '').replace(/[,.]?\s*\(M\)/gi, '').replace(/[,.]?\s+(Sdn\.?\s*Bhd\.?|Bhd\.?|Berhad|Pte\.?\s*Ltd\.?|Pvt\.?\s*Ltd\.?|Co\.,?\s*Ltd\.?|Ltd\.?|Inc\.?|PLT|LLC)$/i, '').trim() || name;
}

/** Fascia labels in packed atlases of CW×CH slots: one texture and one instanced draw per 2048² atlas. */
function atlasMeshes(labels: { text: string; x: number; y: number; h: number; face: Side; len: number }[], CW: number, CH: number): THREE.InstancedMesh[] {
  const SIZE = 2048, per = Math.floor(SIZE / CW), slots = per * Math.floor(SIZE / CH), texts = [...new Set(labels.map((l) => l.text))], out: THREE.InstancedMesh[] = [];
  for (let start = 0; start < texts.length; start += slots) {
    const chunk = texts.slice(start, start + slots), slot = new Map(chunk.map((t, k) => [t, k])), mine = labels.filter((l) => slot.has(l.text));
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d')!; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css(FAIR.ink);
    chunk.forEach((t, k) => {
      const x = (k % per) * CW, y = Math.floor(k / per) * CH;
      let f = 22; g.font = `800 ${f}px Urbanist, Arial`;
      while (g.measureText(t).width > CW - 10 && f > 11) { f -= 1; g.font = `800 ${f}px Urbanist, Arial`; }
      g.fillText(t, x + CW / 2, y + CH / 2 + 1, CW - 8);
    });
    const tex = new THREE.CanvasTexture(canvas); tex.flipY = false; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(1, 1), count = Math.max(1, mine.length), uv = new Float32Array(count * 4), fade = new Float32Array(count);
    const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { map: { value: tex } },
      vertexShader: 'attribute vec4 aUv; attribute float aFade; varying vec2 vUv; varying float vA; void main(){ vUv = aUv.xy + vec2(uv.x, 1.0 - uv.y) * aUv.zw; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vA = 1.0 - smoothstep(aFade * 0.7, aFade, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ float a = texture2D(map, vUv).a * vA; if (a < 0.02) discard; gl_FragColor = vec4(0.106, 0.129, 0.188, a); }',
    }), count);
    mine.forEach((l, n) => {
      const k = slot.get(l.text)!, w = Math.min(l.len - 0.3, 7), hh = Math.min(FASCIA_H - 0.06, w / (CW / CH));
      const p = toWorld(l.x, l.y, l.h), [dx, dy] = DIR[l.face];
      M.compose(P.set(p.x + dx * 0.04, p.y, p.z - dy * 0.04), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), FACE_ROT[l.face]), S.set(hh * (CW / CH), hh, 1));
      mesh.setMatrixAt(n, M); uv.set([((k % per) * CW) / SIZE, (Math.floor(k / per) * CH) / SIZE, CW / SIZE, CH / SIZE], n * 4); fade[n] = 24 + w * 5;
    });
    geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(uv, 4)); geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1));
    mesh.count = mine.length; mesh.frustumCulled = false; mesh.renderOrder = 6; out.push(mesh);
  }
  return out;
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); });
  g.removeFromParent();
}

type Art = (maxW: number, maxH: number) => THREE.Mesh;
const BACK: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** A photo of the real booth: on the back wall, facing the aisle, the way Lean X's booth carries its graphic.
 *  An island has no back wall, so its photo goes nowhere (its logo is on the tower). */
function dressWithPhoto(st: StandInfo, g: THREE.Group, art: Art, face: number) {
  if (st.kind === 'island') return;
  const f = st.front, b = BACK[f], along = f === 'N' || f === 'S';
  const x = b === 'E' || b === 'W' ? face : st.label.x, y = b === 'N' || b === 'S' ? face : st.label.y;
  const span = along ? st.rect.x1 - st.rect.x0 : st.rect.y1 - st.rect.y0, [dx, dy] = DIR[f];
  const m = art(Math.min(span - 0.4, Math.max(1.6, st.label.len - 0.4), 3.2), 1.9), p = toWorld(x + dx * 0.03, y + dy * 0.03, 1.3);
  m.position.set(p.x, p.y, p.z); m.rotation.y = FACE_ROT[f]; g.add(m);
}

/** Where an exhibitor's logo goes on their stand: the counter's aisle face, and a sign over the front. */
function dressWithLogo(st: StandInfo, g: THREE.Group, art: Art) {
  const place = (m: THREE.Mesh, x: number, y: number, h: number, side: Side, out = 0) => {
    const [dx, dy] = DIR[side], p = toWorld(x + dx * out, y + dy * out, h); m.position.set(p.x, p.y, p.z); m.rotation.y = FACE_ROT[side]; g.add(m);
  };
  if (st.kind === 'island') { // the tower in the middle: 1.6 m square, 3.6 m tall
    const cx = (st.rect.x0 + st.rect.x1) / 2, cy = (st.rect.y0 + st.rect.y1) / 2;
    for (const side of ['N', 'E', 'S', 'W'] as Side[]) place(art(1.4, 1.1), cx, cy, 2.75, side, 0.81);
    return;
  }
  const co = counterOf(st);
  if (co) { // the counter: 1.2 m along the aisle, 1 m tall; its aisle face is half its depth out from the centre
    const along = co.face === 'N' || co.face === 'S';
    place(art(1.1, 0.7), co.x, co.y, 0.55, co.face, (along ? co.rect.y1 - co.rect.y0 : co.rect.x1 - co.rect.x0) / 2 + 0.006);
  }
  // the sign: a white board hung over the middle of the front, above the fascia, the logo on both faces
  const f = st.front, [dx, dy] = DIR[f], x = f === 'E' ? st.rect.x1 : f === 'W' ? st.rect.x0 : st.label.x, y = f === 'N' ? st.rect.y1 : f === 'S' ? st.rect.y0 : st.label.y;
  const bw = Math.min(2.6, Math.max(1.6, st.label.len - 0.4)), bh = 0.9, cy = WALL_H + 0.15 + bh / 2, inset = -0.35;
  const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  place(board, x, y, cy, f, inset);
  for (const q of [-bw / 2 + 0.15, bw / 2 - 0.15]) { // two hangers up to the rig
    const along = f === 'N' || f === 'S', hx = x + dx * inset + (along ? q : 0), hy = y + dy * inset + (along ? 0 : -q), p = toWorld(hx, hy, cy + bh / 2 + 0.3);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.02), new THREE.MeshLambertMaterial({ color: FAIR.frame })); rod.position.set(p.x, p.y, p.z); g.add(rod);
  }
  place(art(bw - 0.16, bh - 0.14), x, y, cy, f, inset + 0.035);
  const back = art(bw - 0.16, bh - 0.14); place(back, x, y, cy, f, inset - 0.035); back.rotation.y += Math.PI;
}

/* ---------------- Lean X Digital's graphics, drawn from the booth design ---------------- */
const BLUE = '#1b7dbb', NAVY = '#0a2f52', YELLOW = '#f2c230';
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const sky = (g: CanvasRenderingContext2D, w: number, h: number, top = BLUE, bottom = NAVY) => { const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, top); grad.addColorStop(1, bottom); g.fillStyle = grad; g.fillRect(0, 0, w, h); };
const planet = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => { const grad = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r); grad.addColorStop(0, 'rgba(120,200,240,0.55)'); grad.addColorStop(1, 'rgba(120,200,240,0)'); g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(70,160,220,0.45)'; g.beginPath(); g.arc(cx, cy, r * 0.92, 0, Math.PI * 2); g.fill(); };
/** "lean.x digital" with the x in yellow, centred at (x, y). */
const logo = (g: CanvasRenderingContext2D, x: number, y: number, size: number, both = true) => {
  g.font = `800 ${size}px Urbanist, Arial`; g.textBaseline = 'middle';
  const a = 'lean.', b = 'x', c = ' digital', d = both ? '   |   nexova' : '';
  const wa = g.measureText(a).width, wb = g.measureText(b).width, wc = g.measureText(c).width, wd = g.measureText(d).width, total = wa + wb + wc + wd;
  let cx = x - total / 2; g.textAlign = 'left';
  g.fillStyle = '#fff'; g.fillText(a, cx, y); cx += wa; g.fillStyle = YELLOW; g.fillText(b, cx, y); cx += wb; g.fillStyle = '#fff'; g.fillText(c, cx, y); cx += wc;
  if (both) { g.font = `600 ${size}px Urbanist, Arial`; g.fillText(d, cx, y); }
  g.textAlign = 'center';
};
const mixed = (g: CanvasRenderingContext2D, parts: [string, string][], x: number, y: number, font: string) => {
  g.font = font; g.textBaseline = 'middle'; const total = parts.reduce((s, p) => s + g.measureText(p[0]).width, 0); let cx = x - total / 2; g.textAlign = 'left';
  for (const [t, col] of parts) { g.fillStyle = col; g.fillText(t, cx, y); cx += g.measureText(t).width; }
  g.textAlign = 'center';
};
function heroBackWall(): HTMLCanvasElement {
  const c = canvas(1024, 828), g = c.getContext('2d')!; sky(g, 1024, 828, '#2489c6', '#0c3a63'); planet(g, 512, 1160, 720);
  logo(g, 512, 92, 40);
  mixed(g, [['Building ', '#fff'], ['Brands ', YELLOW], ['Driving ', '#fff'], ['Growth', YELLOW]], 512, 250, '800 84px Urbanist, Arial');
  g.fillStyle = '#e8f2fa'; g.font = '500 32px Urbanist, Arial'; g.fillText('Where strategy, creativity, and technology drive growth', 512, 322);
  // the crew: four Nexos on bean bags, as the design shows them, drawn as their silhouettes
  for (const [x, y, s] of [[300, 610, 1], [440, 590, 1.05], [590, 600, 1], [740, 615, 0.95]] as const) {
    g.fillStyle = '#12365a'; g.beginPath(); g.ellipse(x, y + 95 * s, 95 * s, 48 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f6f8'; g.beginPath(); g.ellipse(x, y + 40 * s, 52 * s, 44 * s, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, y - 30 * s, 52 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.ellipse(x + 6 * s, y - 26 * s, 36 * s, 30 * s, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#00e5ff'; g.lineWidth = 4 * s; g.beginPath(); g.arc(x + 6 * s, y - 20 * s, 18 * s, 0.25, Math.PI - 0.25); g.stroke();
  }
  return c;
}
function heroRollup(): HTMLCanvasElement {
  const c = canvas(512, 1220), g = c.getContext('2d')!; sky(g, 512, 1220, '#1d84c3', '#0b2f52'); planet(g, 256, 1500, 620);
  logo(g, 256, 90, 30, false); g.fillStyle = '#cfe6f7'; g.font = '600 26px Urbanist, Arial'; g.fillText('nexova', 256, 130);
  g.fillStyle = '#fff'; g.font = '800 64px Urbanist, Arial'; g.fillText('Ideas', 256, 300); g.fillText('into', 256, 372); g.fillStyle = YELLOW; g.fillText('Growth', 256, 444);
  g.fillStyle = '#e8f2fa'; g.font = '600 24px Urbanist, Arial'; ['BRAND', 'MARKETING', 'SALES'].forEach((t, i) => g.fillText(t, 256, 560 + i * 40));
  g.fillStyle = '#fff'; g.font = '700 26px Urbanist, Arial'; g.fillText('THINK BIGGER. GROW FASTER.', 256, 1040); g.font = '500 22px Urbanist, Arial'; g.fillText('www.leanxdigital.io', 256, 1090); g.fillText('www.nexova.my', 256, 1122);
  return c;
}
function heroRollupDark(): HTMLCanvasElement {
  const c = canvas(512, 1220), g = c.getContext('2d')!; sky(g, 512, 1220, '#0b1f3a', '#123d6a'); planet(g, 470, 260, 130);
  g.fillStyle = YELLOW; g.globalAlpha = 0.85; g.save(); g.translate(256, 640); g.rotate(-0.5); g.fillRect(-40, -260, 80, 520); g.restore(); g.globalAlpha = 1;
  logo(g, 256, 120, 30, false); g.fillStyle = '#cfe6f7'; g.font = '600 26px Urbanist, Arial'; g.fillText('nexova', 256, 160);
  mixed(g, [['lean.', '#fff'], ['x', YELLOW]], 256, 330, '800 88px Urbanist, Arial'); g.fillStyle = '#fff'; g.font = '800 88px Urbanist, Arial'; g.fillText('digital', 256, 420);
  g.font = '600 22px Urbanist, Arial'; g.fillText('YOUR NEXT DIGITAL LEAP', 256, 880); g.font = '500 20px Urbanist, Arial'; g.fillText('www.leanxdigital.io', 256, 930); g.fillText('www.nexova.my', 256, 960);
  g.font = '800 44px Urbanist, Arial'; g.fillText('nexova', 256, 1090);
  return c;
}
function heroPoster(): HTMLCanvasElement {
  const c = canvas(512, 790), g = c.getContext('2d')!; sky(g, 512, 790, '#1d84c3', '#0b2f52'); planet(g, 256, 980, 420);
  logo(g, 256, 70, 30, false); g.fillStyle = '#cfe6f7'; g.font = '600 18px Urbanist, Arial'; g.fillText('DIGITAL GROWTH AGENCY', 256, 108);
  g.fillStyle = '#fff'; g.font = '800 54px Urbanist, Arial'; g.fillText('We Turn Traffic', 256, 200); mixed(g, [['Into ', '#fff'], ['Sales', YELLOW]], 256, 262, '800 54px Urbanist, Arial');
  g.fillStyle = '#e8f2fa'; g.font = '600 20px Urbanist, Arial'; g.fillText('BRAND  ·  MARKETING  ·  SALES SYSTEM', 256, 330); g.fillText('ONE SEAMLESS ENGINE', 256, 362);
  g.fillStyle = '#fff'; g.fillRect(56, 640, 400, 90); g.fillStyle = NAVY; g.font = '800 26px Urbanist, Arial'; g.fillText('FREE STRATEGY', 256, 672); g.fillText('CONSULTATION', 256, 702);
  return c;
}
function heroCounter(): HTMLCanvasElement {
  const c = canvas(1024, 720), g = c.getContext('2d')!; sky(g, 1024, 720, '#1d84c3', '#0b2f52'); planet(g, 900, 760, 420);
  mixed(g, [['lean.', '#fff'], ['x', YELLOW]], 512, 300, '800 150px Urbanist, Arial'); g.fillStyle = '#fff'; g.font = '800 150px Urbanist, Arial'; g.fillText('digital', 512, 440);
  return c;
}
