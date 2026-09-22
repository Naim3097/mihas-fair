// A generator's GLB of an item (a skate, a jetpack) made ready for the fair: turned to face +z, mirrored if asked,
// scaled to a size in metres, put on its anchor, simplified to a triangle budget, its paint kept and its glossy PBR
// maps dropped (the fair is matte), the cyan lights lifted into an emissive map, textures as webp.
//   node tools/rig/export-item.mjs in.glb out.glb [--yaw 90] [--mirror] [--fit 0.36 --fit-axis z] [--anchor bottom|center]
//                                   [--tris 6000] [--tex 1024] [--rough 0.6] [--glow] [--report]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, getBounds, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const [input, output] = args;
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
if (!input || !output) { console.error('usage: export-item.mjs in.glb out.glb [--yaw deg] [--mirror] [--fit m --fit-axis x|y|z] [--anchor bottom|center] [--tris n] [--tex px] [--rough r] [--glow]'); process.exit(1); }
const YAW = (Number(opt('--yaw', '0')) * Math.PI) / 180, MIRROR = flag('--mirror'), FIT = Number(opt('--fit', '0')), FIT_AXIS = opt('--fit-axis', 'y'), ANCHOR = opt('--anchor', 'bottom');
const TRIS = Number(opt('--tris', '6000')), TEX = Number(opt('--tex', '1024')), ROUGH = Number(opt('--rough', '0.6')), GLOW = flag('--glow');

await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot(), scene = root.listScenes()[0];
const tris = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const bounds = () => { const b = getBounds(scene); return { min: b.min, max: b.max, size: b.max.map((v, i) => v - b.min[i]) }; };
const fmt = (v) => v.map((x) => x.toFixed(3)).join(' ');
console.log(`in: ${Math.round(tris())} triangles, bbox min ${fmt(bounds().min)} max ${fmt(bounds().max)} (${input.split(/[\\/]/).pop()})`);

await doc.transform(dedup(), flatten());

// ---- the transform: mirror, turn, size, anchor; baked into the vertices so every node ends up at identity ----
const b0 = bounds();
const scale = FIT > 0 ? FIT / b0.size[{ x: 0, y: 1, z: 2 }[FIT_AXIS]] : 1;
const cy = Math.cos(YAW), sy = Math.sin(YAW);
// column-major 4x4: rotation about y (yaw) · uniform scale · mirror in x
const R = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const S = [scale * (MIRROR ? -1 : 1), 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1];
const M0 = mul(R, S);
for (const node of scene.listChildren()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const local = node.getMatrix();
  transformMesh(mesh, mul(M0, local));
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
// the anchor: the bottom centre of what is left, or its centre, at the origin
const b1 = bounds();
const ax = -(b1.min[0] + b1.max[0]) / 2, az = -(b1.min[2] + b1.max[2]) / 2, ay = ANCHOR === 'center' ? -(b1.min[1] + b1.max[1]) / 2 : -b1.min[1];
for (const node of scene.listChildren()) { const mesh = node.getMesh(); if (mesh) transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ax, ay, az, 1]); }

// ---- the mesh: welded, then simplified to the budget ----
await doc.transform(weld());
const before = tris();
if (before > TRIS) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: TRIS / before, error: 0.02, lockBorder: false }));

// ---- the materials: matte, the paint kept, the lights glowing ----
for (const mat of root.listMaterials()) {
  mat.setMetallicFactor(0).setRoughnessFactor(ROUGH).setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null);
  const base = mat.getBaseColorTexture();
  if (GLOW && base && !mat.getEmissiveTexture()) {
    // every cyan texel of the paint (the wheels' rings, the strips, the thrusters) becomes the emissive map
    const img = sharp(Buffer.from(base.getImage())), { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 3); let n = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * info.channels], g = data[i * info.channels + 1], bl = data[i * info.channels + 2];
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), sat = mx ? (mx - mn) / mx : 0;
      const cyan = sat > 0.35 && bl > 140 && g > 120 && r < 0.8 * g; // blue-green, bright, not white, not orange
      if (cyan) { out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bl; n++; }
    }
    const tex = doc.createTexture('glow').setMimeType('image/png').setImage(await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer());
    mat.setEmissiveTexture(tex).setEmissiveFactor([1, 1, 1]);
    console.log(`glow: ${n} of ${info.width * info.height} texels lit`);
  }
}
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [TEX, TEX], slots: /^baseColorTexture$/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', nearLossless: true, resize: [TEX, TEX], slots: /^emissiveTexture$/ }),
  prune(),
);
await io.write(output, doc);
const b2 = bounds();
console.log(`out: ${Math.round(tris())} triangles (from ${Math.round(before)}), bbox min ${fmt(b2.min)} max ${fmt(b2.max)}, size ${fmt(b2.size)} m, ${Math.round(statSync(output).size / 1024)} KB → ${output}`);
