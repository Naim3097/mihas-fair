// Puts a generated mascot body into the frame the rig fitter expects before anything else touches it: metres,
// y up, facing +z with its left side at +x, centred on x and z, the floor at y = 0, every node transform baked
// into the vertices, and one welded mesh. Generators disagree on all of these (unit boxes, z up, facing -z,
// a node hierarchy with transforms), so this runs first and fit-mascot-rig.mjs never has to know.
//
//   node tools/rig/normalize-mascot.mjs in.glb out.glb [--height 1.6] [--yaw 180] [--zup] [--mirror] [--gain 1.4]
//
//   --height  how tall the body stands, metres (default 1.6, NEXO_HEIGHT in src/fair/nexo.ts)
//   --yaw     turn the body about y by this many degrees first, so its face ends up on +z
//   --zup     the source is z up: rotate it onto y up first
//   --mirror  flip x (a body whose left side came out at -x)
//   --gain    multiply the base colour texture by this (clipped). Generators bake their own lighting into the
//             colour map and hand back a grey suit; the fair lights the body itself, so the suit has to be white.
//             Black (the visor) stays black and saturated colour (the LED blue) keeps its hue.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, flatten, join, prune, weld, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const has = (k) => args.includes(k);
const [IN, OUT] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--height', '--yaw', '--gain', '--textures-from', '--visor', '--accent', '--led', '--flatten', '--smooth-greys', '--denoise', '--whiten-suit'].includes(args[i - 1])));
if (!IN || !OUT) { console.error('usage: node tools/rig/normalize-mascot.mjs in.glb out.glb [--height 1.6] [--yaw deg] [--zup] [--mirror] [--gain 1.4 | --lift] [--textures-from other.glb] [--visor cx,cy,cz,maxDist,minZ]'); process.exit(1); }
const HEIGHT = parseFloat(flag('--height', '1.6')), YAW = (parseFloat(flag('--yaw', '0')) * Math.PI) / 180, ZUP = has('--zup'), MIRROR = has('--mirror'), GAIN = parseFloat(flag('--gain', '1'));
// --textures-from other.glb: take the colour, metal-rough and normal maps (and factors) from another GLB of the same
// body with the same UV layout, e.g. a retexture pass that kept the original UVs. Geometry and UVs stay as they are.
const TEX_FROM = flag('--textures-from', null);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
const root = doc.getRoot();
for (const a of root.listAnimations()) a.dispose();
for (const s of root.listSkins()) s.dispose();
if (TEX_FROM) {
  const other = await io.read(TEX_FROM), om = other.getRoot().listMaterials()[0], mat = root.listMaterials()[0];
  const take = (t) => (t ? doc.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType()) : null);
  mat.setBaseColorTexture(take(om.getBaseColorTexture())).setMetallicRoughnessTexture(take(om.getMetallicRoughnessTexture())).setNormalTexture(take(om.getNormalTexture()));
  mat.setBaseColorFactor(om.getBaseColorFactor()).setMetallicFactor(om.getMetallicFactor()).setRoughnessFactor(om.getRoughnessFactor());
  mat.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
  console.log(`textures from ${TEX_FROM}: colour ${!!om.getBaseColorTexture()}, metal-rough ${!!om.getMetallicRoughnessTexture()}, normal ${!!om.getNormalTexture()}`);
}
await doc.transform(dequantize(), flatten());

/* ---------------- bake every node's transform into its vertices ---------------- */
const mul = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];
function normalMatrix(m) { // inverse-transpose of the upper 3x3
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) || 1e-12;
  const inv = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  return [inv[0], inv[3], inv[6], 0, inv[1], inv[4], inv[7], 0, inv[2], inv[5], inv[8], 0, 0, 0, 0, 1]; // transposed, as a 4x4 with no translation
}
function bake(prim, m, seen) {
  const nm = normalMatrix(m);
  for (const [sem, mat, w] of [['POSITION', m, 1], ['NORMAL', nm, 0], ['TANGENT', m, 0]]) {
    let acc = prim.getAttribute(sem); if (!acc) continue;
    if (seen.has(acc)) { acc = acc.clone(); prim.setAttribute(sem, acc); }
    seen.add(acc);
    const arr = acc.getArray().slice(), n = acc.getElementSize();
    for (let k = 0; k < arr.length; k += n) {
      const [x, y, z] = mul(mat, arr[k], arr[k + 1], arr[k + 2], w);
      if (sem === 'POSITION') { arr[k] = x; arr[k + 1] = y; arr[k + 2] = z; }
      else { const l = Math.hypot(x, y, z) || 1; arr[k] = x / l; arr[k + 1] = y / l; arr[k + 2] = z / l; }
    }
    acc.setArray(arr);
  }
}
const seen = new Set();
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) bake(prim, m, seen);
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/* ---------------- the frame: z up → y up, yaw, mirror, then metres with the floor at 0 ---------------- */
const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
const bounds = () => { const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; for (const p of prims) { const a = p.getAttribute('POSITION').getArray(); for (let k = 0; k < a.length; k += 3) for (let j = 0; j < 3; j++) { b.min[j] = Math.min(b.min[j], a[k + j]); b.max[j] = Math.max(b.max[j], a[k + j]); } } return b; };
const c = Math.cos(YAW), s = Math.sin(YAW);
// z up → y up: (x, y, z) → (x, z, -y); yaw about y; mirror x
let R = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mm = (A, B) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += A[k * 4 + i] * B[j * 4 + k]; return o; };
if (ZUP) R = mm([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1], R);
if (YAW) R = mm([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1], R);
if (MIRROR) R = mm([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], R);
const seen2 = new Set();
for (const p of prims) bake(p, R, seen2);
if (MIRROR) for (const p of prims) { const idx = p.getIndices(); if (idx) { const a = idx.getArray().slice(); for (let k = 0; k + 2 < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } idx.setArray(a); } }
let b = bounds();
const scale = HEIGHT / Math.max(1e-9, b.max[1] - b.min[1]);
const T = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, -((b.min[0] + b.max[0]) / 2) * scale, -b.min[1] * scale, -((b.min[2] + b.max[2]) / 2) * scale, 1];
const seen3 = new Set();
for (const p of prims) bake(p, T, seen3);

