// Blends the texture sets of two GLBs of the same body (same mesh, same UV layout) by which way each surface point
// faces: texels on surfaces that face the +axis direction come from the first file, the rest from the second, with
// a soft transition in between. Made for two retexture passes of one mesh, each styled from a different reference
// view: one gets the front right (visor, LED, chest panel), the other the back (backpack, ear rings).
//
//   node tools/rig/blend-textures-by-facing.mjs front.glb back.glb out.glb [--axis x] [--soft 0.35]
//   node tools/rig/blend-textures-by-facing.mjs front.glb back.glb out.glb [--axis x] --by position --from 0.07 --to 0.13
//
// out.glb is back.glb with its colour, metal-rough and normal maps replaced by the blends. --axis names the model
// axis its face points along (+x for a Tripo body, +z after normalize-mascot.mjs). By default the blend follows the
// surface normal: --soft is the facing value (0..1, the normal's component along that axis) at which the blend
// reaches the first file fully; it starts at 0. With --by position it follows where the point is along that axis
// instead (in the file's own units): the second file up to --from, the first from --to on. Position is the better
// rule when a feature is a ring or a knob whose faces point every way (the ear rings): a normal-based blend gives
// such a part a patchy mix of both passes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const [A, B, OUT] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--axis', '--soft', '--by', '--from', '--to'].includes(args[i - 1])));
if (!A || !B || !OUT) { console.error('usage: node tools/rig/blend-textures-by-facing.mjs front.glb back.glb out.glb [--axis x] [--soft 0.35 | --by position --from a --to b]'); process.exit(1); }
const AXIS = { x: 0, y: 1, z: 2 }[flag('--axis', 'x')], SOFT = parseFloat(flag('--soft', '0.35'));
const BY_POSITION = flag('--by', 'normal') === 'position', FROM = parseFloat(flag('--from', '0')), TO = parseFloat(flag('--to', '0.1'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const docA = await io.read(A), docB = await io.read(B);
const matA = docA.getRoot().listMaterials()[0], matB = docB.getRoot().listMaterials()[0];
const prim = docB.getRoot().listMeshes()[0].listPrimitives()[0];
const nrm = prim.getAttribute('NORMAL').getArray(), pos = prim.getAttribute('POSITION').getArray(), uv = prim.getAttribute('TEXCOORD_0').getArray(), idx = prim.getIndices().getArray();
/** How much of the first file a vertex gets: by its facing, or by where it sits along the axis. */
const share = (i) => (BY_POSITION ? smooth((pos[i * 3 + AXIS] - FROM) / (TO - FROM)) : smooth(nrm[i * 3 + AXIS] / SOFT));
const nA = docA.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getCount();
if (nA !== prim.getAttribute('POSITION').getCount()) throw new Error(`the two files do not share a mesh: ${nA} vs ${prim.getAttribute('POSITION').getCount()} vertices`);

/* ---------------- the weight map: how much of the first file each texel gets ---------------- */
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function weightMap(W, H) {
  const w = new Float32Array(W * H), cov = new Uint8Array(W * H);
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const px = v.map((i) => uv[i * 2] * W), py = v.map((i) => uv[i * 2 + 1] * H); // glTF: (0,0) is the image's top left
    const f = v.map(share);
    const minX = Math.max(0, Math.floor(Math.min(...px)) - 1), maxX = Math.min(W - 1, Math.ceil(Math.max(...px)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(...py)) - 1), maxY = Math.min(H - 1, Math.ceil(Math.max(...py)) + 1);
    const det = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
    if (Math.abs(det) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let l1 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / det;
      let l2 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / det;
      let l0 = 1 - l1 - l2;
      const margin = -1.5 / Math.sqrt(Math.abs(det)); // rasterize a little past each edge so seams do not bleed the other file
      if (l0 < margin || l1 < margin || l2 < margin) continue;
      l0 = Math.max(0, l0); l1 = Math.max(0, l1); l2 = Math.max(0, l2); const s = l0 + l1 + l2 || 1;
      const k = y * W + x;
      if (!cov[k] || (l0 >= 0 && l1 >= 0 && l2 >= 0)) { w[k] = (l0 * f[0] + l1 * f[1] + l2 * f[2]) / s; cov[k] = 1; }
    }
  }
  for (let pass = 0; pass < 4; pass++) { // fill the padding next to islands from their neighbours
    const nw = Float32Array.from(w), nc = Uint8Array.from(cov);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (cov[k]) continue;
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue; const kk = yy * W + xx; if (cov[kk]) { sum += w[kk]; n++; } }
      if (n) { nw[k] = sum / n; nc[k] = 1; }
    }
    w.set(nw); cov.set(nc);
  }
  let covered = 0; for (let k = 0; k < cov.length; k++) covered += cov[k];
  return { w, covered };
}

/* ---------------- blend each map ---------------- */
async function blend(texA, texB, label) {
  if (!texA || !texB) { console.log(`${label}: only one file has it, keeping the second file's`); return; }
  const a = await sharp(Buffer.from(texA.getImage())).raw().toBuffer({ resolveWithObject: true });
  const W = a.info.width, H = a.info.height, ch = a.info.channels;
  const b = await sharp(Buffer.from(texB.getImage())).resize(W, H).raw().toBuffer({ resolveWithObject: true });
  const bch = b.info.channels;
  const { w, covered } = weightMap(W, H);
  const out = Buffer.alloc(W * H * ch);
  let fromA = 0;
  for (let k = 0; k < W * H; k++) {
    const t = w[k]; fromA += t;
    for (let c = 0; c < ch; c++) out[k * ch + c] = Math.round(a.data[k * ch + c] * t + b.data[k * bch + Math.min(c, bch - 1)] * (1 - t));
  }
  const mime = texB.getMimeType();
  let img = sharp(out, { raw: { width: W, height: H, channels: ch } });
  img = mime === 'image/png' ? img.png() : img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' });
  texB.setImage(new Uint8Array(await img.toBuffer()));
  console.log(`${label}: ${W}x${H}, ${(100 * covered / (W * H)).toFixed(1)}% of texels on the body, ${(100 * fromA / (W * H)).toFixed(1)}% from the first file`);
}
await blend(matA.getBaseColorTexture(), matB.getBaseColorTexture(), 'colour');
await blend(matA.getMetallicRoughnessTexture(), matB.getMetallicRoughnessTexture(), 'metal-rough');
await blend(matA.getNormalTexture(), matB.getNormalTexture(), 'normal');
await io.write(OUT, docB);
console.log('wrote', OUT);
