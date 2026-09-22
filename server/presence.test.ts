import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData } from '../shared/types.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'public/data/floor.json'), 'utf8')) as LevelData;

test('one virtual hall: every player sees the visitors and exhibitors near them, and is seen by them', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const s = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const make = async (cls: 'visitor' | 'exhibitor') => { const id = await s.game.createGuest(); await s.game.start(id, cls); return id; };
  const [a, b, host] = [await make('visitor'), await make('visitor'), await make('exhibitor')];
  const ping = (id: string, dx: number) => { now += 500; return s.game.ping(id, { x: 100 + dx, y: 60, h: 0 }, false); };
  await ping(a, 0); await ping(host, 3);
  const seen = (await ping(b, 1)).holograms;
  assert.deepEqual(seen.map((h) => h.cls).sort(), ['exhibitor', 'visitor'], 'the other visitor and the exhibitor');
  assert.ok(seen.every((h) => h.deck === false), 'nobody is placed by GPS');
  assert.equal((await ping(a, 0)).holograms.length, 2);
});

test('a jump across the hall is still refused and flagged; walking is not', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const stores = await testStores();
  const s = buildServices({ db: stores.db, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const id = await s.game.createGuest(); await s.game.start(id, 'visitor');
  const flags = async () => (await stores.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM flags WHERE player_id = ? AND kind = 'speed'", [id]))!.n;
  const ping = (x: number, y: number) => { now += 2000; return s.game.ping(id, { x, y, h: 0 }, false); };
  await ping(100, 60); await ping(106, 60);
  assert.equal(await flags(), 0);
  await ping(100, 400);
  assert.equal(await flags(), 1);
  assert.deepEqual(await s.game.presence.position(id, now), { x: 106, y: 60 }, 'the previous position is kept');
});
