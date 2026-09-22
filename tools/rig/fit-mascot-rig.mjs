// Gives a mascot body our own skeleton and skin. Meshy's auto-rigger fits a human template, which put Nexo's
// knees inside its boots and left its spine with no skin. This tool reads the joint positions for the body from
// a small config (the left side and the centre; the right side is mirrored exactly), keeps Meshy's 24 joint
// names so the shared clip library retargets unchanged, gives every joint an identity rest rotation (what the
// world-space retarget wants), and weights every vertex by segment capsules with rigid parts for the helmet, the
// shoulder pads and the boots (with soft borders, so nothing cracks when they move), smoothed over the welded surface. The mesh, materials and textures are kept as they are.
//
//   node tools/rig/fit-mascot-rig.mjs [in.glb] [rig.json] [out-raw.glb] [out-web.glb] [report.json]
//   PROFILE=1 node tools/rig/fit-mascot-rig.mjs in.glb      prints the body's cross-sections, to write the config from
//
// Units: metres, y up, the character facing +z, its left side at +x, the floor at the mesh's lowest point.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, meshopt, compactPrimitive, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [IN = 'assets-src/characters/nexo/nexo-raw.glb', CONFIG = 'assets-src/characters/nexo/rig.json', OUT_RAW = 'assets-src/characters/nexo/nexo-rig2.glb', OUT_WEB = 'public/fair/nexo.glb', REPORT = 'assets-src/characters/nexo/rig-report.json'] = process.argv.slice(2);
const MAX_INF = 4;
/** The web copy's triangle budget: the fair draws up to 25 bodies at once on phones. The raw keeps every triangle. */
const WEB_TRIS = Number(process.env.WEB_TRIS ?? 55000);
const R = (v) => Math.round(v * 1000) / 1000;
const log = (...a) => console.log(...a);

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
const root = doc.getRoot();
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray();
const idx = prim.getIndices().getArray();
const N = pos.length / 3;
const X = (i) => pos[i * 3], Y = (i) => pos[i * 3 + 1], Z = (i) => pos[i * 3 + 2];
let minY = Infinity, maxY = -Infinity;
for (let i = 0; i < N; i++) { minY = Math.min(minY, Y(i)); maxY = Math.max(maxY, Y(i)); }

if (process.env.PROFILE) { // the body's cross-sections, band by band: what the config is written from
  const BAND = 0.01, GAP = 0.02, nb = Math.ceil((maxY - minY) / BAND) + 1;
  const bands = Array.from({ length: nb }, () => []);
  for (let i = 0; i < N; i++) bands[Math.min(nb - 1, Math.floor((Y(i) - minY) / BAND))].push(i);
  const fmt = (c) => (c ? 'hw ' + c.hw.toFixed(3) + ' hd ' + c.hd.toFixed(3) + ' x ' + c.xmin.toFixed(2) + '..' + c.xmax.toFixed(2) + ' z ' + c.zmin.toFixed(2) + '..' + c.zmax.toFixed(2) + ' n ' + c.n : '-');
  for (let b = 0; b < nb; b += 2) {
    const ids = bands[b].slice().sort((p, q) => X(p) - X(q)); const cs = []; let cur = null, last = -Infinity;
    for (const i of ids) { if (!cur || X(i) - last > GAP) { cur = { xmin: X(i), xmax: X(i), zmin: Z(i), zmax: Z(i), n: 0 }; cs.push(cur); } cur.xmax = X(i); cur.zmin = Math.min(cur.zmin, Z(i)); cur.zmax = Math.max(cur.zmax, Z(i)); cur.n++; last = X(i); }
    for (const c of cs) { c.hw = (c.xmax - c.xmin) / 2; c.hd = (c.zmax - c.zmin) / 2; }
    log((minY + (b + 0.5) * BAND).toFixed(2), 'k', cs.length, '| centre', fmt(cs.find((c) => c.xmin <= 0 && c.xmax >= 0)), '| left', fmt(cs.filter((c) => c.xmin > 0.02).sort((a, c) => c.xmax - a.xmax)[0]));
  }
  process.exit(0);
}

/* ---------------- the skeleton from the config, the right side mirrored ---------------- */
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const PARENT = { Hips: null, Spine02: 'Hips', Spine01: 'Spine02', Spine: 'Spine01', neck: 'Spine', Head: 'neck', head_end: 'Head', headfront: 'Head',
  LeftShoulder: 'Spine', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightShoulder: 'Spine', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };
