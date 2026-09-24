// One universe: the Playground floats over the X, the way up rises beside its pad, and no ride between the worlds (up
// from the lift at the X, or from anywhere on the floor by the menu) ever passes through a platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelData } from '../shared/types';
import { SLAB, buildCourse } from './playground/course';
import { toWorld } from './fair/level';
import { SKY_VIEW, SKY_Y, ridePoint, rideSeconds, rideView, skyAnchor, type Ride } from './universe';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'public/data/floor.json'), 'utf8')) as LevelData;
const course = buildCourse();

test('the Playground floats over the X, above every column of light; the way up rises beside its pad; the shared view faces the way the pad does', () => {
  const a = skyAnchor(level), d = toWorld(level.hero.dock.x, level.hero.dock.y, 0), pad = course.platforms[0]!;
  assert.equal(a.y, SKY_Y); assert.ok(SKY_Y > 50, 'over the checkpoints\' columns of light (about 48 m)');
  const colX = d.x - a.x, colZ = d.z - a.z, ring = 1.25; // the column, in the course's metres
  assert.ok(colX + ring < pad.x0 - 0.4 || colX - ring > pad.x1 + 0.4 || colZ + ring < pad.z0 - 0.4 || colZ - ring > pad.z1 + 0.4, 'the rings climb past the pad, never through it');
  assert.ok(Math.hypot(colX - course.portal.x, colZ - course.portal.z) < 8, 'beside the portal down to the fair');
  assert.equal(SKY_VIEW.yaw, course.spawn.yaw, 'the view both worlds share at the top of a ride faces along the course, as the body does on the pad');
});

test('no ride up passes through a platform, from the lift at the X or from anywhere on the floor, and every one ends on the pad', () => {
  const a = skyAnchor(level), d = toWorld(level.hero.dock.x, level.hero.dock.y, 0), out = { x: 0, y: 0, z: 0 };
  const far = [[34, 62], [150, 90], [98, 40], [182, 60], [12, 104], [120, 108]].map(([px, py]) => ({ ...toWorld(px!, py!, 0), arc: 14 }));
  for (const s of [{ ...d, arc: 2.5 }, ...far]) {
    const r: Ride = { from: s, to: a, arc: s.arc, rise: 0.55, s: rideSeconds(s, a) };
    for (let k = 0; k < 1; k += 0.001) {
      ridePoint(r, k, out);
      const x = out.x - a.x, y = out.y - a.y, z = out.z - a.z; // the rider's feet in the course's metres
      for (const p of course.platforms) {
        const over = x > p.x0 - 0.36 && x < p.x1 + 0.36 && z > p.z0 - 0.36 && z < p.z1 + 0.36; // the body's width
        if (over) assert.ok(y >= p.y - 1e-6 || y + 1.8 <= p.y - SLAB, `from ${s.x.toFixed(0)},${s.z.toFixed(0)} at k ${k.toFixed(3)}: through the platform ${p.x0}..${p.x1} (feet ${y.toFixed(2)}, top ${p.y})`);
      }
    }
    ridePoint(r, 1, out);
    assert.ok(Math.hypot(out.x - a.x, out.y - a.y, out.z - a.z) < 1e-9, 'it ends on the pad, where the Playground puts the body');
    assert.ok(r.s >= 1.3 && r.s <= 2.4, `a ride of ${r.s.toFixed(2)} s: long enough to be seen, never dragging`);
  }
});

test('the camera on a ride: from where it was to where the ride ends, pulled back in the middle, turning the short way round', () => {
  const from = { dist: 6.4, pitch: 0.38, yaw: -3 }, to = { ...SKY_VIEW };
  assert.deepEqual(rideView(from, to, 0, 4, 0.1), from);
  const end = rideView(from, to, 1, 4, 0.1);
  assert.ok(Math.abs(end.dist - to.dist) < 1e-9 && Math.abs(end.pitch - to.pitch) < 1e-9 && Math.abs(Math.sin(end.yaw - to.yaw)) < 1e-9);
  assert.ok(rideView(from, to, 0.5, 4, 0.1).dist > (from.dist + to.dist) / 2, 'wider in the middle');
  const turn = rideView({ ...from, yaw: 3 }, { ...from, yaw: -3 }, 0.5, 0, 0).yaw; // 3 → −3 is a short turn across ±π, not a long one through 0
  assert.ok(Math.abs(Math.abs(turn) - Math.PI) < 0.3, `turned the short way: ${turn.toFixed(2)}`);
});
