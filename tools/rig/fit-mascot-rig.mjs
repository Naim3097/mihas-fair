// Gives a mascot body our own skeleton and skin. Meshy's auto-rigger fits a human template, which put Nexo's
// knees inside its boots and left its spine with no skin. This tool reads the joint positions for the body from
// a small config (the left side and the centre; the right side is mirrored exactly), keeps Meshy's 24 joint
// names so the shared clip library retargets unchanged, gives every joint an identity rest rotation (what the
// world-space retarget wants), and weights every vertex by segment capsules with rigid cores for the helmet,
// the shoulder pads and the boots, smoothed over the mesh. The mesh, materials and textures are kept as they are.
//
//   node tools/rig/fit-mascot-rig.mjs [in.glb] [rig.json] [out-raw.glb] [out-web.glb] [report.json]
//   PROFILE=1 node tools/rig/fit-mascot-rig.mjs in.glb      prints the body's cross-sections, to write the config from
//
// Units: metres, y up, the character facing +z, its left side at +x, the floor at the mesh's lowest point.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [IN = 'assets-src/characters/nexo/nexo-raw.glb', CONFIG = 'assets-src/characters/nexo/rig.json', OUT_RAW = 'assets-src/characters/nexo/nexo-rig2.glb', OUT_WEB = 'public/fair/nexo.glb', REPORT = 'assets-src/characters/nexo/rig-report.json'] = process.argv.slice(2);
const MAX_INF = 4;
const R = (v) => Math.round(v * 1000) / 1000;
const log = (...a) => console.log(...a);

await MeshoptEncoder.ready;
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

/* ---------------- skin: capsules, rigid cores, smoothing ---------------- */
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
const SIGMA = cfg.blend ?? 0.03, helmet = cfg.rigid.helmet, pad = cfg.rigid.shoulderPad, boot = cfg.rigid.boot;
const W = Array.from({ length: N }, () => new Map());
const fixed = new Uint8Array(N);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
for (let i = 0; i < N; i++) {
  const p = [X(i), Y(i), Z(i)];
  if (p[1] > helmet.aboveY && dist(p, helmet.centre) < helmet.radius + helmet.margin) { W[i].set('Head', 1); fixed[i] = 1; continue; } // the helmet is one piece
  if (p[1] < boot.belowY && Math.abs(p[0]) > boot.minX) { W[i].set(p[0] > 0 ? 'LeftFoot' : 'RightFoot', 1); fixed[i] = 1; continue; } // the boots are one piece
  if (dist(p, J.LeftArm) < pad.radius) { W[i].set('LeftArm', 1); fixed[i] = 1; continue; } // the shoulder pads turn with the upper arm
  if (dist(p, J.RightArm) < pad.radius) { W[i].set('RightArm', 1); fixed[i] = 1; continue; }
  const ws = [];
  for (const s of segs) { const d = Math.max(0, segDist(p, s) - s.r); const w = Math.exp((-d * d) / (2 * SIGMA * SIGMA)); if (w > 1e-5) ws.push([s.bone, w]); }
  ws.sort((a, b) => b[1] - a[1]);
  for (const [bone, w] of ws.slice(0, MAX_INF)) W[i].set(bone, w);
  if (!W[i].size) { // far from every capsule (the backpack, say): the nearest segment owns it outright
    let best = null, bd = Infinity; for (const s of segs) { const d = segDist(p, s) - s.r; if (d < bd) { bd = d; best = s.bone; } } W[i].set(best, 1);
  }
}
const adj = Array.from({ length: N }, () => new Set());
for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b); }
for (let pass = 0; pass < (cfg.smoothPasses ?? 2); pass++) {
  const next = W.map((m) => new Map(m));
  for (let i = 0; i < N; i++) {
    if (fixed[i] || !adj[i].size) continue;
    const acc = new Map();
    for (const [b, w] of W[i]) acc.set(b, (acc.get(b) ?? 0) + 0.5 * w);
    const k = 0.5 / adj[i].size;
    for (const j of adj[i]) for (const [b, w] of W[j]) acc.set(b, (acc.get(b) ?? 0) + k * w);
    next[i] = new Map([...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_INF));
  }
  for (let i = 0; i < N; i++) W[i] = next[i];
}
const joints4 = new Uint8Array(N * 4), weights4 = new Float32Array(N * 4);
const dominant = new Map();
for (let i = 0; i < N; i++) {
  const rows = [...W[i].entries()].sort((a, b) => b[1] - a[1]); const sum = rows.reduce((s, r) => s + r[1], 0) || 1;
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
for (const m of root.listMaterials()) { m.setEmissiveTexture(null); m.setEmissiveFactor([0, 0, 0]); }
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }));
mkdirSync(dirname(OUT_RAW), { recursive: true }); mkdirSync(dirname(OUT_WEB), { recursive: true });
await io.write(OUT_RAW, doc);
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
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
log('wrote', OUT_RAW, OUT_WEB, REPORT);