/* ---------------- smooth the surface: feature-preserving denoising ---------------- */
// --denoise passes,sigmaS,sigmaR[,ring]  (e.g. 20,0.02,0.4,2). Generators bake the references' shading into the
// geometry as soft creases and lumps a few centimetres wide; with no normal map the fair's sun shades every one of
// them into a smudge. Bilateral filtering of the face normals (Sun, Rosin, Martin & Langbein 2007) over each
// face's ring-neighbourhood, weighted by area, by distance (sigmaS, metres) and by normal difference (sigmaR, the
// chord between unit normals: 0.4 keeps creases sharper than ~45°), then the vertices move to fit the filtered
// normals. Positions are welded by coordinate so UV seams stay closed; the vertex normals are recomputed from the
// moved surface from the faces alone (see normalsFromFaces), so boxes keep their edges and domes lose their lumps.
// A vertex whose surrounding filtered normals disagree (a thin part, a corner) does not move, and no vertex moves
// more than 1.5 mm per pass: no fold-overs. Tangents are dropped (stale).

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
const DENOISE = flag('--denoise', null);
if (DENOISE) {
  const [PASSES, SIG_S, SIG_R, RING = 1] = DENOISE.split(',').map(Number);
  const key = (x, y, z) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
  const ids = new Map(), X = [], primMaps = [];
  for (const p of prims) {
    const pa = p.getAttribute('POSITION').getArray(), map = new Int32Array(pa.length / 3);
    for (let i = 0; i < map.length; i++) { const k = key(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]); let id = ids.get(k); if (id === undefined) { id = X.length / 3; ids.set(k, id); X.push(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]); } map[i] = id; }
    primMaps.push(map);
  }
  const NV = X.length / 3, F = [];
  prims.forEach((p, pi) => { const ix = p.getIndices().getArray(), map = primMaps[pi]; for (let t = 0; t < ix.length; t += 3) { const a = map[ix[t]], b = map[ix[t + 1]], c = map[ix[t + 2]]; if (a !== b && b !== c && a !== c) F.push(a, b, c); } });
  const NF = F.length / 3, vf = Array.from({ length: NV }, () => []);
  for (let f = 0; f < NF; f++) { vf[F[f * 3]].push(f); vf[F[f * 3 + 1]].push(f); vf[F[f * 3 + 2]].push(f); }
  const fn = new Array(NF);
  for (let f = 0; f < NF; f++) {
    let ring = new Set([f]);
    for (let r = 0; r < RING; r++) { const next = new Set(ring); for (const g of ring) for (let j = 0; j < 3; j++) for (const h of vf[F[g * 3 + j]]) next.add(h); ring = next; }
    ring.delete(f); fn[f] = Int32Array.from(ring);
  }
  const N = new Float64Array(NF * 3), C = new Float64Array(NF * 3), A = new Float64Array(NF);
  const faceGeom = () => { for (let f = 0; f < NF; f++) { const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2], ax = X[a * 3], ay = X[a * 3 + 1], az = X[a * 3 + 2], ux = X[b * 3] - ax, uy = X[b * 3 + 1] - ay, uz = X[b * 3 + 2] - az, vx = X[c * 3] - ax, vy = X[c * 3 + 1] - ay, vz = X[c * 3 + 2] - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12; N[f * 3] = nx / l; N[f * 3 + 1] = ny / l; N[f * 3 + 2] = nz / l; A[f] = l / 2; C[f * 3] = (ax + X[b * 3] + X[c * 3]) / 3; C[f * 3 + 1] = (ay + X[b * 3 + 1] + X[c * 3 + 1]) / 3; C[f * 3 + 2] = (az + X[b * 3 + 2] + X[c * 3 + 2]) / 3; } };
  faceGeom();
  const X0 = Float64Array.from(X);
  const M = new Float64Array(NF * 3), s2 = 2 * SIG_S * SIG_S, r2 = 2 * SIG_R * SIG_R;
  for (let it = 0; it < PASSES; it++) {
    for (let f = 0; f < NF; f++) {
      const nx = N[f * 3], ny = N[f * 3 + 1], nz = N[f * 3 + 2], cx = C[f * 3], cy = C[f * 3 + 1], cz = C[f * 3 + 2];
      let sx = A[f] * nx, sy = A[f] * ny, sz = A[f] * nz;
      for (const g of fn[f]) {
        const dx = C[g * 3] - cx, dy = C[g * 3 + 1] - cy, dz = C[g * 3 + 2] - cz, ex = N[g * 3] - nx, ey = N[g * 3 + 1] - ny, ez = N[g * 3 + 2] - nz;
        const w = A[g] * Math.exp(-(dx * dx + dy * dy + dz * dz) / s2 - (ex * ex + ey * ey + ez * ez) / r2);
        sx += w * N[g * 3]; sy += w * N[g * 3 + 1]; sz += w * N[g * 3 + 2];
      }
      const l = Math.hypot(sx, sy, sz) || 1e-12; M[f * 3] = sx / l; M[f * 3 + 1] = sy / l; M[f * 3 + 2] = sz / l;
    }
    N.set(M);
  }
  for (let it = 0; it < PASSES; it++) {
    for (let v = 0; v < NV; v++) {
      const fs = vf[v]; if (!fs.length) continue;
      const x = X[v * 3], y = X[v * 3 + 1], z = X[v * 3 + 2]; let dx = 0, dy = 0, dz = 0, cx = 0, cy = 0, cz = 0;
      for (const f of fs) { const d = N[f * 3] * (C[f * 3] - x) + N[f * 3 + 1] * (C[f * 3 + 1] - y) + N[f * 3 + 2] * (C[f * 3 + 2] - z); dx += N[f * 3] * d; dy += N[f * 3 + 1] * d; dz += N[f * 3 + 2] * d; cx += N[f * 3]; cy += N[f * 3 + 1]; cz += N[f * 3 + 2]; }
      if (Math.hypot(cx, cy, cz) / fs.length < 0.6) continue; // the filtered normals around this vertex disagree: a thin part, a corner, a crease; it stays (no fold-overs)
      dx /= fs.length; dy /= fs.length; dz /= fs.length; const dl = Math.hypot(dx, dy, dz); if (dl > 0.0015) { dx *= 0.0015 / dl; dy *= 0.0015 / dl; dz *= 0.0015 / dl; }
      const nx = x + dx, ny = y + dy, nz = z + dz; let ok = true; // the move must not fold any of the vertex's faces against its filtered normal
      for (const f of fs) { const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2]; const px = a === v ? nx : X[a * 3], py = a === v ? ny : X[a * 3 + 1], pz = a === v ? nz : X[a * 3 + 2], qx = b === v ? nx : X[b * 3], qy = b === v ? ny : X[b * 3 + 1], qz = b === v ? nz : X[b * 3 + 2], rx = c === v ? nx : X[c * 3], ry = c === v ? ny : X[c * 3 + 1], rz = c === v ? nz : X[c * 3 + 2]; const ux = qx - px, uy = qy - py, uz = qz - pz, wx = rx - px, wy = ry - py, wz = rz - pz, fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx; const l = Math.hypot(fx, fy, fz) || 1e-12; if ((fx * N[f * 3] + fy * N[f * 3 + 1] + fz * N[f * 3 + 2]) / l < 0.2) { ok = false; break; } }
      if (!ok) continue;
      X[v * 3] = nx; X[v * 3 + 1] = ny; X[v * 3 + 2] = nz;
    }
    for (let f = 0; f < NF; f++) { const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2]; C[f * 3] = (X[a * 3] + X[b * 3] + X[c * 3]) / 3; C[f * 3 + 1] = (X[a * 3 + 1] + X[b * 3 + 1] + X[c * 3 + 1]) / 3; C[f * 3 + 2] = (X[a * 3 + 2] + X[b * 3 + 2] + X[c * 3 + 2]) / 3; }
  }
  let moved = 0, maxMove = 0, sumMove = 0; const big = [];
  for (let v = 0; v < NV; v++) { const d = Math.hypot(X[v * 3] - X0[v * 3], X[v * 3 + 1] - X0[v * 3 + 1], X[v * 3 + 2] - X0[v * 3 + 2]); sumMove += d; if (d > maxMove) maxMove = d; if (d > 0.001) moved++; if (d > 0.008) big.push([d, X0[v * 3], X0[v * 3 + 1], X0[v * 3 + 2]]); }
  big.sort((p, q) => q[0] - p[0]);
  prims.forEach((p, pi) => {
    const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'), Pn = pa.getArray().slice(), map = primMaps[pi];
    for (let i = 0; i < map.length; i++) { const v = map[i]; Pn[i * 3] = X[v * 3]; Pn[i * 3 + 1] = X[v * 3 + 1]; Pn[i * 3 + 2] = X[v * 3 + 2]; }
    pa.setArray(Pn);
    if (na) na.setArray(normalsFromFaces(Pn, p.getIndices().getArray(), map, NV, na.getArray().slice()));
    const t = p.getAttribute('TANGENT'); if (t) p.setAttribute('TANGENT', null);
  });
  console.log(`denoise: ${PASSES} passes over ${NF} faces (ring ${RING}, sigma ${SIG_S} m / ${SIG_R}): ${moved} of ${NV} positions moved more than 1 mm, mean ${(1000 * sumMove / NV).toFixed(2)} mm, max ${(1000 * maxMove).toFixed(1)} mm; ${big.length} moved more than 8 mm, the largest at ${big.slice(0, 6).map(([d, x, y, z]) => `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) ${(1000 * d).toFixed(0)} mm`).join(', ')}`);
}

/* ---------------- the accent colour: one clean blue ---------------- */
// --accent 00e5ff: every bluish texel (the rings, the LED's glow) takes the accent's hue and saturation and keeps
// its own brightness. Retexture passes paint the blue unevenly, speckled with grey; one hue reads as a full fill.
const ACCENT = flag('--accent', null);
if (ACCENT) {
  const [ar, ag, ab] = [0, 2, 4].map((i) => parseInt(ACCENT.slice(i, i + 2), 16)), aLum = 0.299 * ar + 0.587 * ag + 0.114 * ab;
  const mat = root.listMaterials()[0], tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let k = 0; k < data.length; k += info.channels) {
    const r = data[k], g = data[k + 1], b = data[k + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (!(b > 110 && b - r > 40 && mx && (mx - mn) / mx > 0.3)) continue;
    const s = (0.299 * r + 0.587 * g + 0.114 * b) / aLum;
    data[k] = Math.min(255, Math.round(ar * s)); data[k + 1] = Math.min(255, Math.round(ag * s)); data[k + 2] = Math.min(255, Math.round(ab * s)); n++;
  }
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  img = tex.getMimeType() === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  tex.setImage(new Uint8Array(await img.toBuffer()));
  console.log(`accent #${ACCENT}: ${n} bluish texels snapped`);
}

