// Finds the cleanest loop window in a library clip: the pair of moments, between minLen and maxLen apart, whose
// poses (every rotation channel) are closest, so a looping window cut there barely hitches.
//   node tools/anim/loop-window.mjs <clip key> [minLen=2] [maxLen=6] [library=assets-src/animation/library-raw.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const [key, minLen = '2', maxLen = '6', lib = 'assets-src/animation/library-raw.glb'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(lib);
const anim = doc.getRoot().listAnimations().find((a) => a.getName() === key);
if (!anim) throw new Error('no clip ' + key);
const chans = anim.listChannels().filter((c) => c.getTargetPath() === 'rotation').map((c) => ({ t: c.getSampler().getInput().getArray(), v: c.getSampler().getOutput().getArray() }));
const dur = Math.max(...chans.map((c) => c.t[c.t.length - 1]));
const STEP = 1 / 30, n = Math.floor(dur / STEP);
const sample = (c, time) => { const t = c.t; let k = 0; while (k < t.length - 2 && t[k + 1] < time) k++; const u = Math.max(0, Math.min(1, (time - t[k]) / ((t[k + 1] - t[k]) || 1))); const o = []; for (let j = 0; j < 4; j++) o.push(c.v[k * 4 + j] * (1 - u) + c.v[(k + 1) * 4 + j] * u); return o; };
const poses = Array.from({ length: n }, (_, i) => chans.map((c) => sample(c, i * STEP)));
const vel = (i) => (i > 0 && i < n - 1 ? poses[i].map((q, j) => q.map((x, m) => (poses[i + 1][j][m] - poses[i - 1][j][m]) / (2 * STEP))) : null);
const d2 = (a, b) => a.reduce((s, q, j) => s + q.reduce((t, x, m) => t + (x - b[j][m]) ** 2, 0), 0);
let best = null;
for (let i = 1; i < n - 1; i++) for (let j = i + Math.round(+minLen / STEP); j < Math.min(n - 1, i + Math.round(+maxLen / STEP)); j++) {
  const score = d2(poses[i], poses[j]) + 0.05 * d2(vel(i), vel(j));
  if (!best || score < best.score) best = { score, from: i * STEP, to: j * STEP };
}
console.log(key, 'duration', dur.toFixed(2), 'best window', best.from.toFixed(2), '→', best.to.toFixed(2), 'length', (best.to - best.from).toFixed(2), 'pose gap', best.score.toFixed(4));
