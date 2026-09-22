import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { LevelData } from '../../shared/types';
import { NavGrid } from './nav';
import { HeadingFilter, STEP_M, StepDetector, Tracker, bearingToPlan, snapToAisle } from './track';
import { PLAN_ROT_DEG } from '../../shared/rules';

const level = JSON.parse(readFileSync('public/data/floor.json', 'utf8')) as LevelData, nav = new NavGrid(level);
const deg = (d: number) => (d * Math.PI) / 180;

test('the compass turns into plan directions: north is +x, west is +y, and near-aisle headings snap to the aisle', () => {
  assert.ok(Math.abs(bearingToPlan(0, PLAN_ROT_DEG)) < 1e-9, 'north → +x');
  assert.ok(Math.abs(bearingToPlan(270, PLAN_ROT_DEG) - Math.PI / 2) < 1e-9, 'west → +y');
  assert.equal(snapToAisle(deg(14)), 0);
  assert.equal(snapToAisle(deg(-80)), -Math.PI / 2);
  assert.equal(snapToAisle(deg(45)), deg(45), 'a diagonal is left alone');
  const h = new HeadingFilter(); for (const d of [358, 2, 359, 1, 0]) h.push(d, 0.5);
  assert.ok(Math.min(h.deg!, 360 - h.deg!) < 2, `averaging across north stays at north, got ${h.deg}`);
});

test('steps: a walking rhythm counts each step once; standing and a single jolt count none', () => {
  const walk = (hz: number, secs: number, amp: number) => { const d = new StepDetector(); let n = 0; for (let t = 0; t < secs * 1000; t += 16) if (d.sample(9.81 + amp * Math.sin((2 * Math.PI * hz * t) / 1000), t)) n++; return n; };
  const n = walk(1.8, 10, 2.5);
  assert.ok(n >= 16 && n <= 19, `18 steps in 10 s at 1.8 Hz, counted ${n}`);
  assert.equal(walk(1.8, 10, 0.3), 0, 'a phone held still (hand tremor) does not walk');
  const d = new StepDetector(); let jolts = 0; for (let t = 0; t < 2000; t += 16) if (d.sample(t > 500 && t < 540 ? 14 : 9.81, t)) jolts++;
  assert.ok(jolts <= 1);
});

test('fusion: a scan pins, steps carry along the aisle, GPS barely moves a fresh fix but wins once steps have drifted', () => {
  const start = nav.nearestWalkable(20, 40.5)!, tr = new Tracker((p, dx, dy) => nav.move(p, dx, dy));
  tr.anchor(start.x, start.y, 0);
  assert.ok(tr.sigma <= 1.01);
  for (let i = 0; i < 20; i++) tr.step(deg(8)); // walking "north" with the compass 8° off: snapped to the aisle
  assert.ok(Math.abs(tr.x - (start.x + 20 * STEP_M)) < 0.01 && Math.abs(tr.y - start.y) < 0.01, `${tr.x},${tr.y}`);
  const before = tr.x;
  tr.gps(tr.x + 25, tr.y, 25); // a typical indoor fix, 25 m off
  assert.ok(tr.x - before < 0.5, `GPS moved a just-scanned position ${(tr.x - before).toFixed(2)} m`);
  for (let i = 0; i < 3000; i++) tr.step(0); // ~2 km of steps later, drift has piled up (and the wall has stopped it)
  const far = tr.x; tr.gps(far - 30, tr.y, 10);
  assert.ok(far - tr.x > 5, 'after long drift, a good fix pulls hard');
});

test('fusion: a step never goes through a booth', () => {
  const b = level.booths.find((x) => x.deck === 2 && x.id === '7C17')!, p = nav.nearestWalkable(b.x, b.y, 6)!;
  const tr = new Tracker((q, dx, dy) => nav.move(q, dx, dy)); tr.anchor(p.x, p.y, 0);
  for (let i = 0; i < 40; i++) { tr.step(Math.atan2(b.y - tr.y, b.x - tr.x)); assert.ok(nav.walkable(tr.x, tr.y), `step ${i} is on the floor`); }
});

test('fusion: two scans teach the tracker this phone\'s compass error and stride', () => {
  const tr = new Tracker();
  tr.anchor(0, 0, 0);
  for (let i = 0; i < 40; i++) tr.step(deg(30)); // walked due +x, but this compass reads 30° off, strides long
  tr.anchor(40 * STEP_M * 1.2, 0, 60_000);
  assert.ok(Math.abs(tr.bias - deg(-15)) < 1e-6, `half the 30° error learned per scan, got ${(tr.bias * 180) / Math.PI}`);
  assert.ok(tr.scale > 1.05 && tr.scale <= 1.4, `stride learned longer, got ${tr.scale}`);
  const t2 = new Tracker(); t2.anchor(0, 0, 0); for (let i = 0; i < 40; i++) t2.step(0); t2.anchor(28, 0, 60 * 60_000);
  assert.equal(t2.bias, 0, 'an hour between scans: too long ago to learn from');
});