/* ---------------- the visor: black glass, the LED, nothing else ---------------- */
// --visor cx,cy,cz,maxDist,minZ (metres, in the frame the body is now in): texels of the visor glass, the surface
// inside the helmet sphere (closer than maxDist to its centre) on the face side (z above minZ), become black except
// the LED line and its glow (blue texels, dilated a little). Retexture passes paint the reference renders'
// reflections into the glass; in the game they read as a second, ghost smile next to the real LED.
let keepTex = null; // texels the later passes must leave alone (the visor rim)
const VISOR = flag('--visor', null), LED = flag('--led', null);
if (VISOR) {
  const [cx, cy, cz, maxD, minZ, RIM_W = 0.012, RING_W = 0.06, COLLAR_Y = -Infinity, CHIN_R = 0] = VISOR.split(',').map(Number);
  const mat = root.listMaterials()[0], tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
  const Wt = info.width, Ht = info.height, ch = info.channels;
  const lumAt = (k) => 0.299 * data[k * ch] + 0.587 * data[k * ch + 1] + 0.114 * data[k * ch + 2];
  const raster = (v, px, py, fn) => { // calls fn(k, l0, l1, l2) for every texel a UV triangle covers (a little past its edges)
    const det = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]); if (Math.abs(det) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(Wt - 1, Math.ceil(Math.max(...px)) + 1), y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(Ht - 1, Math.ceil(Math.max(...py)) + 1), margin = -1.5 / Math.sqrt(Math.abs(det));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const l1 = ((px[1] - qx) * (py[2] - qy) - (px[2] - qx) * (py[1] - qy)) / det, l2 = ((px[2] - qx) * (py[0] - qy) - (px[0] - qx) * (py[2] - qy)) / det, l0 = 1 - l1 - l2;
      if (l0 >= margin && l1 >= margin && l2 >= margin) fn(y * Wt + x, l0, l1, l2, l0 >= 0 && l1 >= 0 && l2 >= 0);
    }
  };
  // the gate (texels of the helmet's front) and the atlas coverage (texels any triangle uses)
  const front = new Uint8Array(Wt * Ht), helm = new Uint8Array(Wt * Ht), covered = new Uint8Array(Wt * Ht), owned = new Uint8Array(Wt * Ht); // owned: a triangle contains the texel's centre (a margin write never overrides an owner: islands lie a few texels apart in the atlas, and a gap texel given a neighbour island's position was painted for the wrong place)
  const TX = new Float32Array(Wt * Ht), TY = new Float32Array(Wt * Ht), TZ = new Float32Array(Wt * Ht), TD = new Float32Array(Wt * Ht); // each texel's 3D position and distance from the helmet centre
  for (const p of prims) {
    const pa = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), ix = p.getIndices().getArray();
    const near = (i) => Math.hypot(pa[i * 3] - cx, pa[i * 3 + 1] - cy, pa[i * 3 + 2] - cz) < maxD + 0.06 && pa[i * 3 + 2] > minZ, nearHelm = (i) => Math.hypot(pa[i * 3] - cx, pa[i * 3 + 1] - cy, pa[i * 3 + 2] - cz) < maxD + 0.1;
    for (let t = 0; t < ix.length; t += 3) {
      const v = [ix[t], ix[t + 1], ix[t + 2]], px = v.map((i) => uv[i * 2] * Wt), py = v.map((i) => uv[i * 2 + 1] * Ht);
      const isFront = v.some(near), isHelm = v.some(nearHelm);
      raster(v, px, py, (k, l0, l1, l2, inTri) => { covered[k] = 1; if (!inTri && owned[k]) return; if (inTri) owned[k] = 1; front[k] = isFront ? 1 : 0; helm[k] = isHelm ? 1 : 0; const a = Math.max(0, l0), b2 = Math.max(0, l1), c2 = Math.max(0, l2), sm = a + b2 + c2 || 1; const X = (a * pa[v[0] * 3] + b2 * pa[v[1] * 3] + c2 * pa[v[2] * 3]) / sm, Y = (a * pa[v[0] * 3 + 1] + b2 * pa[v[1] * 3 + 1] + c2 * pa[v[2] * 3 + 1]) / sm, Z = (a * pa[v[0] * 3 + 2] + b2 * pa[v[1] * 3 + 2] + c2 * pa[v[2] * 3 + 2]) / sm; TX[k] = X; TY[k] = Y; TZ[k] = Z; TD[k] = Math.hypot(X - cx, Y - cy, Z - cz); });
    }
  }
  const morph = (src, r, grow) => { // separable dilation (grow) or erosion, r pixels
    const pass = (inp, stride, len, count) => { const out = new Uint8Array(inp.length); for (let j = 0; j < count; j++) { const base = stride === 1 ? j * len : j; const at = (i) => inp[base + i * stride]; for (let i = 0; i < len; i++) { let v = grow ? 0 : 1; for (let dd = -r; dd <= r; dd++) { const ii = i + dd; const sv = ii < 0 || ii >= len ? 0 : at(ii); if (grow ? sv : !sv) { v = grow ? 1 : 0; break; } } out[base + i * stride] = v; } } return out; };
    return pass(pass(src, 1, Wt, Ht), Wt, Ht, Wt);
  };
  // The glass: the painted black plus every painted blue on the helmet's front (the retexture's own LED strokes
  // and its reflection streaks), closed over whatever else was painted inside it, so the outline is the paint's
  // own and the white shell around it is never touched.
  // only the helmet's own texels can be glass: the neck's front lies inside the visor's sphere too, and the shadow the
  // retexture painted under the chin would otherwise join the mask, pull the measured outline down at the lower corners
  // and stay black, in view whenever the head tilts
  const helmetAt = (k) => TY[k] > COLLAR_Y || (Math.hypot(TX[k], TZ[k]) < CHIN_R && TY[k] > cy - 0.35);
  const dark = new Uint8Array(Wt * Ht);
  for (let k = 0; k < Wt * Ht; k++) { if (!front[k] || !helmetAt(k)) continue; const r = data[k * ch], bl = data[k * ch + 2]; if (lumAt(k) < 90 || (bl - r > 40 && bl > 120)) dark[k] = 1; }
  const mask = morph(morph(dark, 20, true), 20, false);
  let glass = 0; const blackened = new Uint8Array(Wt * Ht); // every texel this block paints black: the gloss mask for the web export
  for (let k = 0; k < Wt * Ht; k++) { if (!mask[k] && !dark[k]) continue; glass++; blackened[k] = 1; data[k * ch] = 10; data[k * ch + 1] = 10; data[k * ch + 2] = 12; }
  // The visor's rim: the silver ring around the glass, one even tone. The paint had it as a wash of near-whites
  // and greys. Its footprint comes from the glass in 3D: the glass texels' positions seen from the front, grown
  // by 1.5 cm; helmet-front texels inside that grown footprint, off the glass and not recessed, are the rim.
  // The visor's rim. In polar coordinates about the helmet's centre (azimuth around the visor's axis, +z, and the
  // arc from that axis) the glass outline is, per degree of azimuth, the 98th percentile of the arc of the glass
  // texels the viewer sees (two depth tests below), then a median over 9° and a mean over 5° (spikes go, corners
  // stay). The bezel is built as geometry along that curve (below); the texture only carries black up to the middle
  // of the bezel's footprint and white from there to whiteRing further out, the transition hidden under the ribbon:
  // the retexture's bezel was a broad ragged wash, up to 5 cm wide, which the flatten pass must leave alone. The
  // collar, below collarY and outside the chin lip (chinR from the neck axis), is not the helmet's and is left out.
  let inside = 0, ring = 0, shell = 0, suitN = 0, neckN = 0, neckB = 0, bezelNote = '', bezelPatch = null, bezelUV = null, starvedNote = '';
  { const NB = 360, W = RIM_W / maxD, RING = RING_W / maxD;
    const arcOf = (k) => Math.acos(Math.max(-1, Math.min(1, (TZ[k] - cz) / (TD[k] || 1e-9))));
    const aziOf = (k) => (Math.atan2(TY[k] - cy, TX[k] - cx) + Math.PI) / (2 * Math.PI); // 0..1 around the axis
    const binOf = (k) => Math.min(NB - 1, Math.max(0, Math.floor(aziOf(k) * NB)));
    const helmet = (k) => TY[k] > COLLAR_Y || (Math.hypot(TX[k], TZ[k]) < CHIN_R && TY[k] > cy - 0.35);
    // Two depth tests for the outline. Radial: the outermost surface per half-degree cell of (azimuth, arc) is
    // what the viewer sees, so the glass down the recess wall and under the chin lip is left out. Front: along the
    // bottom edge, where the glass curls under the lip, a coarse depth test in the front projection (5 mm cells).
    const GA = 720, GP = 180, farR = new Float32Array(GA * GP);
    const rcell = (k) => { const i = Math.min(GA - 1, Math.floor(aziOf(k) * GA)), j = Math.min(GP - 1, Math.floor((arcOf(k) / (Math.PI / 2)) * GP)); return j * GA + i; };
    for (let k = 0; k < Wt * Ht; k++) if (front[k] && owned[k]) { const c = rcell(k); if (TD[k] > farR[c]) farR[c] = TD[k]; }
    const seen = (k) => TD[k] >= farR[rcell(k)] - 0.006;
    const CELL = 0.005, GX = Math.ceil(1.0 / CELL), GY = Math.ceil(0.9 / CELL), farZ = new Float32Array(GX * GY).fill(-Infinity);
    const fcell = (k) => { const i = Math.floor((TX[k] + 0.5) / CELL), j = Math.floor((TY[k] - 0.8) / CELL); return i < 0 || j < 0 || i >= GX || j >= GY ? -1 : j * GX + i; };
    for (let k = 0; k < Wt * Ht; k++) if (front[k] && owned[k] && helmet(k)) { const c = fcell(k); if (c >= 0 && TZ[k] > farZ[c]) farZ[c] = TZ[k]; } // the collar in front of the visor's foot is no occluder
    const curled = (k) => TY[k] < cy - 0.24 && TZ[k] < farZ[fcell(k)] - 0.015;
    const bins = Array.from({ length: NB }, () => []);
    for (let k = 0; k < Wt * Ht; k++) if (mask[k] && front[k] && owned[k] && seen(k) && !curled(k)) bins[binOf(k)].push(arcOf(k));
    let edge = bins.map((v) => { if (v.length < 5) return NaN; v.sort((p, q) => p - q); return v[Math.floor(v.length * 0.98)]; });
    for (let i = 0; i < NB; i++) if (Number.isNaN(edge[i])) { for (let d = 1; d < NB; d++) { const p = edge[(i + d) % NB], q = edge[(i - d + NB) % NB]; if (!Number.isNaN(p)) { edge[i] = p; break; } if (!Number.isNaN(q)) { edge[i] = q; break; } } }
    const filt = (fn, r) => edge.map((_, i) => { const w = []; for (let d = -r; d <= r; d++) w.push(edge[(i + d + NB) % NB]); return fn(w); });
    edge = filt((w) => w.sort((p, q) => p - q)[4], 4);
    edge = filt((w) => w.reduce((sum, v) => sum + v, 0) / w.length, 2);
    // Under the ribbon, black paint is glass where the surface sits at the glass's radius rather than the rim's (per
    // degree: the median radius of the rim just outside the outline against the glass just inside it; a third of
    // the way up the recess wall). The smoothed outline runs a few millimetres inside the true glass edge in places.
    const rimR = Array.from({ length: NB }, () => []), glassR = Array.from({ length: NB }, () => []);
    for (let k = 0; k < Wt * Ht; k++) { if (!front[k] || !owned[k] || !helmet(k)) continue; const d = arcOf(k) - edge[binOf(k)]; if (!mask[k] && d > 0.003 / maxD && d <= W) rimR[binOf(k)].push(TD[k]); else if (mask[k] && d < -0.003 / maxD && d >= -W && !curled(k)) glassR[binOf(k)].push(TD[k]); }
    const median = (v) => { v.sort((p, q) => p - q); return v[v.length >> 1]; };
    let split = rimR.map((v, i) => v.length >= 5 && glassR[i].length >= 5 ? median(glassR[i]) + 0.35 * (median(v) - median(glassR[i])) : NaN);
    for (let i = 0; i < NB; i++) if (Number.isNaN(split[i])) { for (let d = 1; d < NB; d++) { const p = split[(i + d) % NB], q = split[(i - d + NB) % NB]; if (!Number.isNaN(p)) { split[i] = p; break; } if (!Number.isNaN(q)) { split[i] = q; break; } } }
    split = split.map((_, i) => { const w = []; for (let d = -2; d <= 2; d++) w.push(split[(i + d + NB) % NB]); return median(w); });
    const cat = process.env.RIM_DEBUG ? new Uint8Array(Wt * Ht) : null; // 1 glass (black), 4 white ring, 5 other helmet front
    for (let k = 0; k < Wt * Ht; k++) {
      if (!front[k] || !owned[k]) continue;
      if (!helmet(k)) { if (cat) cat[k] = mask[k] ? 1 : 5; continue; }
      const d = arcOf(k) - edge[binOf(k)];
      if (d < 0.004 / maxD || (mask[k] && curled(k))) { if (cat) cat[k] = 1; if (!mask[k]) { data[k * ch] = 10; data[k * ch + 1] = 10; data[k * ch + 2] = 12; inside++; } blackened[k] = 1; continue; } // the glass, the recess wall and the first 4 mm of the bezel's footprint: black (the ribbon hides the transition; what parallax shows beside it is white)
      if (d <= W && mask[k] && TD[k] < split[binOf(k)]) { if (cat) cat[k] = 1; continue; } // black paint under the ribbon at the glass's radius: glass
      if (d <= W + RING) { if (cat) cat[k] = 4; data[k * ch] = 250; data[k * ch + 1] = 250; data[k * ch + 2] = 250; ring++; continue; } // the rest of the footprint and the shell beyond: white
      if (cat) cat[k] = 5;
    }
    if (cat) {
      const c = Buffer.from(data), col = [null, [0, 0, 0], [40, 80, 255], [255, 40, 40], [40, 200, 40], [255, 220, 0]]; for (let k = 0; k < Wt * Ht; k++) if (cat[k]) { c[k * ch] = col[cat[k]][0]; c[k * ch + 1] = col[cat[k]][1]; c[k * ch + 2] = col[cat[k]][2]; } await sharp(c, { raw: { width: Wt, height: Ht, channels: ch } }).png().toFile(process.env.RIM_DEBUG); }
    // The rest of the helmet shell, front and back, becomes plain white: with the creases smoothed out of the
    // geometry (--denoise), the faint streaks the retexture painted along them are what remains, and the shell has
    // no painted feature of its own (its seams are grooves in the mesh, painted white). Off the shell: the glass
    // and the bezel's reach (above), the ear pods (out past |x| = radius − 5 cm) and the collar.
    shell = 0;
    for (let k = 0; k < Wt * Ht; k++) {
      if (!helm[k] || !owned[k] || mask[k] || TD[k] > maxD + 0.07 || Math.abs(TX[k] - cx) > maxD - 0.05 || !helmet(k)) continue;
      if (front[k] && arcOf(k) - edge[binOf(k)] <= W + RING) continue;
      const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2]; if (Math.max(r, g, bl) - Math.min(r, g, bl) > 40 || 0.299 * r + 0.587 * g + 0.114 * bl < 150) continue;
      data[k * ch] = 250; data[k * ch + 1] = 250; data[k * ch + 2] = 250; shell++;
    }
    // --whiten-suit L: on the body's white parts, every unsaturated texel at luminance L or more becomes pure
    // white. The retexture left brush streaks, and soft halos beside every trim, at 200–240; the flatten pass
    // (a high-pass) cannot lift a halo whose neighbourhood is the trim itself, nor a streak that stands off its
    // surroundings. Off limits: the helmet (handled above), the collar ring, the ear pods, the backpack (its
    // silver frame is paint), anything within 1.5 cm of an accent (the silver rings around the blue), the
    // bezel's patch, and the trims themselves, which sit below L.
    const SUIT = flag('--whiten-suit', null);
    if (SUIT) {
      const LMIN = Number(SUIT), acc = new Uint8Array(Wt * Ht);
      for (let k = 0; k < Wt * Ht; k++) { const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2]; if (Math.max(r, g, bl) - Math.min(r, g, bl) > 60 && 0.299 * r + 0.587 * g + 0.114 * bl > 50) acc[k] = 1; }
      const nearAccent = morph(acc, 12, true);
      for (let k = 0; k < Wt * Ht; k++) {
        if (!owned[k] || helm[k] || nearAccent[k] || blackened[k] || (keepTex && keepTex[k])) continue;
        const x = TX[k], y = TY[k], z = TZ[k];
        if (y > 0.9 && y < 1.06 && Math.hypot(x, z) > 0.18) continue; // the collar ring
        if (Math.abs(x) > maxD - 0.05 && y > 1.1) continue; // the ear pods
        if (z < -0.12 && y > 0.5 && y < 1.0 && Math.abs(x) < 0.3) continue; // the backpack
        const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2]; if (Math.max(r, g, bl) - Math.min(r, g, bl) > 40 || 0.299 * r + 0.587 * g + 0.114 * bl < LMIN) continue;
        data[k * ch] = 253; data[k * ch + 1] = 253; data[k * ch + 2] = 253; suitN++;
      }
    }
    // The neck and the inner collar ring, one near white (a shade under the suit, so the collar still reads as a part). The retexture painted the neck cylinder under the helmet black
    // (the references' shadow), so every tilt or turn of the head showed a black bib with a ragged white edge. By
    // position: the neck core (within chinR + 1.5 cm of the neck axis) from 14 cm below the collar's top to just
    // above it, the collar's top ring out to 33 cm from the axis above its middle, and the ring's outer wall at the
    // back and sides; the visor's black stays, the straps (in front) and the shoulder pads (at the sides) lie outside. Protected from the later passes.
    keepTex ??= new Uint8Array(Wt * Ht);
    const NECK_TONE = 242;
    for (let k = 0; k < Wt * Ht; k++) {
      if (!owned[k]) continue;
      const y = TY[k], r = Math.hypot(TX[k], TZ[k]);
      if (blackened[k] && front[k] && !curled(k) && r > CHIN_R && arcOf(k) - edge[binOf(k)] < 0) continue; // only the glass in view from the front keeps its black; the neck core sits at the visor's angles and depth but within chinR of the axis, and can never be glass
      if (y < COLLAR_Y - 0.14 || y > COLLAR_Y + 0.035) continue;
      const x = TX[k], z = TZ[k];
      if (!(r <= CHIN_R + 0.015 || (r <= 0.33 && y >= COLLAR_Y - 0.075) || (r <= 0.33 && Math.abs(x) < 0.24 && z < 0.12))) continue; // the neck core; the collar's top ring; the ring's outer wall at the back and sides (the shoulder pads sit at the sides beyond |x| 0.24, the straps in front)
      const cr = data[k * ch], cg = data[k * ch + 1], cb = data[k * ch + 2]; if (Math.max(cr, cg, cb) - Math.min(cr, cg, cb) > 60) continue; // an accent
      data[k * ch] = NECK_TONE; data[k * ch + 1] = NECK_TONE; data[k * ch + 2] = NECK_TONE; keepTex[k] = 1; neckN++; if (blackened[k]) { blackened[k] = 0; neckB++; }
    }
    if (process.env.NECK_DEBUG) { // the texels still protected as visible glass below y 1.0, and the black ones left in the neck zone
      const q = (arr, p) => { const a = Float64Array.from(arr).sort(); return a.length ? a[Math.floor((a.length - 1) * p)] : NaN; };
      const prot = { y: [], r: [], z: [], td: [], n: 0, curled: 0 }, left = { y: [], r: [], z: [], n: 0, front: 0, blackened: 0, helm: 0 };
      for (let k = 0; k < Wt * Ht; k++) {
        if (!owned[k]) continue; const y = TY[k], r = Math.hypot(TX[k], TZ[k]);
        if (blackened[k] && front[k] && y < 1.0 && arcOf(k) - edge[binOf(k)] < 0) { prot.n++; if (curled(k)) prot.curled++; prot.y.push(y); prot.r.push(r); prot.z.push(TZ[k]); prot.td.push(TD[k]); }
        const lum = 0.299 * data[k * ch] + 0.587 * data[k * ch + 1] + 0.114 * data[k * ch + 2];
        if (lum < 40 && y > 0.86 && y < 1.06 && r < 0.33 && TZ[k] > 0) { left.n++; if (front[k]) left.front++; if (blackened[k]) left.blackened++; if (helm[k]) left.helm++; left.y.push(y); left.r.push(r); left.z.push(TZ[k]); }
      }
      const show = (o) => Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} p10 ${q(v, 0.1).toFixed(3)} median ${q(v, 0.5).toFixed(3)} p90 ${q(v, 0.9).toFixed(3)}`).join(' | ');
      console.log(`protected as visible glass below y 1.0: ${prot.n} texels (${prot.curled} curled) · ${show(prot)}`);
      console.log(`black texels left in the neck zone (front half): ${left.n} (front ${left.front}, blackened ${left.blackened}, helm ${left.helm}) · ${show(left)}`);
      // every texel by the category the rules above gave it, for a look in the viewer
      const c = Buffer.from(data);
      for (let k = 0; k < Wt * Ht; k++) {
        let col;
        if (!owned[k]) col = [255, 0, 255];
        else { const y = TY[k], r = Math.hypot(TX[k], TZ[k]), x = TX[k], z = TZ[k]; const inZone = y >= COLLAR_Y - 0.14 && y <= COLLAR_Y + 0.035 && (r <= CHIN_R + 0.015 || (r <= 0.33 && y >= COLLAR_Y - 0.075) || (r <= 0.33 && Math.abs(x) < 0.24 && z < 0.12));
          if (blackened[k] && front[k] && arcOf(k) - edge[binOf(k)] < 0) col = [255, 40, 40]; else if (inZone) col = [40, 200, 40]; else if (blackened[k]) col = [255, 160, 0]; else if (helm[k]) col = [60, 100, 255]; else col = [160, 160, 160]; }
        c[k * ch] = col[0]; c[k * ch + 1] = col[1]; c[k * ch + 2] = col[2];
      }
      await sharp(c, { raw: { width: Wt, height: Ht, channels: ch } }).png().toFile(process.env.NECK_DEBUG);
    }
    { // the paint above changed islands' colours; extend each island 12 texels into the gaps around it again, so the filtering at its edge, down the mip chain too, sees its own colour
      let filled = Uint8Array.from(owned);
      for (let pass = 0; pass < 12; pass++) {
        const next = Uint8Array.from(filled), src = Buffer.from(data);
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) {
          const k = y * Wt + x; if (filled[k]) continue;
          let r = 0, g = 0, bl = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= Wt || yy >= Ht) continue; const j = yy * Wt + xx; if (!filled[j]) continue; r += src[j * ch]; g += src[j * ch + 1]; bl += src[j * ch + 2]; n++; }
          if (!n) continue; data[k * ch] = Math.round(r / n); data[k * ch + 1] = Math.round(g / n); data[k * ch + 2] = Math.round(bl / n); next[k] = 1;
        }
        filled = next;
      }
    }
    { // The bezel itself is geometry: a ribbon of triangles along the outline, from the glass edge to rimWidth beyond it, 1.5 mm
      // proud of the surface (the outermost surface of each half-degree cell, smoothed around the ring), its UVs on
      // one solid silver patch in the atlas padding. Painted in the texture, the band fell apart on the visor's
      // confetti of tiny UV charts, a few texels wide and packed edge to edge, each showing its neighbours' colour
      // along its rim under filtering; the same lesson as the LED.
      const prim = prims[0], pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ua = prim.getAttribute('TEXCOORD_0'), ia = prim.getIndices();
      const P = pa.getArray(), Nn = na.getArray(), U = ua.getArray(), I = ia.getArray(), N0 = P.length / 3;
      const S = new Uint32Array((Wt + 1) * (Ht + 1));
      for (let y = 1; y <= Ht; y++) for (let x = 1; x <= Wt; x++) S[y * (Wt + 1) + x] = covered[(y - 1) * Wt + x - 1] + S[(y - 1) * (Wt + 1) + x] + S[y * (Wt + 1) + x - 1] - S[(y - 1) * (Wt + 1) + x - 1];
      const sum = (x, y, w, h) => S[(y + h) * (Wt + 1) + x + w] - S[y * (Wt + 1) + x + w] - S[(y + h) * (Wt + 1) + x] + S[y * (Wt + 1) + x];
      let size = 32, pb = null;
      while (size >= 8 && !pb) { outer: for (let y = 0; y + size <= Ht; y += 2) for (let x = 0; x + size <= Wt; x += 2) if (sum(x, y, size, size) === 0) { pb = [x, y]; break outer; } if (!pb) size -= 2; }
      if (!pb) throw new Error('no empty patch in the atlas for the bezel');
      keepTex ??= new Uint8Array(Wt * Ht);
      for (let y = pb[1]; y < pb[1] + size; y++) for (let x = pb[0]; x < pb[0] + size; x++) { const k = y * Wt + x; data[k * ch] = 205; data[k * ch + 1] = 205; data[k * ch + 2] = 205; keepTex[k] = 1; covered[k] = 1; }
      bezelPatch = [pb[0], pb[1], size];
      const LIFT = 0.0015, MID = 0.005 / maxD;
      const rAt = (i, phi) => { // the surface's radius at bin i's azimuth and the arc phi: the outermost surface of that cell, else of the nearest cells that have one
        const ai = Math.min(GA - 1, Math.floor(((i + 0.5) / NB) * GA)), pj = Math.min(GP - 1, Math.max(0, Math.floor((phi / (Math.PI / 2)) * GP)));
        for (let r = 0; r < 24; r++) { let best = 0; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const jj = pj + dj; if (jj < 0 || jj >= GP) continue; const v = farR[jj * GA + (ai + di + GA) % GA]; if (v > best) best = v; } if (best > 0) return best; }
        return maxD;
      };
      const smoothRing = (arr) => { const med = arr.map((_, i) => { const w = []; for (let d = -2; d <= 2; d++) w.push(arr[(i + d + NB) % NB]); return w.sort((p, q) => p - q)[2]; }); return med.map((_, i) => (med[(i - 1 + NB) % NB] + med[i] + med[(i + 1) % NB]) / 3); };
      // the glass edge's own radius per degree (the median over the texels within 2 mm of the outline): the inner row
      // sits on it, so nothing shows between the ribbon and the glass from any angle; the rows beyond sit on the
      // outermost surface, the rim top
      const edgeR = Array.from({ length: NB }, () => []);
      for (let k = 0; k < Wt * Ht; k++) { if (!front[k] || !owned[k] || !helmet(k) || curled(k)) continue; const d = arcOf(k) - edge[binOf(k)]; if (Math.abs(d) <= 0.002 / maxD) edgeR[binOf(k)].push(TD[k]); }
      let rEdge = edgeR.map((v) => (v.length >= 3 ? median(v) : NaN));
      for (let i = 0; i < NB; i++) if (Number.isNaN(rEdge[i])) { for (let d = 1; d < NB; d++) { const p = rEdge[(i + d) % NB], q = rEdge[(i - d + NB) % NB]; if (!Number.isNaN(p)) { rEdge[i] = p; break; } if (!Number.isNaN(q)) { rEdge[i] = q; break; } } }
      const rIn = smoothRing(rEdge), rMid = smoothRing(edge.map((e, i) => rAt(i, e + MID))), rOut = smoothRing(edge.map((e, i) => rAt(i, e + W)));
      const newP = [], newN = [], newU = [], newI = [], uvB = [(pb[0] + size / 2) / Wt, (pb[1] + size / 2) / Ht]; bezelUV = uvB;
      const vert = (i, phi, r) => { const A = ((i + 0.5) / NB) * 2 * Math.PI - Math.PI, sn = Math.sin(phi), dir = [sn * Math.cos(A), sn * Math.sin(A), Math.cos(phi)]; newP.push(cx + dir[0] * (r + LIFT), cy + dir[1] * (r + LIFT), cz + dir[2] * (r + LIFT)); newN.push(...dir); newU.push(...uvB); return N0 + newP.length / 3 - 1; };
      const at = (i) => [newP[(i - N0) * 3], newP[(i - N0) * 3 + 1], newP[(i - N0) * 3 + 2]];
      const tri = (p, q, r, n) => { const A = at(p), B = at(q), C = at(r), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], fn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] < 0) newI.push(p, r, q); else newI.push(p, q, r); };
      const ringV = []; for (let i = 0; i < NB; i++) ringV.push([vert(i, edge[i], rIn[i]), vert(i, edge[i] + MID, rMid[i]), vert(i, edge[i] + W, rOut[i])]);
      for (let i = 0; i < NB; i++) { const j = (i + 1) % NB, a = ringV[i], b = ringV[j], n = [newN[(a[1] - N0) * 3], newN[(a[1] - N0) * 3 + 1], newN[(a[1] - N0) * 3 + 2]]; for (let r = 0; r < 2; r++) { tri(a[r], b[r], a[r + 1], n); tri(b[r], b[r + 1], a[r + 1], n); } }
      const concat = (arr, extra, Ctor) => { const out = new Ctor(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
      pa.setArray(concat(P, newP, Float32Array)); na.setArray(concat(Nn, newN, Float32Array)); ua.setArray(concat(U, newU, Float32Array));
      ia.setArray(concat(I, newI, I.constructor === Uint16Array && N0 + newP.length / 3 > 65535 ? Uint32Array : I.constructor));
      bezelNote = `bezel as geometry: ${newI.length / 3} triangles on ${newP.length / 3} vertices, patch ${size}px at (${pb})`;
    }
    { // Texel-starved triangles: a triangle whose three UVs cover less than a texel and a half samples whatever lies
      // in the padding around it, under the chin the black of the visor. Each gets vertices of its own pointing at a
      // solid patch: the bezel's silver in the neck zone, a white patch elsewhere. Their neighbours keep their UVs.
      const prim = prims[0], pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ua = prim.getAttribute('TEXCOORD_0'), ia = prim.getIndices();
      const P = pa.getArray(), Nn = na.getArray(), U = ua.getArray(), I = ia.getArray(), N0 = P.length / 3;
      const S = new Uint32Array((Wt + 1) * (Ht + 1));
      for (let y = 1; y <= Ht; y++) for (let x = 1; x <= Wt; x++) S[y * (Wt + 1) + x] = covered[(y - 1) * Wt + x - 1] + S[(y - 1) * (Wt + 1) + x] + S[y * (Wt + 1) + x - 1] - S[(y - 1) * (Wt + 1) + x - 1];
      const sum = (x, y, w, h) => S[(y + h) * (Wt + 1) + x + w] - S[y * (Wt + 1) + x + w] - S[(y + h) * (Wt + 1) + x] + S[y * (Wt + 1) + x];
      let size = 32, pw = null;
      while (size >= 8 && !pw) { outer: for (let y = 0; y + size <= Ht; y += 2) for (let x = 0; x + size <= Wt; x += 2) if (sum(x, y, size, size) === 0) { pw = [x, y]; break outer; } if (!pw) size -= 2; }
      if (!pw) throw new Error('no empty patch in the atlas for the white patch');
      for (let y = pw[1]; y < pw[1] + size; y++) for (let x = pw[0]; x < pw[0] + size; x++) { const k = y * Wt + x; data[k * ch] = 253; data[k * ch + 1] = 253; data[k * ch + 2] = 253; keepTex[k] = 1; covered[k] = 1; }
      const uvW = [(pw[0] + size / 2) / Wt, (pw[1] + size / 2) / Ht];
      let pn = null, sizeN = 32;
      while (sizeN >= 8 && !pn) { outer2: for (let y = 0; y + sizeN <= Ht; y += 2) for (let x = 0; x + sizeN <= Wt; x += 2) if (sum(x, y, sizeN, sizeN) === 0) { pn = [x, y]; break outer2; } if (!pn) sizeN -= 2; }
      if (!pn) throw new Error('no empty patch in the atlas for the neck patch');
      for (let y = pn[1]; y < pn[1] + sizeN; y++) for (let x = pn[0]; x < pn[0] + sizeN; x++) { const k = y * Wt + x; data[k * ch] = NECK_TONE; data[k * ch + 1] = NECK_TONE; data[k * ch + 2] = NECK_TONE; keepTex[k] = 1; covered[k] = 1; }
      const uvN = [(pn[0] + sizeN / 2) / Wt, (pn[1] + sizeN / 2) / Ht];
      const newP = [], newN = [], newU = []; const I2 = Array.from(I); let starved = 0, silverN = 0;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const px = [U[a * 2] * Wt, U[b * 2] * Wt, U[c * 2] * Wt], py = [U[a * 2 + 1] * Ht, U[b * 2 + 1] * Ht, U[c * 2 + 1] * Ht];
        const auv = Math.abs((px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])) / 2;
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        const a3 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        if (auv >= 1.5 || a3 < 5e-6) continue; // fine, or too small to matter (5 mm²)
        const cy0 = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, cr = Math.hypot((P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3);
        const neck = cy0 >= COLLAR_Y - 0.14 && cy0 <= COLLAR_Y + 0.035 && cr <= 0.33, uv = neck ? uvN : uvW;
        for (const [j, v] of [[0, a], [1, b], [2, c]]) { const nv = N0 + newP.length / 3; newP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); newN.push(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]); newU.push(uv[0], uv[1]); I2[t + j] = nv; }
        starved++; if (neck) silverN++;
      }
      const concat = (arr, extra, Ctor) => { const out = new Ctor(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
      pa.setArray(concat(P, newP, Float32Array)); na.setArray(concat(Nn, newN, Float32Array)); ua.setArray(concat(U, newU, Float32Array));
      ia.setArray((I.constructor === Uint16Array && N0 + newP.length / 3 > 65535 ? Uint32Array : I.constructor).from(I2));
      starvedNote = `${starved} texel-starved triangles given a patch (${silverN} in the neck's tone, the rest white ${size}px at (${pw}))`;
    }
    const deg = (i) => (edge[i] * 180 / Math.PI).toFixed(0);
    console.log(`visor edge (arc from the axis, degrees) at the right, top, left and bottom: ${deg(180)}, ${deg(270)}, ${deg(0)}, ${deg(90)}`);
  }
  const em = Buffer.alloc(Wt * Ht * 3);
  let ribbonNote = 'no LED';
  if (LED) {
    // --led halfWidth,y0,curve,core,glow (metres): the LED strip as geometry, two ribbons of triangles along the
    // smile y = y0 + curve·x² for |x| ≤ halfWidth on the visor surface (found from the nearest front vertex), a
    // bright core `core` wide over a dim glow `glow` wide, both a few millimetres proud of the glass. Each ribbon's
    // UVs sit on one solid patch in the atlas padding, so there is no seam and no filtering to comb it. A line
    // drawn in the texture instead fell apart on the visor's many small UV islands.
    const [lx, ly, lk, lcore, lglow] = LED.split(',').map(Number);
    const prim = prims[0], pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ua = prim.getAttribute('TEXCOORD_0'), ia = prim.getIndices();
    const P = pa.getArray(), Nn = na.getArray(), U = ua.getArray(), I = ia.getArray(), N0 = P.length / 3;
    const cand = []; for (let i = 0; i < N0; i++) if (P[i * 3 + 2] > minZ + 0.05 && Math.hypot(P[i * 3] - cx, P[i * 3 + 1] - cy, P[i * 3 + 2] - cz) < maxD + 0.03 && Nn[i * 3 + 2] > 0.3) cand.push(i);
    // the surface under a point of the curve: the eight nearest front vertices, averaged
    const surface = (x, y) => {
      const near = cand.map((i) => [Math.hypot(P[i * 3] - x, P[i * 3 + 1] - y), i]).sort((p, q) => p[0] - q[0]).slice(0, 8);
      let z = 0; const n = [0, 0, 0];
      for (const [, i] of near) { z += P[i * 3 + 2]; n[0] += Nn[i * 3]; n[1] += Nn[i * 3 + 1]; n[2] += Nn[i * 3 + 2]; }
      const l = Math.hypot(...n) || 1; return { z: z / near.length, n: n.map((c) => c / l) };
    };
    // two patches in the atlas padding: the largest empty blocks it has, found with an integral image. The core's
    // is one solid colour; the glow's is a gradient across it, black at the sides, so the glow ribbon fades out.
    const S = new Uint32Array((Wt + 1) * (Ht + 1));
    for (let y = 1; y <= Ht; y++) for (let x = 1; x <= Wt; x++) S[y * (Wt + 1) + x] = covered[(y - 1) * Wt + x - 1] + S[(y - 1) * (Wt + 1) + x] + S[y * (Wt + 1) + x - 1] - S[(y - 1) * (Wt + 1) + x - 1];
    const sum = (x, y, w, h) => S[(y + h) * (Wt + 1) + x + w] - S[y * (Wt + 1) + x + w] - S[(y + h) * (Wt + 1) + x] + S[y * (Wt + 1) + x];
    const findBlock = (size, avoid) => { for (let y = 0; y + size <= Ht; y += 2) for (let x = 0; x + size <= Wt; x += 2) { if (sum(x, y, size, size) !== 0) continue; if (avoid && Math.abs(avoid[0] - x) < size && Math.abs(avoid[1] - y) < size) continue; return [x, y]; } return null; };
    let size = 32, pc = null, pg = null;
    for (; size >= 8; size -= 2) { pc = findBlock(size, null); pg = pc && findBlock(size, pc); if (pc && pg) break; }
    if (!pc || !pg) throw new Error('no empty patch in the atlas for the LED');
    const [ar, ag, ab] = ACCENT ? [0, 2, 4].map((i) => parseInt(ACCENT.slice(i, i + 2), 16)) : [0, 229, 255];
    const coreRGB = [Math.round(ar * 0.35 + 255 * 0.65), Math.round(ag * 0.35 + 255 * 0.65), Math.round(ab * 0.35 + 255 * 0.65)], glowRGB = [Math.round(ar * 0.55), Math.round(ag * 0.55), Math.round(ab * 0.55)];
    for (let y = pc[1]; y < pc[1] + size; y++) for (let x = pc[0]; x < pc[0] + size; x++) { const k = y * Wt + x; data[k * ch] = 10; data[k * ch + 1] = 10; data[k * ch + 2] = 12; em[k * 3] = coreRGB[0]; em[k * 3 + 1] = coreRGB[1]; em[k * 3 + 2] = coreRGB[2]; }
    for (let y = pg[1]; y < pg[1] + size; y++) for (let x = pg[0]; x < pg[0] + size; x++) { const k = y * Wt + x, u = (x - pg[0] + 0.5) / size, w = Math.max(0, 1 - Math.abs(u - 0.5) / 0.42); const ww = w * w; data[k * ch] = 10; data[k * ch + 1] = 10; data[k * ch + 2] = 12; em[k * 3] = Math.round(glowRGB[0] * ww); em[k * 3 + 1] = Math.round(glowRGB[1] * ww); em[k * 3 + 2] = Math.round(glowRGB[2] * ww); }
    const uvCore = [(pc[0] + size / 2) / Wt, (pc[1] + size / 2) / Ht], vGlow = (pg[1] + size / 2) / Ht, uGlow = (t) => (pg[0] + 1 + (size - 2) * t) / Wt; // t across the glow: 0 side, 0.5 centre, 1 side
    // the curve on the surface, smoothed along its length
    const SEG = 64, raw = [];
    for (let i = 0; i <= SEG; i++) { const x = -lx + (2 * lx * i) / SEG, y = ly + lk * x * x, sf = surface(x, y); raw.push({ x, y, z: sf.z, n: sf.n }); }
    const pts = raw.map((_, i) => { let z = 0; const n = [0, 0, 0]; let c = 0; for (let j = i - 3; j <= i + 3; j++) { const q = raw[Math.max(0, Math.min(SEG, j))]; z += q.z; n[0] += q.n[0]; n[1] += q.n[1]; n[2] += q.n[2]; c++; } const l = Math.hypot(...n) || 1; return { p: [raw[i].x, raw[i].y, z / c], n: n.map((v) => v / l) }; });
    const newP = [], newN = [], newU = [], newI = [];
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
    const push = (p, n, uv) => { newP.push(p[0], p[1], p[2]); newN.push(n[0], n[1], n[2]); newU.push(uv[0], uv[1]); return N0 + newP.length / 3 - 1; };
    const quad = (a0, b0, a1, b1, n) => { // two triangles, wound to face along n
      const at = (i) => [newP[(i - N0) * 3], newP[(i - N0) * 3 + 1], newP[(i - N0) * 3 + 2]];
      const pA = at(a0), pB = at(b0), pA1 = at(a1), fn = cross([pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]], [pA1[0] - pA[0], pA1[1] - pA[1], pA1[2] - pA[2]]);
      if (fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] < 0) newI.push(a0, a1, b0, b0, a1, b1); else newI.push(a0, b0, a1, b0, b1, a1);
    };
    const frame = (i) => { const q = pts[Math.max(0, i - 1)], r = pts[Math.min(SEG, i + 1)], t = norm([r.p[0] - q.p[0], r.p[1] - q.p[1], r.p[2] - q.p[2]]), n = pts[i].n; return { n, w: norm(cross(n, t)) }; };
    { // the glow: three rows (side, centre, side) on the gradient patch
      const rows = [];
      for (let i = 0; i <= SEG; i++) { const { n, w } = frame(i), c = pts[i].p.map((v, j) => v + n[j] * 0.0025); rows.push([1, 0, -1].map((sgn) => push(c.map((v, j) => v + w[j] * lglow * sgn), n, [uGlow(0.5 + 0.5 * sgn), vGlow]))); }
      for (let i = 0; i < SEG; i++) { const n = pts[i].n; quad(rows[i][0], rows[i][1], rows[i + 1][0], rows[i + 1][1], n); quad(rows[i][1], rows[i][2], rows[i + 1][1], rows[i + 1][2], n); }
    }
    { // the core: two rows on the solid patch, a little further out
      const rows = [];
      for (let i = 0; i <= SEG; i++) { const { n, w } = frame(i), c = pts[i].p.map((v, j) => v + n[j] * 0.004); rows.push([1, -1].map((sgn) => push(c.map((v, j) => v + w[j] * lcore * sgn), n, uvCore))); }
      for (let i = 0; i < SEG; i++) quad(rows[i][0], rows[i][1], rows[i + 1][0], rows[i + 1][1], pts[i].n);
    }
    const concat = (arr, extra, Ctor) => { const out = new Ctor(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
    pa.setArray(concat(P, newP, Float32Array)); na.setArray(concat(Nn, newN, Float32Array)); ua.setArray(concat(U, newU, Float32Array));
    ia.setArray(concat(I, newI, I.constructor === Uint16Array && N0 + newP.length / 3 > 65535 ? Uint32Array : I.constructor));
    ribbonNote = `LED as geometry: ${newI.length / 3} triangles on ${newP.length / 3} vertices, patches ${size}px at (${pc}) and (${pg})`;
  }
  let img = sharp(data, { raw: { width: Wt, height: Ht, channels: ch } });
  img = tex.getMimeType() === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  tex.setImage(new Uint8Array(await img.toBuffer()));
  mat.setEmissiveTexture(doc.createTexture('led').setImage(new Uint8Array(await sharp(em, { raw: { width: Wt, height: Ht, channels: 3 } }).png().toBuffer())).setMimeType('image/png')).setEmissiveFactor([1, 1, 1]);
  // the glass mask (every texel painted black above) rides in the R channel of the metal-rough map (glTF leaves it
  // unused): the web export gives the whole glass one gloss
  const mr = mat.getMetallicRoughnessTexture();
  if (mr) {
    const o = await sharp(Buffer.from(mr.getImage())).raw().toBuffer({ resolveWithObject: true }), ow = o.info.width, oh = o.info.height, oc = o.info.channels;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) o.data[(y * ow + x) * oc] = blackened[Math.floor((y * Ht) / oh) * Wt + Math.floor((x * Wt) / ow)] ? 255 : 0; // the whole painted glass, not only the paint's own dark region: a black texel left matte reads as a grey smear under the sun
    if (bezelPatch) { const [bx, by, bs] = bezelPatch; for (let y = Math.floor((by * oh) / Ht); y < Math.ceil(((by + bs) * oh) / Ht); y++) for (let x = Math.floor((bx * ow) / Wt); x < Math.ceil(((bx + bs) * ow) / Wt); x++) o.data[(y * ow + x) * oc] = 128; } // the bezel's patch: 128, a middling gloss in the web export
    mr.setImage(new Uint8Array(await sharp(o.data, { raw: { width: ow, height: oh, channels: oc } }).png().toBuffer())).setMimeType('image/png');
  }
  console.log(`visor: ${glass} glass texels black, ${inside} more under the bezel black, ${ring} shell texels beyond it white, ${shell} more over the rest of the helmet, ${suitN} on the suit, ${neckN} of the neck and inner collar near white (${neckB} of them over black), ${starvedNote} · ${bezelNote} · ${ribbonNote}`);
}

