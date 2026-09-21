import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, geoToPlan, mapScale, type GeoCalPoint } from './geo.js';

const lat0 = 3.17811, lon0 = 101.66864, R = 6_371_000, RAD = Math.PI / 180;
/** The inverse of toLocal: a ground position in metres back to a GPS fix. */
const fix = (e: number, n: number) => ({ lat: lat0 + n / (R * RAD), lon: lon0 + e / (R * RAD * Math.cos(lat0 * RAD)) });

/** A made-up building: turned 23°, level 2 drawn 8.3 % taller, each level at its own place in plan space. */
const TRUE = { rot: 23 * RAD, stretch: 1.083 };
function truth(deck: number, e: number, n: number) {
  const x = Math.cos(TRUE.rot) * e - Math.sin(TRUE.rot) * n, y = Math.sin(TRUE.rot) * e + Math.cos(TRUE.rot) * n;
  const off = { 1: [90, -70], 2: [100, 70], 3: [110, 200] }[deck]!;
  return { x: x + off[0]!, y: (deck === 2 ? y * TRUE.stretch : y) + off[1]! };
}
const point = (id: number, deck: number, e: number, n: number): GeoCalPoint => ({ id, deck, ...truth(deck, e, n), ...fix(e, n), acc: 8 });

test('three spread points fit a level exactly — rotation, offset and the level-2 stretch', () => {
  const cal = calibrate(lat0, lon0, [point(1, 2, -60, -30), point(2, 2, 70, -25), point(3, 2, 10, 40), point(4, 2, -20, 10)]);
  const m = cal.decks[2]!;
  assert.equal(m.kind, 'affine');
  assert.ok(m.rms < 0.01, `rms ${m.rms}`);
  for (const [e, n] of [[0, 0], [50, 30], [-45, -20]] as const) {
    const got = geoToPlan(cal, 2, fix(e, n).lat, fix(e, n).lon, 10)!, want = truth(2, e, n);
    assert.ok(Math.hypot(got.x - want.x, got.y - want.y) < 0.05, `${e},${n}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
  }
});

test('points on one line cannot fix a stretch: two-point similarity instead', () => {
  const cal = calibrate(lat0, lon0, [point(1, 1, -50, 0), point(2, 1, 0, 0.5), point(3, 1, 50, 1)]);
  assert.equal(cal.decks[1]!.kind, 'similarity');
  const got = geoToPlan(cal, 1, fix(20, 0).lat, fix(20, 0).lon, 10)!, want = truth(1, 20, 0);
  assert.ok(Math.hypot(got.x - want.x, got.y - want.y) < 0.5);
  assert.ok(Math.abs(mapScale(cal.decks[1]!) - 1) < 0.01);
});

test('a level with one point borrows the shape of the best level and fits only its offset', () => {
  const cal = calibrate(lat0, lon0, [point(1, 1, -60, -30), point(2, 1, 70, -25), point(3, 1, 10, 40), point(4, 3, 5, 5)]);
  assert.equal(cal.decks[3]!.kind, 'borrowed');
  const got = geoToPlan(cal, 3, fix(40, -10).lat, fix(40, -10).lon, 10)!, want = truth(3, 40, -10);
  assert.ok(Math.hypot(got.x - want.x, got.y - want.y) < 0.05);
});

test('nothing to go on: a level with no points, or two fixes a metre apart, is not placed at all', () => {
  const cal = calibrate(lat0, lon0, [point(1, 2, 0, 0), point(2, 2, 1, 0)]);
  assert.equal(cal.decks[2], undefined);
  assert.equal(geoToPlan(cal, 1, lat0, lon0, 10), null);
});

test('GPS accuracy becomes a plan-sized circle', () => {
  const cal = calibrate(lat0, lon0, [point(1, 1, -60, -30), point(2, 1, 70, -25), point(3, 1, 10, 40)]);
  assert.ok(Math.abs(geoToPlan(cal, 1, lat0, lon0, 20)!.sigma - 20) < 0.1);
});
