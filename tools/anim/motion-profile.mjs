import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2] ?? 'assets-src/animation/library-raw.glb');
for (const anim of doc.getRoot().listAnimations()) {
  const buckets = new Map();
  let dur = 0;
  for (const ch of anim.listChannels()) {
    if (ch.getTargetPath() !== 'rotation') continue;
    const s = ch.getSampler(), t = s.getInput().getArray(), v = s.getOutput().getArray();
    dur = Math.max(dur, t[t.length - 1]);
    for (let k = 1; k < t.length; k++) {
      const dt = t[k] - t[k - 1];
      if (dt < 0.005) continue;
      const d = Math.abs(v[k*4]*v[(k-1)*4] + v[k*4+1]*v[(k-1)*4+1] + v[k*4+2]*v[(k-1)*4+2] + v[k*4+3]*v[(k-1)*4+3]);
      const ang = 2 * Math.acos(Math.min(1, d)) / dt;
      const b = Math.floor(t[k] / 0.1);
      buckets.set(b, (buckets.get(b) ?? 0) + ang);
    }
  }
  const n = Math.ceil(dur / 0.1);
  const vals = Array.from({ length: n }, (_, i) => buckets.get(i) ?? 0);
  const sorted = [...vals].sort((a, b) => a - b), ref = sorted[Math.floor(sorted.length * 0.92)] || 1;
  const line = vals.map((v) => String(Math.min(9, Math.round((v / ref) * 7)))).join('');
  console.log(anim.getName().padEnd(11), dur.toFixed(2).padStart(5), line);
}
