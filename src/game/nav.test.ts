// The guide trail's dots: laid from where the body is, along the route, none behind it, none under its feet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotsAlong, nearestOnPath, pathLength, type P2 } from './nav';

const path: P2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
const dots = () => Array.from({ length: 50 }, () => ({ x: 0, y: 0 }));

test('the nearest point on the route is found on the right segment, and only within the first metres asked for', () => {
  assert.deepEqual(nearestOnPath(path, { x: 4, y: 1 }), { i: 0, t: 0.4, d: 1 });
  const corner = nearestOnPath(path, { x: 10.5, y: 3 }); assert.equal(corner.i, 1); assert.ok(Math.abs(corner.t - 0.3) < 1e-9);
  const near = nearestOnPath(path, { x: 9.6, y: 9.6 }, 8); assert.equal(near.i, 0, 'the far segment is out of range'); assert.ok(Math.abs(near.t - 0.96) < 1e-9);
  assert.equal(nearestOnPath([], { x: 0, y: 0 }).d, Infinity);
});

test('dots start a metre ahead of the body and follow the route round its corner; nothing lies behind', () => {
  const out = dots(), n = dotsAlong(path, nearestOnPath(path, { x: 4, y: 0.5 }), 1, 1.5, 50, out);
  assert.equal(out[0]!.x, 5); assert.equal(out[0]!.y, 0);
  assert.ok(out.slice(0, n).every((d) => d.x >= 5 - 1e-9), 'none behind the body');
  const turned = out.slice(0, n).find((d) => d.y > 0)!; assert.equal(turned.x, 10, 'after the corner the dots go north');
  assert.ok(Math.abs(n - Math.floor((pathLength(path) - 4 - 1) / 1.5) - 1) <= 1, `${n} dots along the ${pathLength(path) - 4} m left`);
  assert.equal(dotsAlong(path, { i: 0, t: 0 }, 1, 1.5, 3, out), 3, 'capped');
  assert.equal(dotsAlong([{ x: 0, y: 0 }], { i: 0, t: 0 }, 1, 1.5, 3, out), 0, 'no route, no dots');
});
