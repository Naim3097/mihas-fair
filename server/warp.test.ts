// Warp on the server: bought with stars in the Playground and never worn; while its switch is on, a ride to a booth on
// Mission X (or the X) that saves a real walk, lands beside the booth, rests a minute between two, and puts the body
// there itself, so the fair's speed check sees no jump; a ping from the old place, sent just before, is forgiven, and
// a jump without a warp is still flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import { MAX_STARS, TOKEN_GAP_MS, maxScore } from './playground.js';
import { ITEM_PRICE, WARP_COOLDOWN_MS, WARP_GRACE_MS, WARP_MIN_M } from '../shared/playground.js';
import type { LevelData } from '../shared/types.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'public/data/floor.json'), 'utf8')) as LevelData;
const booth = (id: string) => level.booths.find((b) => b.id === id)!;

async function rig() {
  let now = Date.UTC(2026, 8, 24, 3, 0, 0);
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const user = () => {
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      return { status: res.status, json: await res.json() };
    };
    const register = async (name: string, role: 'visitor' | 'exhibitor') => {
      await call('POST', '/api/start', { role });
      const r = await call('POST', '/api/passport', { name, company: `${name} Co`, role: 'Owner', phone: '+60123456789', email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, showContact: false, consentMarketing: false, consentNotice: true });
      assert.equal(r.status, 200, r.json?.error);
      return (await services.game.db.get<{ player_id: string }>('SELECT player_id FROM passports WHERE name = ?', [name]))!.player_id;
    };
    return { call, register };
  };
  const crew = user(); await crew.call('POST', '/api/crew/login', { pin: '4321' });
  return { user, crew, services, tick: (ms: number) => { now += ms; }, now: () => now };
}

test('Warp: bought with stars and never worn; to a booth on Mission X or the X, beside it, a real walk away, a minute between two; the body put there by the server', async () => {
  const r = await rig(), v = r.user(), id = await v.register('Warp Walker', 'visitor');
  for (const [bid, company] of [['7C17', 'Kedai Kopi'], ['6C08', 'Roti Canai']] as const) {
    const ex = r.user(); await ex.register(`${company} Owner`, 'exhibitor');
    assert.equal((await ex.call('POST', '/api/station/claim', { stationId: bid, company, offer: '', link: '', color: 0x17b6d6 })).status, 200);
  }
  const near = (id: string, dx = 2, dy = 0) => ({ stationId: id, x: booth(id).x + dx, y: booth(id).y + dy, h: 0 });
  const warp = async (input: unknown) => (await v.call('POST', '/api/warp', input)).json;
  const ping = async (x: number, y: number) => v.call('POST', '/api/presence', { x, y, h: 0 });
  const place = async () => r.services.game.presence.position(id, r.now());

  assert.equal((await warp(near('7C17'))).code, 'not_owned', 'not before it is bought');
  // 400 stars from two runs, then Warp from the Playground: the kit worn stays the kit worn
  for (const stars of [200, 200]) { const { token } = (await v.call('POST', '/api/playground/start', {})).json.data; await v.call('POST', '/api/playground/run', { token, gear: 'boots', score: maxScore(stars), stars: Math.min(MAX_STARS, stars), comboMax: 4, seconds: 60, finished: false }); r.tick(TOKEN_GAP_MS + 1); }
  let me = (await v.call('POST', '/api/playground/unlock', { gear: 'warp' })).json.data;
  assert.deepEqual(me.unlocks, ['boots', 'warp']); assert.equal(me.stars, 400 - ITEM_PRICE.warp); assert.equal(me.gear, 'boots', 'Warp is never worn');
  assert.equal((await v.call('POST', '/api/playground/gear', { gear: 'warp' })).json.code, 'gear', 'nor chosen as a kit');
  const { token } = (await v.call('POST', '/api/playground/start', {})).json.data;
  assert.equal((await v.call('POST', '/api/playground/run', { token, gear: 'warp', score: 10, stars: 1, comboMax: 1, seconds: 30, finished: false })).json.code, 'gear', 'nor run in');

  assert.equal((await warp(near('7C17'))).code, 'not_here', 'the body must be in the hall');
  const start = { x: booth('7C17').x - 60, y: booth('7C17').y }; await ping(start.x, start.y);
  assert.equal((await warp({ stationId: '9Z99', x: start.x, y: start.y })).code, 'bad_booth');
  assert.equal((await warp(near('7C19'))).code, 'not_hosted', 'only the booths on Mission X');
  assert.equal((await warp(near('7C17', 6, 0))).code, 'bad_pos', 'beside the booth, within stamping reach');
  assert.equal((await warp({ ...near('7C17'), x: 'here' })).code, 'bad_pos');
  await r.crew.call('POST', '/api/crew/flags', { flag: 'warp', on: false });
  assert.equal((await warp(near('7C17'))).code, 'paused', 'the crew\'s switch');
  await r.crew.call('POST', '/api/crew/flags', { flag: 'warp', on: true });

  const res = await warp(near('7C17'));
  assert.equal(res.ok, true, res.error); assert.equal(res.data.nextAt - res.data.at, WARP_COOLDOWN_MS);
  assert.deepEqual(await place(), { x: booth('7C17').x + 2, y: booth('7C17').y }, 'the server put the body there');
  // a ping sent from the old place just before the warp, arriving after it: forgiven, and the body stays at the booth
  r.tick(1500); await ping(start.x, start.y);
  assert.deepEqual(await place(), { x: booth('7C17').x + 2, y: booth('7C17').y });
  assert.equal((await r.services.game.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM flags WHERE player_id = ? AND kind = 'speed'", [id]))!.n, 0, 'no speed flag for a warp');
  r.tick(1500); assert.equal((await ping(booth('7C17').x + 2.5, booth('7C17').y)).status, 200, 'walking on from the arrival');

  assert.equal((await warp(near('6C08'))).code, 'soon', 'a minute between two');
  assert.equal((await warp(near('7E17', -2.7, 0))).code, 'near', `nearer than ${WARP_MIN_M} m (the X is 26 m on): walk there`);
  r.tick(WARP_COOLDOWN_MS); await ping(booth('7C17').x + 2.5, booth('7C17').y);
  const far = await warp(near('6C08')); assert.equal(far.ok, true, far.error);
  r.tick(WARP_COOLDOWN_MS); await ping(booth('6C08').x + 2, booth('6C08').y);
  const home = await warp(near('7E17', -2.7, 0)); // the X, at Booth 7E17: on Mission X, always
  assert.equal(home.ok, true, home.error);
  // a jump that no warp explains is still a jump
  r.tick(WARP_GRACE_MS + 1000); await ping(booth('7E17').x - 2.7, booth('7E17').y); r.tick(1500); await ping(start.x, start.y);
  assert.equal((await r.services.game.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM flags WHERE player_id = ? AND kind = 'speed'", [id]))!.n, 1, 'flagged');
  me = (await v.call('GET', '/api/playground/me')).json.data; assert.ok(me.unlocks.includes('warp'), 'kept');
  assert.equal((await r.services.game.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM warps WHERE player_id = ?', [id]))!.n, 3, 'each warp logged');
});

test('Warp is off on the show\'s own site until the crew turns it on: not sold, not ridden', async () => {
  const { buildServices: build } = await import('./wire.js');
  const services = build({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', live: true });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const post = async (path: string, body: unknown) => (await (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()).code;
  assert.equal(await post('/api/warp', { stationId: '7E17', x: 96.2, y: 53.1 }), 'paused');
  assert.equal(await post('/api/playground/unlock', { gear: 'warp' }), 'paused', 'and not sold: nobody pays for what they cannot use');
});