const NAMES = Object.keys(PARENT);
const mirror = (p) => [-p[0], p[1], p[2]];
const J = { ...cfg.joints };
for (const k of Object.keys(cfg.joints)) if (k.startsWith('Left')) J['Right' + k.slice(4)] = mirror(cfg.joints[k]);
for (const n of NAMES) if (!J[n]) throw new Error('config is missing joint ' + n);
const ENDS = { ...cfg.ends };
for (const k of Object.keys(cfg.ends)) if (k.startsWith('Left')) ENDS['Right' + k.slice(4)] = mirror(cfg.ends[k]);
const jointIndex = new Map(NAMES.map((n, i) => [n, i]));

/* ---------------- skin: capsules, rigid parts with soft borders, smoothing over the welded surface ---------------- */
const point = (bone, ref) => (Array.isArray(ref) ? ref : ref === 'end' ? ENDS[bone] : J[ref]);
const segs = [];
for (const [bone, a, b, r] of cfg.capsules) {
  segs.push({ bone, a: point(bone, a), b: point(bone, b), r });
  if (bone.startsWith('Left')) segs.push({ bone: 'Right' + bone.slice(4), a: mirror(point(bone, a)), b: mirror(point(bone, b)), r });
}
function segDist(p, s) {
  const ax = s.a[0], ay = s.a[1], az = s.a[2], bx = s.b[0] - ax, by = s.b[1] - ay, bz = s.b[2] - az;
  const l2 = bx * bx + by * by + bz * bz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - ax) * bx + (p[1] - ay) * by + (p[2] - az) * bz) / l2));
  return Math.hypot(p[0] - ax - bx * t, p[1] - ay - by * t, p[2] - az - bz * t);
}
const SIGMA = cfg.blend ?? 0.03, BAND = cfg.rigidBand ?? 0.04, helmet = cfg.rigid.helmet, pad = cfg.rigid.shoulderPad, boot = cfg.rigid.boot;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
/** Which rigid part a point belongs to and how fully: 1 inside, fading to 0 across BAND outside the part's border.
 * A hard border here is a crack in the game the moment the head turns or an arm swings. */
