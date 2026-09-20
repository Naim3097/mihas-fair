import { test } from 'node:test';
import assert from 'node:assert/strict';
import { box, lineClear, moveBody, newBody, raycast, type World } from './physics';
import { v3 } from './v3';

const DT = 1 / 60, G = 24;
const world: World = { boxes: [
  box(-20, -1, -20, 20, 0, 20, 'floor'),
  box(5, 0, -5, 6, 3, 5, 'wall'),
  box(-5, 0, 2, -3, 0.4, 4, 'step'),
  box(-5, 0, -4, -3, 0.8, -2, 'ledge'),
] };
const body = (x: number, y: number, z: number) => newBody(v3(x, y, z), 0.36, 1.75);
const fall = (b: ReturnType<typeof body>) => { b.vel.y -= G * DT; moveBody(world, b, DT, { step: 0.5, snap: true }); };

test('a body on the floor is grounded, does not sink, and knows what it stands on', () => {
  const b = body(0, 0, 0);
  for (let i = 0; i < 10; i++) fall(b);
  assert.ok(b.grounded);
  assert.ok(Math.abs(b.pos.y) < 1e-3, `y ${b.pos.y}`);
  assert.equal(b.groundTag, 'floor');
  assert.equal(b.vel.y, 0);
});

test('walking into a wall stops at its face, kills the velocity into it, and reports the wall normal', () => {
  const b = body(3, 0, 0);
  b.vel.x = 5;
  moveBody(world, b, 1, { step: 0.5, snap: false });
  assert.ok(Math.abs(b.pos.x - (5 - 0.36)) < 1e-3, `x ${b.pos.x}`);
  assert.equal(b.vel.x, 0);
  assert.deepEqual(b.wall, v3(-1, 0, 0));
});

test('feet climb a 0.4 m step but not a 0.8 m ledge', () => {
  const up = body(-4, 0, 0.5);
  for (let i = 0; i < 90; i++) { up.vel.z = 2; fall(up); }
  assert.ok(Math.abs(up.pos.y - 0.4) < 1e-3, `on the step: y ${up.pos.y}`);
  assert.equal(up.groundTag, 'step');
  const blocked = body(-4, 0, -0.5);
  for (let i = 0; i < 90; i++) { blocked.vel.z = -2; fall(blocked); }
  assert.ok(Math.abs(blocked.pos.y) < 1e-3, 'still on the floor');
  assert.ok(Math.abs(blocked.pos.z - (-2 + 0.36)) < 1e-3, `at the ledge: z ${blocked.pos.z}`);
});

test('a 7.2 m/s jump under 24 m/s² gravity peaks near 1.08 m and lands grounded again', () => {
  const b = body(0, 0, 0);
  fall(b);
  b.vel.y = 7.2;
  let top = 0, landed = false;
  for (let i = 0; i < 200; i++) {
    b.vel.y -= G * DT; moveBody(world, b, DT, { step: 0.5, snap: false });
    top = Math.max(top, b.pos.y);
    if (i > 5 && b.grounded) { landed = true; break; }
  }
  assert.ok(top > 1.0 && top < 1.15, `apex ${top}`);
  assert.ok(landed);
});

test('a body at terminal velocity never passes through a floor slab', () => {
  const b = body(2, 12, 2);
  b.vel.y = -40;
  for (let i = 0; i < 120; i++) moveBody(world, b, DT, { step: 0.5, snap: false });
  assert.ok(b.grounded);
  assert.ok(Math.abs(b.pos.y) < 1e-3, `y ${b.pos.y}`);
});

test('walking off a step snaps the feet down so stairs are never a fall', () => {
  const b = body(-4, 0.4, 3);
  b.grounded = true;
  for (let i = 0; i < 60; i++) { b.vel.z = 2; fall(b); assert.ok(b.grounded, `airborne at frame ${i}`); }
  assert.ok(Math.abs(b.pos.y) < 1e-3, `back on the floor: y ${b.pos.y}`);
});

test('rays report the first face they enter, and lines of sight know about walls', () => {
  const hit = raycast(world, v3(0, 1, 0), v3(1, 0, 0), 10)!;
  assert.ok(hit && Math.abs(hit.t - 5) < 1e-6 && hit.box.tag === 'wall');
  assert.deepEqual(hit.normal, v3(-1, 0, 0));
  assert.equal(raycast(world, v3(0, 1, 0), v3(-1, 0, 0), 10), null);
  const down = raycast(world, v3(0, 1, 0), v3(0, -1, 0), 10)!;
  assert.ok(Math.abs(down.t - 1) < 1e-6 && down.box.tag === 'floor');
  assert.deepEqual(down.normal, v3(0, 1, 0));
  assert.ok(lineClear(world, v3(0, 1, 0), v3(4, 1, 0)));
  assert.ok(!lineClear(world, v3(0, 1, 0), v3(8, 1, 0)));
});
