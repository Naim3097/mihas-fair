// Downloads the rigged+animated GLBs, extracts each clip as deltas from its own rest pose, and writes one library
// GLB holding the joint hierarchy and every clip. Delta format: rotation tracks are D_k = L_k * inv(L_rest)
// (parent space), the Hips translation track is (p_k - p_rest) / hips_rest_height. The runtime applies
// L_target_k = D_k * L_target_rest, so any rig with the same joint names plays the clip.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
const CACHE = process.env.ANIM_CACHE ?? 'tools/anim/cache';
mkdirSync(CACHE, { recursive: true });

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3El91sUGIVLDG5LUgqMkv8f5Dn0/';
const CLIPS = [
  ['walk', 613, 'hf_20260919_181343_f5a44367-941f-40c5-b3c9-90d4ba00577e'],
  ['run', 659, 'hf_20260919_181346_16f83e4d-9121-472a-bf7b-5c15c959a5c4'],
  ['sprint', 644, 'hf_20260919_181350_e4bc7297-0f1e-4a42-96cb-8c92152e7e4f'],
  ['jump', 466, 'hf_20260919_181353_d5fd507a-39d3-4c0a-b06e-7a5ba09eebd8'],
  ['dodge', 158, 'hf_20260919_181357_5312f430-9f71-4d6a-b256-bc289a2e5101'],
  ['attack-1', 96, 'hf_20260919_181400_784725d2-c35b-48a7-8f6d-08a55383b399'],
  ['attack-2', 378, 'hf_20260919_181404_18c8bfc4-dbda-436c-ba24-bf70f352bd25'],
  ['attack-3', 94, 'hf_20260919_181407_d34e1486-1bdf-4828-adc7-7a06beda9be3'],
  ['cast', 129, 'hf_20260919_181414_30f46f23-5cea-4590-b937-ffa6243b9680'],
  ['cast-heavy', 125, 'hf_20260919_181419_168c876c-f2a6-4640-a700-37653bf39dea'],
  ['slam', 127, 'hf_20260919_181423_0d0711db-c7cb-45bf-acf9-8e9f8c562f24'],
  ['spin', 397, 'hf_20260919_181427_cdfc08a3-dbd1-4890-b8d8-fbb32c8a584d'],
  ['block', 138, 'hf_20260919_181430_1b0c4e04-76f5-43aa-bf9a-957b7e370222'],
  ['hit', 178, 'hf_20260919_181434_c3b2a1bf-0cd8-4291-adf8-bc6d13248244'],
  ['death', 189, 'hf_20260919_181438_ac55c11e-2e7e-494a-b947-e8fbd292b0d4'],
  ['victory', 59, 'hf_20260919_181441_b9e90696-d3f5-4635-8820-3ad8fd9e1186'],
  ['wave', 28, 'hf_20260919_194550_d1c0abc9-8fae-4b09-9177-d1da4c13a12b'],
  ['dance', 64, 'hf_20260919_194556_a7efb651-7d48-4b81-8e6b-f21f71cecc73'],
  ['idle-calm', 11, 'hf_20260919_205902_238b7349-16a0-4aa7-9e90-6dc7c9422112'],
  ['stroll', 341, 'hf_20260919_205905_13d0f48a-c51f-41b3-8db9-2656d7cd27bd'],
  ['jog', 14, 'hf_20260919_205908_ed0ab2d4-59ad-4beb-b21d-d6016ec994db'],
];

async function download(url, file) {
  if (existsSync(file)) return;
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status); writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    catch (e) { console.log('  retry', i + 1, e.message); await new Promise((r) => setTimeout(r, 5000)); }
  }
  throw new Error('download failed: ' + url);
}
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const lib = new Document();
const buffer = lib.createBuffer('anim');
const scene = lib.createScene('library');
const libNodes = new Map();
let hierarchyDone = false;
const summary = [];

for (const [key, actionId, name] of CLIPS) {
  const file = `${CACHE}/${key}.glb`;
  console.log('==', key, actionId);
  await download(BASE + name + '.glb', file);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const rest = new Map(joints.map((j) => [j.getName(), { t: j.getTranslation(), r: j.getRotation() }]));
  if (!hierarchyDone) {
    // clone the joint hierarchy (names and rest pose) so the clips have nodes to target
    let top = joints[0]; while (top.getParentNode() && !top.getParentNode().getMesh()) top = top.getParentNode();
    const clone = (src, parent) => {
      if (src.getMesh()) return;
      const n = lib.createNode(src.getName()).setTranslation(src.getTranslation()).setRotation(src.getRotation()).setScale(src.getScale());
      libNodes.set(src.getName(), n);
      if (parent) parent.addChild(n); else scene.addChild(n);
      for (const c of src.listChildren()) clone(c, n);
    };
    clone(top, null);
    hierarchyDone = true;
    console.log('  hierarchy from', top.getName(), 'joints', joints.length);
  }
  const anim = root.listAnimations()[0];
  const out = lib.createAnimation(key);
  const hipsRest = rest.get('Hips');
  const hipsHeight = Math.max(1e-3, Math.abs(hipsRest.t[1]));
  let channels = 0, duration = 0;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(), path = ch.getTargetPath(), s = ch.getSampler();
    const jn = node.getName(), r0 = rest.get(jn);
    if (!r0 || !libNodes.has(jn)) continue;
    if (path !== 'rotation' && !(path === 'translation' && jn === 'Hips')) continue;
    const times = s.getInput().getArray(), vals = s.getOutput().getArray();
    duration = Math.max(duration, times[times.length - 1]);
    const n = times.length;
    let values;
    if (path === 'rotation') {
      values = new Float32Array(n * 4);
      const inv = qinv(r0.r);
      for (let k = 0; k < n; k++) { const q = qmul([vals[k * 4], vals[k * 4 + 1], vals[k * 4 + 2], vals[k * 4 + 3]], inv); values.set(q, k * 4); }
    } else {
      values = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { values[k * 3] = (vals[k * 3] - r0.t[0]) / hipsHeight; values[k * 3 + 1] = (vals[k * 3 + 1] - r0.t[1]) / hipsHeight; values[k * 3 + 2] = (vals[k * 3 + 2] - r0.t[2]) / hipsHeight; }
    }
    const inp = lib.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
    const outp = lib.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(values).setBuffer(buffer);
    const sampler = lib.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation('LINEAR');
    const channel = lib.createAnimationChannel().setTargetNode(libNodes.get(jn)).setTargetPath(path).setSampler(sampler);
    out.addSampler(sampler).addChannel(channel);
    channels++;
  }
  summary.push({ key, actionId, channels, duration: +duration.toFixed(2) });
  console.log('  channels', channels, 'duration', duration.toFixed(2));
}
lib.getRoot().getAsset().extras = { ceritera: 'anim-delta-v1', clips: summary };
await io.write(process.env.ANIM_OUT ?? 'assets-src/animation/library-raw.glb', lib);
console.log(JSON.stringify(summary));
