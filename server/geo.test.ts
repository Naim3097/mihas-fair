import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData } from '../shared/types.js';
import { VENUE_DEFAULT } from '../shared/rules.js';
import { geoToPlan, type GeoCalPoint } from '../shared/geo.js';
import type { GeoView } from './venue.js';

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;
const R = 6_371_000, RAD = Math.PI / 180, { lat: lat0, lon: lon0 } = VENUE_DEFAULT;

async function rig() {
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test' });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: res.status, json: (await res.json()) as { ok: boolean; data: { points: GeoCalPoint[]; geo: GeoView }; error?: string } };
  };
  return { call };
}

/** A pretend building: the plan is the ground, turned 10° and shifted. Level-2 booths from the real floor plan. */
const rot = 10 * RAD;
function fixAt(b: { x: number; y: number }) {
  const x = b.x - 100, y = b.y - 60, e = Math.cos(-rot) * x - Math.sin(-rot) * y, n = Math.sin(-rot) * x + Math.cos(-rot) * y;
  return { lat: lat0 + n / (R * RAD), lon: lon0 + e / (R * RAD * Math.cos(lat0 * RAD)), acc: 9 };
}

test('the crew calibrates a level from booths; every phone can then place a GPS fix on the plan', async () => {
  const { call } = await rig();
  assert.equal((await call('POST', '/api/crew/geocal', { stationId: '6A17', ...fixAt({ x: 0, y: 0 }) })).status, 401, 'crew only');
  assert.equal((await call('POST', '/api/crew/login', { pin: '4321' })).status, 200);

  // three booths far apart on level 2: south-west, south-east and north corners
  const deck2 = level.booths.filter((b) => b.deck === 2);
  const far = [deck2.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a)), deck2.reduce((a, b) => (b.x - b.y > a.x - a.y ? b : a)), deck2.reduce((a, b) => (b.y > a.y ? b : a))];
  for (const b of far) {
    const r = await call('POST', '/api/crew/geocal', { stationId: b.id.toLowerCase(), ...fixAt(b) });
    assert.equal(r.status, 200, r.json.error);
  }

  const geo = (await call('GET', '/api/geo')).json.data as unknown as GeoView;
  assert.equal(geo.decks[2]?.kind, 'affine');
  assert.equal(geo.decks[1], undefined, 'levels nobody calibrated place nobody');
  const target = deck2[123]!, at = geoToPlan(geo, 2, fixAt(target).lat, fixAt(target).lon, 9)!;
  assert.ok(Math.hypot(at.x - target.x, at.y - target.y) < 0.1, JSON.stringify({ at, target }));

  const { points } = (await call('GET', '/api/crew/geocal')).json.data;
  assert.equal(points.length, 3);
  assert.deepEqual(points.map((p) => p.label), far.map((b) => b.id));
  const after = (await call('POST', '/api/crew/geocal/delete', { id: points[0]!.id })).json.data;
  assert.equal(after.points.length, 2);
  assert.equal(after.geo.decks[2]?.kind, 'similarity');
});

test('calibration refuses a booth that does not exist and a fix too vague to use', async () => {
  const { call } = await rig();
  await call('POST', '/api/crew/login', { pin: '4321' });
  assert.equal((await call('POST', '/api/crew/geocal', { stationId: 'NOPE', lat: lat0, lon: lon0, acc: 5 })).status, 404);
  const vague = await call('POST', '/api/crew/geocal', { stationId: '6A17', lat: lat0, lon: lon0, acc: 120 });
  assert.equal(vague.status, 400); assert.match(vague.json.error!, /only good to 120 m/);
});

