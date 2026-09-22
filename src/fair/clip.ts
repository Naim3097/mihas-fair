// A geometry cut at a height: every triangle whose lowest corner sits above the line goes. The vertex buffers are
// shared with the source (only the index is new), so the cut costs no vertex or texture memory of its own.
import * as THREE from 'three';

export function clipAbove(src: THREE.BufferGeometry, y: number): THREE.BufferGeometry {
  const pos = src.getAttribute('position'), idx = src.getIndex();
  const n = idx ? idx.count : pos.count, at = (k: number) => (idx ? idx.getX(k) : k), kept: number[] = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const a = at(t), b = at(t + 1), c = at(t + 2);
    if (Math.min(pos.getY(a), pos.getY(b), pos.getY(c)) <= y) kept.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) out.setAttribute(name, src.getAttribute(name));
  out.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? new Uint32Array(kept) : new Uint16Array(kept), 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}