/* ---------------- smooth the greys ---------------- */
// --smooth-greys r: the trims, slots and panels are painted in mottled greys. Each unsaturated mid-tone texel
// becomes the mean of the texels within r px whose tone is close to its own (a range filter), two passes: the
// mottling inside a trim evens out, its edges and any real gradient (the collar's shading) stay where they are.
// Saturated texels (the accent blue), the whites and the blacks are left alone.
const SMOOTH = flag('--smooth-greys', null);
async function smoothGreys(R) {
  const RANGE = 22;
  const mat = root.listMaterials()[0], tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels, N = W * H;
  let L = new Float32Array(N); const M = new Uint8Array(N);
  for (let k = 0; k < N; k++) { const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), lum = 0.299 * r + 0.587 * g + 0.114 * bl; L[k] = lum; if (lum > 40 && lum < 238 && (mx - mn) / (mx || 1) < 0.18 && !(keepTex && keepTex[k])) M[k] = 1; }
  for (let pass = 0; pass < 2; pass++) {
    const out = Float32Array.from(L);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!M[k]) continue;
      let acc = 0, n = 0; const c = L[k];
      for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const kk = yy * W + xx; if (!M[kk]) continue; const v = L[kk]; if (Math.abs(v - c) > RANGE) continue; acc += v; n++; } }
      if (n) out[k] = acc / n;
    }
    L = out;
  }
  let changed = 0;
  for (let k = 0; k < N; k++) { if (!M[k]) continue; const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2], lum = 0.299 * r + 0.587 * g + 0.114 * bl || 1; const sc = L[k] / lum; if (Math.abs(sc - 1) > 0.01) changed++; data[k * ch] = Math.min(255, Math.round(r * sc)); data[k * ch + 1] = Math.min(255, Math.round(g * sc)); data[k * ch + 2] = Math.min(255, Math.round(bl * sc)); }
  let img = sharp(data, { raw: { width: W, height: H, channels: ch } });
  img = tex.getMimeType() === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  tex.setImage(new Uint8Array(await img.toBuffer()));
  console.log(`smooth greys (r ${R}): ${changed} mid-tone texels evened`);
}
if (SMOOTH) await smoothGreys(parseInt(SMOOTH, 10)); // once before the flatten: even bands lift evenly

