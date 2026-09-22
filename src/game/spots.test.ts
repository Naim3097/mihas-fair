import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { LevelData } from '../../shared/types';
import { NavGrid } from './nav';
import { planSpots, resolveSpots, spotUrl } from './spots';
import { parseScan } from '../ui/common';

const level = JSON.parse(readFileSync('public/data/floor.json', 'utf8')) as LevelData, nav = new NavGrid(level);

test('posters: 20–30 spots across Halls 6–8, all on open floor, spread out, numbered the same every time', () => {
  const spots = planSpots(level, nav);
  assert.ok(spots.length >= 20 && spots.length <= 30, `${spots.length} spots`);
  assert.deepEqual([...new Set(spots.map((s) => s.hall))].sort(), [6, 7, 8]);
  for (const s of spots) assert.ok(nav.walkable(s.x, s.y), `${s.id} stands in an aisle`);
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 12, `${a.id} and ${b.id} are apart`);
  assert.deepEqual(planSpots(level, nav), spots, 'deterministic: printed posters keep meaning the same spot');
  assert.equal(spots[0]!.id, 'Y01'); assert.match(spots[0]!.where, /^Hall 8 · aisle crossing by \w+ \/ \w+$/);
});

test('posters: a crew move puts the spot in the aisle next to that booth; unknown booths are ignored', () => {
  const base = planSpots(level, nav), moved = resolveSpots(level, nav, base, { Y03: '7C17', Y04: 'NOPE' });
  const b = level.booths.find((x) => x.id === '7C17')!, y3 = moved.find((s) => s.id === 'Y03')!;
  assert.equal(y3.movedTo, '7C17'); assert.ok(Math.hypot(y3.x - b.x, y3.y - b.y) < 4 && nav.walkable(y3.x, y3.y));
  assert.deepEqual(moved.find((s) => s.id === 'Y04'), base.find((s) => s.id === 'Y04'));
});

test('posters: the QR is a plain game link that the scanner understands, from the app or the phone camera', () => {
  const url = spotUrl('https://mission.example', 'Y07');
  assert.deepEqual(parseScan(url), { kind: 'spot', id: 'Y07' });
  assert.deepEqual(parseScan('?w=y07'), { kind: 'spot', id: 'Y07' });
  assert.equal(parseScan('?w=Y7'), null);
});
