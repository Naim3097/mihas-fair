// The cut that makes a skate frame of a skate: triangles above the line go, the vertex buffers stay shared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clipAbove } from './clip';

function twoTriangles(indexed: boolean): THREE.BufferGeometry {
  // one triangle on the floor (y 0..0.1), one up high (y 0.5..0.6), one straddling the line (y 0.1..0.9)
  const v = [0, 0, 0, 1, 0, 0, 0, 0.1, 1, 0, 0.5, 0, 1, 0.6, 0, 0, 0.5, 1, 0, 0.1, 0, 1, 0.9, 0, 0, 0.9, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(18).fill(0.5), 2));
  if (indexed) g.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  return g;
}

test('a triangle whose lowest corner is under the line stays, one wholly above goes, the buffers are shared', () => {
  for (const indexed of [true, false]) {
    const src = twoTriangles(indexed), out = clipAbove(src, 0.2);
    assert.equal(out.getIndex()!.count, 6, indexed ? 'indexed' : 'unindexed');
    assert.deepEqual(Array.from(out.getIndex()!.array), [0, 1, 2, 6, 7, 8]);
    assert.equal(out.getAttribute('position'), src.getAttribute('position'), 'the positions are the same object');
    assert.equal(out.getAttribute('uv'), src.getAttribute('uv'), 'the uvs are the same object');
    assert.ok(out.boundingBox && out.boundingSphere, 'bounds computed');
  }
});

test('the line at the top keeps everything; under the floor keeps nothing', () => {
  const src = twoTriangles(true);
  assert.equal(clipAbove(src, 1).getIndex()!.count, 9);
  assert.equal(clipAbove(src, -1).getIndex()!.count, 0);
});