/* ---------------- flatten the whites ---------------- */
// --flatten r: the suit's white carries soft grey smudges (the retexture's brush marks, baked shading) while its
// seam lines are thin and dark. A high-pass over the luminance of the light, unsaturated texels lifts every soft
// grey patch back to white and leaves thin lines alone: where the local mean (a box r px around) is itself nearly
// white, the mean goes to 250 and each texel keeps its offset from it; the more a texel stands off its mean (a
// line), the less it moves. Wide grey panels, whose local mean is grey, are not touched.
const FLATTEN = flag('--flatten', null);
if (FLATTEN) {
  const R = parseInt(FLATTEN, 10);
  const mat = root.listMaterials()[0], tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels, N = W * H;
  const L = new Float32Array(N), M = new Float32Array(N);
  for (let k = 0; k < N; k++) { const r = data[k * ch], g = data[k * ch + 1], bl = data[k * ch + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), lum = 0.299 * r + 0.587 * g + 0.114 * bl; if (lum > 120 && (mx - mn) / (mx || 1) < 0.25) { M[k] = 1; L[k] = lum; } }
  const box = (src) => { // separable box sum, radius R
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -R; x <= R; x++) acc += x >= 0 && x < W ? src[y * W + x] : 0; for (let x = 0; x < W; x++) { tmp[y * W + x] = acc; const xo = x - R, xi = x + R + 1; if (xo >= 0) acc -= src[y * W + xo]; if (xi < W) acc += src[y * W + xi]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -R; y <= R; y++) acc += y >= 0 && y < H ? tmp[y * W + x] : 0; for (let y = 0; y < H; y++) { out[y * W + x] = acc; const yo = y - R, yi = y + R + 1; if (yo >= 0) acc -= tmp[yo * W + x]; if (yi < H) acc += tmp[yi * W + x]; } }
    return out;
  };
  const sumL = box(L), sumM = box(M);
  let moved = 0;
  for (let k = 0; k < N; k++) {
    if (!M[k] || sumM[k] < 1 || (keepTex && keepTex[k])) continue;
    const mean = sumL[k] / sumM[k]; if (mean < 195) continue;
    const off = L[k] - mean, w = 1 - Math.max(0, Math.min(1, (Math.abs(off) - 8) / 14)); // a line or a silver band stands off its mean; a smudge is its mean
    const target = Math.min(255, L[k] + (253 - mean) * w);
    if (target <= L[k] + 0.5) continue;
    const sc = target / L[k]; moved++;
    data[k * ch] = Math.min(255, Math.round(data[k * ch] * sc)); data[k * ch + 1] = Math.min(255, Math.round(data[k * ch + 1] * sc)); data[k * ch + 2] = Math.min(255, Math.round(data[k * ch + 2] * sc));
  }
  let img = sharp(data, { raw: { width: W, height: H, channels: ch } });
  img = tex.getMimeType() === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  tex.setImage(new Uint8Array(await img.toBuffer()));
  console.log(`flatten (r ${R}): ${moved} light texels lifted toward white`);
}