test('on site, GPS wobble inside its accuracy circle is walking, not speeding', async () => {
  for (const presenceKind of ['memory', 'db'] as const) {
    let now = Date.UTC(2026, 8, 23, 3, 0, 0);
    const stores = await testStores(), presence = presenceKind === 'db' ? { presence: new (await import('./presence.js')).DbPresence(stores.db) } : {};
    const s = buildServices({ db: stores.db, ...presence, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
    const id = await s.game.createGuest(); await s.game.start(id, 'visitor');
    assert.equal((await s.venue.checkIn(id, { lat: lat0, lon: lon0, acc: 20 })).onsite, true);
    const flags = async () => (await stores.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM flags WHERE player_id = ? AND kind = 'speed'", [id]))!.n;
    const ping = (x: number, y: number, sigma: number) => { now += 2000; return s.game.ping(id, { x, y, h: 0, deck: true, sigma }, false); };

    assert.equal((await ping(100, 60, 20)).deck, true, 'on site, the avatar may follow the person');
    await ping(122, 60, 20); // 22 m in 2 s: impossible on foot, but both fixes are ±20 m
    assert.equal(await flags(), 0, `${presenceKind}: GPS wobble is not a speed flag`);
    await ping(22, 60, 3); // 100 m across the hall in 2 s with a tight fix: that really is too fast
    assert.equal(await flags(), 1, `${presenceKind}: a real jump is still flagged`);
  }
});

test('off every level is not "another level": no free jump there', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const stores = await testStores();
  const s = buildServices({ db: stores.db, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const id = await s.game.createGuest(); await s.game.start(id, 'visitor');
  await s.venue.checkIn(id, { lat: lat0, lon: lon0, acc: 20 });
  const ping = (x: number, y: number) => { now += 2000; return s.game.ping(id, { x, y, h: 0, deck: true, sigma: 2 }, false); };
  await ping(100, 60); await ping(100, 400);
  assert.equal((await stores.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM flags WHERE player_id = ? AND kind = 'speed'", [id]))!.n, 1);
});

test('switching from free roam to following GPS jumps straight to where the person is — and is not stuck there', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const stores = await testStores();
  const s = buildServices({ db: stores.db, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const id = await s.game.createGuest(); await s.game.start(id, 'visitor');
  await s.venue.checkIn(id, { lat: lat0, lon: lon0, acc: 20 });
  const ping = (x: number, y: number, deck: boolean) => { now += 2000; return s.game.ping(id, { x, y, h: 0, deck, sigma: deck ? 8 : 0 }, false); };
  await ping(35, 30, false); // standing at the Hall 8 entrance, free roam
  await ping(150, 60, true); // GPS: across the hall
  assert.deepEqual(await s.game.presence.position(id, now), { x: 150, y: 60 });
  await ping(152, 61, true);
  assert.deepEqual(await s.game.presence.position(id, now), { x: 152, y: 61 });
});

test('people meet people at MIHAS: players there see each other; a player from elsewhere sees nobody and is seen by nobody', async () => {
  let now = Date.UTC(2026, 8, 23, 3, 0, 0);
  const s = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const make = async () => { const id = await s.game.createGuest(); await s.game.start(id, 'visitor'); return id; };
  const [here1, here2, away] = [await make(), await make(), await make()];
  for (const id of [here1, here2]) assert.equal((await s.venue.checkIn(id, { lat: lat0, lon: lon0, acc: 20 })).onsite, true);
  const at = { x: 100, y: 60, h: 0 };
  const ping = (id: string, dx: number, deck: boolean) => { now += 500; return s.game.ping(id, { ...at, x: at.x + dx, deck, sigma: deck ? 4 : undefined }, false); };
  await ping(here1, 0, true); await ping(away, 2, false);
  const seenByHere2 = (await ping(here2, 1, true)).holograms;
  assert.equal(seenByHere2.length, 1, 'only the other person at MIHAS');
  assert.equal(seenByHere2[0]!.deck, true);
  assert.deepEqual((await ping(away, 2, false)).holograms, [], 'from elsewhere: alone');
  // a player at MIHAS whose GPS is not placing them yet (free roam) is not shown either
  assert.deepEqual((await ping(here1, 0, false)).holograms, []);
});
