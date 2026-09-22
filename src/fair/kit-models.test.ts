// The kits' web copies: light, sized for the body, on their anchors, facing +z, matte with their lights kept; and
// the rig they hang on resting the way the attachment code assumes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const root = resolve(import.meta.dirname, '../..');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function read(file: string) {
  const doc = await io.read(resolve(root, 'public/fair', file)), r = doc.getRoot(), b = getBounds(r.listScenes()[0]!);
  const tris = r.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3, 0), 0);
  return { doc, tris, min: b.min, max: b.max, size: b.max.map((v, i) => v - b.min[i]!), mats: r.listMaterials(), kb: statSync(resolve(root, 'public/fair', file)).size / 1024 };
}
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(3)} vs ${b}`);

/** file → [triangles min, max], size x y z (m), the anchor (bottom: origin under it; centre: centred on the origin), KB cap */
const KITS: Record<string, { tris: [number, number]; size: [number, number, number]; anchor: 'bottom' | 'centre'; kb: number }> = {
  'skate.glb': { tris: [3000, 8000], size: [0.17, 0.33, 0.32], anchor: 'bottom', kb: 500 }, // the whole skate; worn as its frame, cut at load (src/fair/clip.ts)
  'jetpack.glb': { tris: [4000, 10000], size: [0.37, 0.42, 0.235], anchor: 'centre', kb: 650 },
};

test('each kit is light, the size the body needs, and on its anchor', async () => {
  for (const [file, want] of Object.entries(KITS)) {
    const k = await read(file);
    assert.ok(k.tris >= want.tris[0] && k.tris <= want.tris[1], `${file}: ${k.tris} triangles`); assert.ok(k.kb <= want.kb, `${file}: ${k.kb.toFixed(0)} KB`);
    for (const i of [0, 1, 2]) near(k.size[i]!, want.size[i]!, 0.04, `${file}: size on axis ${i}`);
    near((k.min[0]! + k.max[0]!) / 2, 0, 0.01, `${file}: centred across`); near((k.min[2]! + k.max[2]!) / 2, 0, 0.01, `${file}: centred along`);
    if (want.anchor === 'bottom') near(k.min[1]!, 0, 0.005, `${file}: the origin is under it`); else near((k.min[1]! + k.max[1]!) / 2, 0, 0.01, `${file}: centred up`);
  }
});

test('the kits are matte with their lights kept: one material, the paint at 1024, an emissive map, no gloss or normal maps', async () => {
  for (const file of Object.keys(KITS)) {
    const { mats } = await read(file);
    assert.equal(mats.length, 1, `${file}: one material`);
    const m = mats[0]!;
    assert.deepEqual(m.getBaseColorTexture()?.getSize(), [1024, 1024], `${file}: the paint`);
    assert.ok(m.getEmissiveTexture(), `${file}: the lights glow`);
    assert.ok(!m.getNormalTexture() && !m.getMetallicRoughnessTexture(), `${file}: no gloss or normal maps`);
    assert.ok(m.getRoughnessFactor() >= 0.55 && m.getMetallicFactor() === 0, `${file}: matte`);
  }
});

test('the skate cut at the sole (0.14 m) keeps its frame and wheels: the lowest 14 cm hold the whole footprint and over half the triangles', async () => {
  const doc = await io.read(resolve(root, 'public/fair/skate.glb')), prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()!, v = [0, 0, 0];
  let kept = 0, total = 0, zMin = Infinity, zMax = -Infinity;
  for (let t = 0; t < idx.getCount(); t += 3) {
    total++; let low = Infinity;
    for (let c = 0; c < 3; c++) { pos.getElement(idx.getScalar(t + c), v); low = Math.min(low, v[1]!); if (v[1]! <= 0.14) { zMin = Math.min(zMin, v[2]!); zMax = Math.max(zMax, v[2]!); } }
    if (low <= 0.14) kept++;
  }
  assert.ok(kept > total / 2 && kept < total, `${kept} of ${total} triangles under the line`);
  near(zMax - zMin, 0.32, 0.02, 'the frame is as long as the skate');
});

test('the rig the kits hang on: the feet and the chest joint rest unrotated, unscaled, where the attachment offsets expect them', async () => {
  const doc = await io.read(resolve(root, 'public/fair/nexo.glb'));
  const at = (name: string) => { const n = doc.getRoot().listNodes().find((x) => x.getName() === name); assert.ok(n, name); return n; };
  for (const name of ['LeftFoot', 'RightFoot', 'Spine01']) {
    const n = at(name), q = n.getWorldRotation(), s = n.getWorldScale();
    assert.deepEqual(q.map((v) => Math.round(v * 1000) / 1000), [0, 0, 0, 1], `${name} rests unrotated`);
    assert.deepEqual(s.map((v) => Math.round(v * 1000) / 1000), [1, 1, 1], `${name} rests unscaled`);
  }
  // the skin maps the mesh into the joints' frame: metres, the soles on y = 0 (fit-mascot-rig writes it so)
  const skin = doc.getRoot().listSkins()[0]!, i = skin.listJoints().findIndex((j) => j.getName() === 'LeftFoot'), m = new Array<number>(16);
  skin.getInverseBindMatrices()!.getElement(i, m);
  const t = at('LeftFoot').getWorldTranslation();
  near(t[1]!, 0.17, 0.02, 'the ankle is 17 cm over the sole'); near(t[0]!, 0.21, 0.02, 'the left ankle is 21 cm off centre');
  near(at('Spine01').getWorldTranslation()[1]!, 0.68, 0.02, 'the chest joint is 68 cm up');
  near(m[0]! * 2, 1.6, 0.01, 'the skin scales the 2-unit mesh to 1.6 m');
});
