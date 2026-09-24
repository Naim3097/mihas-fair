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

test('a kit is seen on the body only when it was paid for; altitude only on a jetpack, never above the ceiling; a quiet flyer lands', async () => {
  let now = Date.UTC(2026, 8, 24, 3, 0, 0);
  const s = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const make = async () => { const id = await s.game.createGuest(); await s.game.start(id, 'visitor'); return id; };
  const [flyer, watcher] = [await make(), await make()];
  const see = async () => { now += 500; return (await s.game.ping(watcher, { x: 100, y: 62, h: 0 }, false)).holograms.find((h) => flyer.startsWith(h.id))!; };
  // nothing owned: the claim is stripped, the body is on the floor, 'fly' becomes a jump
  now += 500; await s.game.ping(flyer, { x: 100, y: 60, h: 0, kit: 'jetpack', z: 3, pose: 'fly' }, false);
  let h = await see();
  assert.equal(h.kit, undefined, 'a kit not paid for is not worn'); assert.equal(h.z, 0); assert.equal(h.pose, 'jump');
  // bought in the Playground (the ownership cache is half a minute old by then)
  await s.game.db.run("INSERT INTO playground_state (player_id, stars, unlocks, gear, updated_at) VALUES (?,?,?,?,?)", [flyer, 0, 'boots,skates,jetpack', 'jetpack', now]);
  now += 31_000;
  await s.game.ping(flyer, { x: 100, y: 60, h: 0, kit: 'jetpack', z: 3.04, pose: 'fly' }, false);
  h = await see();
  assert.equal(h.kit, 'jetpack'); assert.equal(h.z, 3); assert.equal(h.pose, 'fly', 'in the air on a jetpack, for everyone to see');
  now += 500; await s.game.ping(flyer, { x: 100, y: 60, h: 0, kit: 'jetpack', z: 50, pose: 'fly' }, false);
  assert.equal((await see()).z, 7, 'clamped to the ceiling');
  now += 500; await s.game.ping(flyer, { x: 100, y: 60, h: 0, kit: 'skates', z: 2, pose: 'fly' }, false);
  h = await see();
  assert.equal(h.kit, 'skates'); assert.equal(h.z, 0, 'skates stay on the floor'); assert.equal(h.pose, 'jump', "'fly' is the jetpack's");
  now += 500; await s.game.ping(flyer, { x: 100, y: 60, h: 0, kit: 'jetpack', z: 4, pose: 'fly' }, false);
  now += 20_000; // the phone goes quiet mid-flight
  h = await see();
  assert.equal(h.kit, 'jetpack', 'still wearing it'); assert.equal(h.z, 0, 'but on the floor: nobody hangs in the air'); assert.equal(h.pose, undefined);
});

test('the presence table gains its kit and altitude columns on a database made before them', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { openNodeDb } = await import('./db/sqlite-node.js'); const { SCHEMA } = await import('./db/schema.js');
  const file = join(tmpdir(), `mx-upgrade-${crypto.randomUUID()}.db`);
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE presence (player_id TEXT PRIMARY KEY, callsign TEXT NOT NULL, cls TEXT, pose TEXT NOT NULL DEFAULT '', av TEXT NOT NULL,
    x REAL NOT NULL, y REAL NOT NULL, h REAL NOT NULL, deck INTEGER NOT NULL DEFAULT 0, sigma REAL NOT NULL DEFAULT 0, t INTEGER NOT NULL)`);
  old.exec("INSERT INTO presence (player_id, callsign, av, x, y, h, t) VALUES ('p1', 'Old', '', 1, 2, 0, 5)");
  old.close();
  const db = openNodeDb(file, SCHEMA);
  const r = (await db.get<{ kit: string; z: number }>('SELECT kit, z FROM presence WHERE player_id = ?', ['p1']))!;
  assert.equal(r.kit, ''); assert.equal(r.z, 0); // the old row has the new columns, defaulted
  const again = openNodeDb(file, SCHEMA); // a second open adds nothing and fails nothing
  assert.equal((await again.all('SELECT name FROM pragma_table_info(?) WHERE name IN (?, ?)', ['presence', 'kit', 'z'])).length, 2);
});