function rigidAt(p) {
  // The helmet is one piece: the sphere, plus the margin only up where the ear rings stand off it (marginAboveY), so
  // that down at collar height the collar ring around the helmet stays with the torso and the head turns inside it.
  // Its own blend band is narrow: the seam between helmet and collar is a hidden groove.
  const hb = helmet.band ?? BAND, R = helmet.radius + (p[1] > (helmet.marginAboveY ?? 1.05) ? helmet.margin : 0.015);
  const fh = Math.min(clamp01((R + hb - dist(p, helmet.centre)) / hb), clamp01((p[1] - helmet.aboveY + hb) / hb));
  if (fh > 0) return ['Head', fh];
  if (Math.abs(p[0]) > boot.minX) { const fb = clamp01((boot.belowY + BAND - p[1]) / BAND); if (fb > 0) return [p[0] > 0 ? 'LeftFoot' : 'RightFoot', fb]; } // the boots are one piece
  const fl = clamp01((pad.radius + BAND - dist(p, J.LeftArm)) / BAND); if (fl > 0) return ['LeftShoulder', fl]; // the shoulder pads are the torso's: the upper arm turns inside them
  const fr = clamp01((pad.radius + BAND - dist(p, J.RightArm)) / BAND); if (fr > 0) return ['RightShoulder', fr];
  return null;
}
// The mesh is split along its UV seams, so one position is often two or three vertices. They get one set of
// weights, and the smoothing runs over that welded surface: a seam whose two sides answered to different bones
// opened up whenever the body moved.
const grp = new Int32Array(N), gIndex = new Map(), gpos = [];
for (let i = 0; i < N; i++) { const k = `${X(i).toFixed(5)},${Y(i).toFixed(5)},${Z(i).toFixed(5)}`; let g = gIndex.get(k); if (g === undefined) { g = gpos.length; gIndex.set(k, g); gpos.push([X(i), Y(i), Z(i)]); } grp[i] = g; }
const G = gpos.length;
const W = Array.from({ length: G }, () => new Map());
for (let g = 0; g < G; g++) {
  const p = gpos[g], ws = [];
  for (const s of segs) { const d = Math.max(0, segDist(p, s) - s.r); const w = Math.exp((-d * d) / (2 * SIGMA * SIGMA)); if (w > 1e-5) ws.push([s.bone, w]); }
  ws.sort((a, b) => b[1] - a[1]);
  const soft = new Map(); for (const [bone, w] of ws.slice(0, MAX_INF)) soft.set(bone, w);
  if (!soft.size) { let best = null, bd = Infinity; for (const s of segs) { const d = segDist(p, s) - s.r; if (d < bd) { bd = d; best = s.bone; } } soft.set(best, 1); } // far from every capsule (the backpack, say): the nearest segment owns it
  let sum = 0; for (const w of soft.values()) sum += w; for (const [b, w] of soft) soft.set(b, w / sum);
  const rigid = rigidAt(p);
  if (!rigid) { W[g] = soft; continue; }
  const [bone, f] = rigid, m = new Map();
  for (const [b, w] of soft) m.set(b, w * (1 - f));
  m.set(bone, (m.get(bone) ?? 0) + f);
  W[g] = m;
}
const adj = Array.from({ length: G }, () => new Set());
for (let t = 0; t < idx.length; t += 3) { const a = grp[idx[t]], b = grp[idx[t + 1]], c = grp[idx[t + 2]]; if (a !== b) { adj[a].add(b); adj[b].add(a); } if (a !== c) { adj[a].add(c); adj[c].add(a); } if (b !== c) { adj[b].add(c); adj[c].add(b); } }
for (let pass = 0; pass < (cfg.smoothPasses ?? 2); pass++) {
  const next = W.map((m) => new Map(m));
  for (let g = 0; g < G; g++) {
    if (!adj[g].size) continue;
    const acc = new Map();
    for (const [b, w] of W[g]) acc.set(b, (acc.get(b) ?? 0) + 0.5 * w);
    const k = 0.5 / adj[g].size;
    for (const j of adj[g]) for (const [b, w] of W[j]) acc.set(b, (acc.get(b) ?? 0) + k * w);
    next[g] = new Map([...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_INF));
  }
  for (let g = 0; g < G; g++) W[g] = next[g];
}
log('welded surface:', G, 'positions for', N, 'vertices');
const joints4 = new Uint8Array(N * 4), weights4 = new Float32Array(N * 4);
const dominant = new Map();
for (let i = 0; i < N; i++) {
  const rows = [...W[grp[i]].entries()].sort((a, b) => b[1] - a[1]); const sum = rows.reduce((s, r) => s + r[1], 0) || 1;
  rows.forEach(([b, w], k) => { joints4[i * 4 + k] = jointIndex.get(b); weights4[i * 4 + k] = w / sum; });
  const d = rows[0][0]; const e = dominant.get(d) ?? { n: 0, minY: Infinity, maxY: -Infinity }; e.n++; e.minY = Math.min(e.minY, Y(i)); e.maxY = Math.max(e.maxY, Y(i)); dominant.set(d, e);
}

/* ---------------- symmetry of the skin: a mirrored vertex should answer to the mirrored bone ---------------- */
const cell = 0.015, grid = new Map();
const key = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
for (let i = 0; i < N; i++) { const k = key(X(i), Y(i), Z(i)); if (!grid.has(k)) grid.set(k, i); }
let checked = 0, agree = 0;
for (let i = 0; i < N; i += 5) {
  const j = grid.get(key(-X(i), Y(i), Z(i))); if (j === undefined) continue;
  checked++;
  const a = NAMES[joints4[i * 4]], b = NAMES[joints4[j * 4]];
  const m = a.startsWith('Left') ? 'Right' + a.slice(4) : a.startsWith('Right') ? 'Left' + a.slice(5) : a;
  if (b === m) agree++;
}

