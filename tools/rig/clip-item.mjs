// Cut the top off an exported item: every triangle whose lowest corner sits above the line goes. The skate's boot
// lives inside Nexo's own boot and is never seen, so only the frame and the wheels need drawing.
//   node tools/rig/clip-item.mjs in.glb out.glb --above 0.14
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [input, output, ...rest] = process.argv.slice(2);
const i = rest.indexOf('--above'), ABOVE = i >= 0 ? Number(rest[i + 1]) : NaN;
if (!input || !output || !Number.isFinite(ABOVE)) { console.error('usage: clip-item.mjs in.glb out.glb --above y'); process.exit(1); }
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input), root = doc.getRoot();
let kept = 0, dropped = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
  const n = idx ? idx.getCount() : pos.getCount(), at = (k) => (idx ? idx.getScalar(k) : k), v = [0, 0, 0];
  const out = [];
  for (let t = 0; t < n; t += 3) {
    let low = Infinity;
    for (let c = 0; c < 3; c++) { pos.getElement(at(t + c), v); low = Math.min(low, v[1]); }
    if (low <= ABOVE) { out.push(at(t), at(t + 1), at(t + 2)); kept++; } else dropped++;
  }
  const arr = out.every((x) => x < 65536) ? new Uint16Array(out) : new Uint32Array(out);
  const acc = doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(root.listBuffers()[0]);
  prim.setIndices(acc);
}
await doc.transform(prune());
await io.write(output, doc);
const b = getBounds(root.listScenes()[0]);
console.log(`kept ${kept} triangles, dropped ${dropped}; bbox min ${b.min.map((x) => x.toFixed(3)).join(' ')} max ${b.max.map((x) => x.toFixed(3)).join(' ')}; ${Math.round(statSync(output).size / 1024)} KB → ${output}`);