if (SMOOTH && FLATTEN) await smoothGreys(Math.max(2, parseInt(SMOOTH, 10) - 1)); // and once after: whatever the flatten unevened

/* ---------------- the base colour: lift the suit to white ---------------- */
// --lift: a soft tone curve instead of a plain gain. A gain that clips turns the generator's baked shading into hard
// white-against-grey edges that follow the bake's noise (the "torn" backpack); this curve compresses the suit's
// 150–230 range into 215–253 continuously, keeps black black and the dark trim dark, and leaves saturated colour
// (the LED blue) almost alone.
const LIFT = has('--lift');
function monotoneCubicLUT(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]), n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  const lut = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    lut[x] = Math.max(0, Math.min(255, Math.round(y)));
  }
  return lut;
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
if (GAIN !== 1 || LIFT) {
  const lut = monotoneCubicLUT([[0, 0], [40, 46], [100, 140], [150, 215], [185, 242], [230, 253], [255, 255]]);
  const done = new Set();
  for (const mat of root.listMaterials()) {
    const tex = mat.getBaseColorTexture(); if (!tex || done.has(tex)) continue; done.add(tex);
    const mime = tex.getMimeType();
    let img;
    if (LIFT) {
      const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
      const ch = info.channels;
      for (let i = 0; i < data.length; i += ch) {
        const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const w = smoothstep(0.15, 0.45, mx ? (mx - mn) / mx : 0); // saturated texels keep their colour, lifted only a little
        data[i] = Math.round(lut[r] * (1 - w) + Math.min(255, r * 1.08) * w);
        data[i + 1] = Math.round(lut[g] * (1 - w) + Math.min(255, g * 1.08) * w);
        data[i + 2] = Math.round(lut[b] * (1 - w) + Math.min(255, b * 1.08) * w);
      }
      img = sharp(data, { raw: { width: info.width, height: info.height, channels: ch } });
    } else img = sharp(Buffer.from(tex.getImage())).linear(GAIN, 0);
    img = mime === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
    tex.setImage(new Uint8Array(await img.toBuffer()));
    console.log(`base colour ${tex.getName() || mime}: ${LIFT ? 'soft lift curve' : '× ' + GAIN}`);
  }
}

/* ---------------- one mesh ---------------- */
await doc.transform(dedup(), join({ keepNamed: false, keepMeshes: false }), weld(), prune({ keepAttributes: true, keepLeaves: false }));
b = bounds();
const meshes = root.listMeshes();
const tri = meshes.reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const verts = meshes.reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getAttribute('POSITION').getCount(), 0), 0);
console.log(`meshes ${meshes.length} · primitives ${meshes.reduce((n, m) => n + m.listPrimitives().length, 0)} · materials ${root.listMaterials().length} · textures ${root.listTextures().length}`);
console.log(`triangles ${Math.round(tri)} · vertices ${verts}`);
console.log(`size x ${(b.max[0] - b.min[0]).toFixed(3)} y ${(b.max[1] - b.min[1]).toFixed(3)} z ${(b.max[2] - b.min[2]).toFixed(3)} · min y ${b.min[1].toFixed(4)} · centre x ${((b.min[0] + b.max[0]) / 2).toFixed(4)} z ${((b.min[2] + b.max[2]) / 2).toFixed(4)}`);
await io.write(OUT, doc);
console.log('wrote', OUT);
