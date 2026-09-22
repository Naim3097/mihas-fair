// The ribbon: samples age and fade, the dead fall off the tail, the strip lies across the direction of travel, and
// the buffers never grow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ribbon } from './ribbon';

test('samples fade with age and drop off after their life; the newest is the brightest', () => {
  const r = new Ribbon(8, 0.06, 1, 0x00e5ff);
  for (let i = 0; i < 5; i++) { r.push(i, 0, 0, 1, 0); r.update(0.1); }
  assert.equal(r.alive, 5);
  assert.ok(r.alphaAt(0) > r.alphaAt(4), 'newest brighter than oldest');
  r.update(0.55); // the oldest (aged 0.5 + 0.55) is past its life
  assert.equal(r.alive, 4);
  r.update(2); assert.equal(r.alive, 0);
});

test('the strip lies across the travel and never holds more than its samples', () => {
  const r = new Ribbon(4, 0.1, 5, 0xffffff);
  for (let i = 0; i < 10; i++) r.push(i, 1, 0, 1, 0);
  r.update(0);
  assert.equal(r.alive, 4, 'a ring of four');
  const p = r.mesh.geometry.getAttribute('position');
  assert.ok(Math.abs(p.getX(0) - 9) < 1e-6 && Math.abs(p.getZ(0) + 0.05) < 1e-6 && Math.abs(p.getZ(1) - 0.05) < 1e-6, 'the head pair straddles the path across z');
  assert.equal(r.mesh.geometry.drawRange.count, 18, 'three quads between four samples');
});
