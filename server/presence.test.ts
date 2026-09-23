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

test('a phone that goes quiet leaves its avatar standing where it stopped for the show day, then it is gone', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const s = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const make = async (cls: 'visitor' | 'exhibitor') => { const id = await s.game.createGuest(); await s.game.start(id, cls); return id; };
  const [walker, watcher] = [await make('visitor'), await make('visitor')];
  await s.game.ping(walker, { x: 100, y: 60, h: 1, pose: 'jump' }, false); // mid-jump, then the phone locks
  now += 20 * 60_000;
  let r = await s.game.ping(watcher, { x: 104, y: 60, h: 0 }, false);
  assert.equal(r.holograms.length, 1, 'twenty minutes later the walker is still there');
  assert.deepEqual([r.holograms[0]!.x, r.holograms[0]!.y, r.holograms[0]!.pose], [100, 60, undefined], 'standing where they stopped, not frozen mid-jump');
  assert.equal(r.online, 2, 'and counted as in the expo');
  now += 5 * 3600_000;
  r = await s.game.ping(watcher, { x: 104, y: 60, h: 0 }, false);
  assert.equal(r.holograms.length, 1, 'five hours on, still there');
  now += 8 * 3600_000;
  r = await s.game.ping(watcher, { x: 104, y: 60, h: 0 }, false);
  assert.equal(r.holograms.length, 0, 'the next day the hall is clear');
  assert.equal(r.online, 1);
  // coming back after hours: the first ping lands wherever they are, no speed check against a stale spot
  now += 1000;
  const back = await s.game.ping(walker, { x: 160, y: 90, h: 0 }, false);
  assert.ok(back.deck === false && (await s.game.presence.position(walker, now))?.x === 160, 'accepted');
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
