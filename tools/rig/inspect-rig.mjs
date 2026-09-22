// The rig's rest pose in numbers: where the bones are and how they are turned, the boots' and the back's extents,
// so a kit can be put on the body by measurement rather than by eye.
//   node tools/rig/inspect-rig.mjs public/fair/nexo.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot(), scene = root.listScenes()[0];
const f = (v) => v.map((x) => x.toFixed(3)).join(' ');
const b = getBounds(scene), size = b.max.map((v, i) => v - b.min[i]);
console.log(`bbox min ${f(b.min)} max ${f(b.max)} size ${f(size)} · scale to 1.6 m: ${(1.6 / size[1]).toFixed(4)}`);
console.log('nodes:', root.listNodes().map((n) => n.getName()).join(' '));
for (const n of root.listNodes()) {
  if (!/^(Hips|Spine\d*|Neck|Head|Left(UpLeg|Leg|Foot|ToeBase|Toe_End)|Right(UpLeg|Leg|Foot|ToeBase|Toe_End))$/.test(n.getName())) continue;
  console.log(`${n.getName().padEnd(14)} t ${f(n.getWorldTranslation())}  q ${f(n.getWorldRotation())}  s ${f(n.getWorldScale())}`);
}
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh) continue;
  console.log(`mesh node ${n.getName()} matrix ${f(n.getWorldMatrix())}`);
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), N = pos.getCount(), v = [0, 0, 0];
    const boot = { l: [Infinity, Infinity, -Infinity, -Infinity, -Infinity], r: [Infinity, Infinity, -Infinity, -Infinity, -Infinity] };
    let backZ = Infinity, chestZ = -Infinity, backX = [Infinity, -Infinity];
    const bootTop = b.min[1] + 0.13 * size[1], chest = [b.min[1] + 0.45 * size[1], b.min[1] + 0.7 * size[1]];
    for (let i = 0; i < N; i++) {
      pos.getElement(i, v);
      if (v[1] < bootTop) { const s = v[0] < 0 ? boot.l : boot.r; s[0] = Math.min(s[0], v[0]); s[1] = Math.min(s[1], v[2]); s[2] = Math.max(s[2], v[0]); s[3] = Math.max(s[3], v[2]); s[4] = Math.max(s[4], v[1]); }
      if (v[1] > chest[0] && v[1] < chest[1]) { backZ = Math.min(backZ, v[2]); chestZ = Math.max(chestZ, v[2]); backX[0] = Math.min(backX[0], v[0]); backX[1] = Math.max(backX[1], v[0]); }
    }
    console.log(`boots below y ${bootTop.toFixed(3)}: left x ${boot.l[0].toFixed(3)}..${boot.l[2].toFixed(3)} z ${boot.l[1].toFixed(3)}..${boot.l[3].toFixed(3)} · right x ${boot.r[0].toFixed(3)}..${boot.r[2].toFixed(3)} z ${boot.r[1].toFixed(3)}..${boot.r[3].toFixed(3)}`);
    console.log(`torso band y ${chest[0].toFixed(3)}..${chest[1].toFixed(3)}: back z ${backZ.toFixed(3)} chest z ${chestZ.toFixed(3)} x ${backX[0].toFixed(3)}..${backX[1].toFixed(3)}`);
  }
}