/* ---------------- the document: new nodes, new skin, the mesh reparented, textures kept ---------------- */
const scene = root.listScenes()[0];
const oldSkin = meshNode.getSkin(), oldArmature = meshNode.getParentNode();
for (const a of root.listAnimations()) a.dispose();
if (oldSkin) { for (const j of oldSkin.listJoints()) j.dispose(); oldSkin.dispose(); }
if (oldArmature) { oldArmature.removeChild(meshNode); oldArmature.dispose(); }
for (const n of root.listNodes()) if (n !== meshNode && !n.getMesh() && n.listChildren().length === 0 && !n.getParentNode()) n.dispose();
meshNode.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
scene.addChild(meshNode);
const armature = doc.createNode('Armature');
scene.addChild(armature);
const nodes = new Map();
for (const name of NAMES) {
  const p = J[name], parent = PARENT[name], pp = parent ? J[parent] : [0, 0, 0];
  const n = doc.createNode(name).setTranslation([p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]);
  (parent ? nodes.get(parent) : armature).addChild(n); nodes.set(name, n);
}
const buffer = root.listBuffers()[0];
const ibm = new Float32Array(NAMES.length * 16);
NAMES.forEach((name, i) => { const p = J[name]; ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16); });
const skin = doc.createSkin('mascot').setSkeleton(armature).setInverseBindMatrices(doc.createAccessor('ibm').setType('MAT4').setArray(ibm).setBuffer(buffer));
for (const name of NAMES) skin.addJoint(nodes.get(name));
meshNode.setSkin(skin);
prim.getAttribute('JOINTS_0')?.dispose(); prim.getAttribute('WEIGHTS_0')?.dispose();
prim.setAttribute('JOINTS_0', doc.createAccessor('joints').setType('VEC4').setArray(joints4).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor('weights').setType('VEC4').setArray(weights4).setBuffer(buffer));
for (const m of root.listMaterials()) { const e = m.getEmissiveTexture(); if (!e || e.getName() !== 'led') { m.setEmissiveTexture(null); m.setEmissiveFactor([0, 0, 0]); } } // only the LED strip glows
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }));
mkdirSync(dirname(OUT_RAW), { recursive: true }); mkdirSync(dirname(OUT_WEB), { recursive: true });
await io.write(OUT_RAW, doc);
const tris = idx.length / 3;
// Simplification that knows about shading: the simplifier weighs the normals as well as the positions, so it keeps
// triangles where the surface turns, and the visor glass is locked at full resolution (its texels are marked in the
// metal-rough map's R channel by normalize-mascot.mjs): a glossy dome shows its triangles in its highlight.
if (tris > WEB_TRIS * 1.15) {
  await MeshoptSimplifier.ready;
  const mat0 = root.listMaterials()[0], mr00 = mat0.getMetallicRoughnessTexture();
  let glassTex = null;
  if (mr00) { const o = await sharp(Buffer.from(mr00.getImage())).raw().toBuffer({ resolveWithObject: true }); glassTex = { w: o.info.width, h: o.info.height, c: o.info.channels, d: o.data }; }
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION').getArray(), nrm = p.getAttribute('NORMAL')?.getArray(), uv = p.getAttribute('TEXCOORD_0')?.getArray(), ix = p.getIndices().getArray(), nV = pos.length / 3;
    const lock = new Uint8Array(nV); let locked = 0;
    if (glassTex && uv) for (let i = 0; i < nV; i++) { const x = Math.min(glassTex.w - 1, Math.max(0, Math.floor(uv[i * 2] * glassTex.w))), y = Math.min(glassTex.h - 1, Math.max(0, Math.floor(uv[i * 2 + 1] * glassTex.h))); if (glassTex.d[(y * glassTex.w + x) * glassTex.c] > 200) { lock[i] = 1; locked++; } }
    const target = Math.floor((ix.length * WEB_TRIS) / tris / 3) * 3;
    const [newIx, err] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(ix), Float32Array.from(pos), 3, nrm ? Float32Array.from(nrm) : new Float32Array(0), nrm ? 3 : 0, nrm ? [0.5, 0.5, 0.5] : [], lock, target, 0.003, ['LockBorder']); // the error bound is loose: the triangle budget is the limit, the normal weights decide where they go
    p.getIndices().setArray(newIx);
    compactPrimitive(p);
    log(`simplified to ${newIx.length / 3} triangles (${locked} glass vertices locked, error ${err.toFixed(4)})`);
  }
}
// The simplifier keeps the surviving vertices' old normals on a mesh whose triangles are now several centimetres
// across, and every one of them shaded like a dent. Recompute them from the coarse mesh alone.
// Vertex normals from the faces alone. Per welded position the faces are grouped by direction (a face joins the
// group whose area-weighted mean normal lies within 50° of it, else starts one); each split vertex then averages
// the faces of the groups its own faces belong to. Smooth within a group, a hard edge between groups where the mesh
// splits its vertices, a rounded edge where it does not.
const normalsFromFaces = (P, I, map, NV, N0out) => {
  const nV = map.length, vf = Array.from({ length: NV }, () => []), own = Array.from({ length: nV }, () => []), FN = [], FA = [];
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; const ua = map[a], ub = map[b], uc = map[c]; if (ua === ub || ub === uc || ua === uc) continue; const f = FA.length; const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12; FN.push(nx / l, ny / l, nz / l); FA.push(l / 2); vf[ua].push(f); vf[ub].push(f); vf[uc].push(f); own[a].push(f); own[b].push(f); own[c].push(f); }
  const NF = FA.length;
  const COS = Math.cos((50 * Math.PI) / 180), group = new Int32Array(NF), out = N0out;
  for (let u = 0; u < NV; u++) { // group this position's faces
    const fl = vf[u].slice().sort((p, q) => FA[q] - FA[p]), groups = [];
    for (const f of fl) { let best = -1, bestD = COS; for (let g = 0; g < groups.length; g++) { const G = groups[g], l = Math.hypot(G[0], G[1], G[2]) || 1e-12, d = (G[0] * FN[f * 3] + G[1] * FN[f * 3 + 1] + G[2] * FN[f * 3 + 2]) / l; if (d >= bestD) { bestD = d; best = g; } } if (best < 0) { groups.push([FA[f] * FN[f * 3], FA[f] * FN[f * 3 + 1], FA[f] * FN[f * 3 + 2]]); best = groups.length - 1; } else { groups[best][0] += FA[f] * FN[f * 3]; groups[best][1] += FA[f] * FN[f * 3 + 1]; groups[best][2] += FA[f] * FN[f * 3 + 2]; } group[f] = best; }
  }
  for (let i = 0; i < nV; i++) {
    const u = map[i]; if (!own[i].length) continue;
    const mine = new Set(own[i].map((f) => group[f])); let sx = 0, sy = 0, sz = 0;
    for (const f of vf[u]) { if (!mine.has(group[f])) continue; sx += FA[f] * FN[f * 3]; sy += FA[f] * FN[f * 3 + 1]; sz += FA[f] * FN[f * 3 + 2]; }
    const l = Math.hypot(sx, sy, sz); if (l > 1e-12) { out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l; }
  }
  return out;
};
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'), ia = p.getIndices(); if (!pa || !na || !ia) continue;
  const P = pa.getArray(), nV = P.length / 3, ids = new Map(), map = new Int32Array(nV); let nU = 0;
  for (let i = 0; i < nV; i++) { const k = `${P[i * 3].toFixed(5)},${P[i * 3 + 1].toFixed(5)},${P[i * 3 + 2].toFixed(5)}`; let id = ids.get(k); if (id === undefined) { id = nU++; ids.set(k, id); } map[i] = id; }
  na.setArray(normalsFromFaces(P, ia.getArray(), map, nU, na.getArray().slice()));
}
// The web copy: no normal map (the seams are geometry; the generator's normal map only adds noise to the flat faces
// under the fair's sun), the colour map at its full 4096 (the camera gets close), roughness at 1024, all WebP.
for (const m of root.listMaterials()) m.setNormalTexture(null);
// The generators' roughness maps call the whole suit glossy (most texels 0.1–0.3), which turns the fair's sun into
// hard-edged highlight blobs on every flat face. The web copy gets a roughness map derived from the colour map
// instead: matte suit, glossy only where the texel is black (the visor). Metallic is zero everywhere.
{
  const mat = root.listMaterials()[0], ct = mat.getBaseColorTexture(), mr0 = mat.getMetallicRoughnessTexture();
  const { data, info } = await sharp(Buffer.from(ct.getImage())).resize(1024, 1024).raw().toBuffer({ resolveWithObject: true });
  let glass = null; // normalize-mascot.mjs --visor leaves the glass mask in the metal-rough map's R channel
  if (mr0) { const o = await sharp(Buffer.from(mr0.getImage())).resize(1024, 1024).raw().toBuffer({ resolveWithObject: true }); glass = new Uint8Array(1024 * 1024); let any = 0; for (let k = 0; k < glass.length; k++) { const v = o.data[k * o.info.channels]; glass[k] = v > 200 ? 1 : v > 64 ? 2 : 0; any += glass[k]; } if (!any) glass = null; } // R > 200: glass; 64..200: the bezel's patch
  let strip = null; // the LED strip (normalize-mascot.mjs --visor puts it on an emissive map named 'led') stays matte: its glow is the emissive, a gloss highlight along its raised edge read as a second line
  const emT = mat.getEmissiveTexture();
  if (emT && emT.getName() === 'led') { const o = await sharp(Buffer.from(emT.getImage())).resize(1024, 1024).raw().toBuffer({ resolveWithObject: true }); strip = new Uint8Array(1024 * 1024); for (let k = 0; k < strip.length; k++) strip[k] = Math.max(o.data[k * o.info.channels], o.data[k * o.info.channels + 1], o.data[k * o.info.channels + 2]) > 40 ? 1 : 0; }
  const out = Buffer.alloc(1024 * 1024 * 3);
  for (let i = 0, k = 0, t = 0; i < data.length; i += info.channels, k += 3, t++) {
    const r = data[i], g = data[i + 1], b = data[i + 2], lum = 0.299 * r + 0.587 * g + 0.114 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    const visor = (glass ? glass[t] === 1 : lum < 60 && sat < 40) && !(strip && strip[t]), bezel = glass && glass[t] === 2;
    out[k] = 255; out[k + 1] = visor ? 92 : bezel ? 150 : 217; out[k + 2] = 0; // G roughness 0.36 (visor glass: a highlight soft enough not to show the web copy's triangles), 0.59 (the bezel ring) or 0.85 (suit), B metallic 0
  }
  const png = await sharp(out, { raw: { width: 1024, height: 1024, channels: 3 } }).png().toBuffer();
  mat.setMetallicRoughnessTexture(doc.createTexture('roughness').setImage(new Uint8Array(png)).setMimeType('image/png')).setMetallicFactor(0).setRoughnessFactor(1);
}
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, slots: /^baseColorTexture$/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', nearLossless: true, slots: /^emissiveTexture$/ }), // the LED line: thin, high contrast, mostly black
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024], slots: /^(?!baseColorTexture|emissiveTexture).*$/ }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write(OUT_WEB, doc);

