// What a GLB holds, in one line each: triangles, size, where it sits, its nodes and materials. node tools/rig/inspect-glb.mjs a.glb b.glb …
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), root = doc.getRoot(), scene = root.listScenes()[0], b = getBounds(scene);
  const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  const mats = root.listMaterials().map((m) => `base ${m.getBaseColorTexture() ? m.getBaseColorTexture().getSize().join('x') : '-'} mr ${m.getMetallicRoughnessTexture() ? 'y' : 'n'} nrm ${m.getNormalTexture() ? 'y' : 'n'} em ${m.getEmissiveTexture() ? 'y' : 'n'} rough ${m.getRoughnessFactor()} metal ${m.getMetallicFactor()}`);
  const size = b.max.map((v, i) => v - b.min[i]);
  console.log(f.split(/[\/]/).pop().padEnd(20), String(Math.round(tris)).padStart(7), 'tris  size', size.map((v) => v.toFixed(2)).join(' x '), ' min', b.min.map((v) => v.toFixed(2)).join(' '), ' nodes', root.listNodes().length, ' | ', mats.join(' ; '));
}
