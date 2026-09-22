// What every phone asks for every 20 s and what the big screen asks for every 4 s is read from the database once in
// a while, not every time: the drop's settings for 10 s (and fresh the moment the crew changes them), the totals for 5 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData } from '../shared/types.js';
import { ALL_FEATURES } from '../shared/rules.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/floor.json'), 'utf8')) as LevelData;

async function rig() {
  let now = Date.UTC(2026, 8, 23, 2, 5, 0);
  const s = buildServices({ ...(await testStores()), features: ALL_FEATURES, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const db = s.game.db, counts = { all: 0, get: 0 }, all = db.all.bind(db), get = db.get.bind(db);
  db.all = ((...a: Parameters<typeof all>) => { counts.all++; return all(...a); }) as typeof db.all;
  db.get = ((...a: Parameters<typeof get>) => { counts.get++; return get(...a); }) as typeof db.get;
  return { s, counts, tick: (ms: number) => { now += ms; } };
}

test("the drop's settings are read once per 10 s, and again the moment the crew sets a new one", async () => {
  const { s, counts, tick } = await rig();
  assert.equal(await s.ops.drop(null), null); assert.equal(await s.ops.drop(null), null); assert.equal(await s.ops.drop(null), null);
  assert.equal(counts.all, 1, 'one settings scan for three asks');
  tick(11_000); await s.ops.drop(null); assert.equal(counts.all, 2, 'read again after 10 s');
  const b = level.booths.find((x) => x.id !== level.hero.id)!;
  await s.ops.setDrop(b.id, 'Say hello', 120);
  const d = await s.ops.drop(null);
  assert.equal(d?.stationId, b.id, 'the new drop is seen at once');
  assert.equal(counts.all, 3);
});

test('the totals for the screen are counted once per 5 s', async () => {
  const { s, counts, tick } = await rig();
  await s.ops.totals(); const n = counts.get; assert.ok(n >= 6, 'six counts');
  await s.ops.totals(); await s.ops.totals(); assert.equal(counts.get, n, 'served from memory');
  tick(6000); await s.ops.totals(); assert.equal(counts.get, n * 2, 'counted again after 5 s');
});