/* ---------------- the report ---------------- */
const legLen = J.LeftUpLeg[1] - J.LeftFoot[1];
const count = (re) => [...dominant.entries()].filter(([n]) => re.test(n)).reduce((s, [, e]) => s + e.n, 0);
let worstSum = 0; for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < 4; k++) s += weights4[i * 4 + k]; worstSum = Math.max(worstSum, Math.abs(1 - s)); }
const report = {
  source: IN, config: CONFIG, height: R(maxY - minY), vertices: N,
  ratios: { kneeOfLeg: R((J.LeftLeg[1] - J.LeftFoot[1]) / legLen), spineShareOfTorso: R(count(/^Spine/) / Math.max(1, count(/^Spine|^Hips|^neck/))), skinMirrorAgreement: R(agree / Math.max(1, checked)) },
  mirrorErrorCm: Math.max(...NAMES.filter((n) => n.startsWith('Left')).map((n) => { const a = J[n], b = J['Right' + n.slice(4)]; return 100 * Math.hypot(a[0] + b[0], a[1] - b[1], a[2] - b[2]); })),
  weightSumError: R(worstSum),
  joints: Object.fromEntries(NAMES.map((n) => [n, J[n].map(R)])),
  dominant: Object.fromEntries([...dominant.entries()].sort().map(([n, e]) => [n, { verts: e.n, minY: R(e.minY), maxY: R(e.maxY) }])),
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
log('ratios', JSON.stringify(report.ratios), 'mirror err cm', R(report.mirrorErrorCm), 'weight sum err', report.weightSumError);
log('dominant', JSON.stringify(report.dominant));
const webTris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
log('wrote', OUT_RAW, `(${tris} triangles)`, OUT_WEB, `(${Math.round(webTris)} triangles, webp: colour at its own size, derived roughness 1024, no normal map)`, REPORT);
