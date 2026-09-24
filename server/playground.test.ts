// The Playground's endpoints: a token per run, the run believed within what the course can pay and credited once
// even in two parts, gear bought with stars on the server, the boards, and the daily bridge behind its switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import { MAX_STARS, TOKEN_GAP_MS, TOKEN_TTL_MS, maxScore } from './playground.js';
import type { LevelData } from '../shared/types.js';
import type { Db } from './db/types.js';

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;

async function rig(daily = false, live = false) {
  let now = Date.UTC(2026, 8, 23, 2, 0, 0); // 10:00 MYT, show day 1
  const clock = { advance: (ms: number) => { now += ms; } };
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now, playgroundDaily: daily, live });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const call = async (method: string, path: string, body?: unknown, cookies = new Map<string, string>()) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: res.status, json: await res.json() };
  };
  /** One player's session: the cookie jar goes with every call. */
  const player = () => { const jar = new Map<string, string>(); return (method: string, path: string, body?: unknown) => call(method, path, body, jar); };
  return { player, clock, db: services.game.db };
}
/** A run's orbit and seed as the table holds them. */
const orbitOf = async (db: Db, token: string) => ({ ...(await db.get<{ orbit: number; seed: number | null }>('SELECT orbit, seed FROM playground_runs WHERE token = ?', [token]))! });
const run = (token: string, o: Partial<{ gear: string; score: number; stars: number; comboMax: number; seconds: number; finished: boolean; partial: boolean; orbit: number; seed: number }> = {}) => ({ token, gear: 'boots', score: 400, stars: 30, comboMax: 3, seconds: 45, finished: true, ...o });

test('a run needs its token, is believed within what the course can pay, credits its stars once even in two parts, and a finished one is the best', async () => {
  const { player, clock } = await rig(), me = player();
  let r = await me('GET', '/api/playground/me');
  assert.deepEqual(r.json.data, { stars: 0, unlocks: ['boots'], gear: 'boots', best: null, best2: null, runsToday: 0 });
  assert.equal((await me('POST', '/api/playground/run', run('nope'))).json.code, 'token');
  const { token } = (await me('POST', '/api/playground/start', {})).json.data; assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal((await me('POST', '/api/playground/start', {})).json.code, 'soon', 'not two within the gap');
  assert.equal((await me('POST', '/api/playground/run', run(token, { gear: 'skates' }))).json.code, 'gear');
  assert.equal((await me('POST', '/api/playground/run', run(token, { stars: MAX_STARS + 1 }))).json.code, 'bad_run');
  assert.equal((await me('POST', '/api/playground/run', run(token, { stars: 40, score: maxScore(40) + 1 }))).json.code, 'bad_run');
  assert.equal((await me('POST', '/api/playground/run', run(token, { seconds: 12 }))).json.code, 'bad_run', 'too fast to have crossed the course');
  assert.equal((await me('POST', '/api/playground/run', run(token, { score: -1 }))).json.code, 'bad_run');
  // a tab going away sends the run so far; the finish sends the whole run: the stars are credited once
  r = await me('POST', '/api/playground/run', run(token, { score: 200, stars: 20, seconds: 15, finished: false, partial: true }));
  assert.equal(r.json.data.stars, 20); assert.equal(r.json.data.best, null); assert.equal(r.json.data.newBest, false);
  r = await me('POST', '/api/playground/run', run(token, { score: 1500, stars: 60, comboMax: 4, seconds: 40 }));
  assert.equal(r.json.data.stars, 60, 'sixty in all, not eighty'); assert.equal(r.json.data.best.score, 1500); assert.equal(r.json.data.newBest, true); assert.equal(r.json.data.runsToday, 1);
  assert.deepEqual(r.json.events, [], 'the bridge is off');
  assert.equal((await me('POST', '/api/playground/run', run(token))).json.code, 'token', 'a token is used once');
  clock.advance(TOKEN_GAP_MS + 1);
  const t2 = (await me('POST', '/api/playground/start', {})).json.data.token;
  r = await me('POST', '/api/playground/run', run(t2, { score: 900, stars: 25, finished: false }));
  assert.equal(r.json.data.stars, 85, 'an unfinished run still banks its stars'); assert.equal(r.json.data.best.score, 1500, 'and is no best');
  clock.advance(TOKEN_GAP_MS + 1);
  const t3 = (await me('POST', '/api/playground/start', {})).json.data.token;
  clock.advance(TOKEN_TTL_MS + 1);
  assert.equal((await me('POST', '/api/playground/run', run(t3))).json.code, 'token', 'stale');
  assert.equal((await player()('POST', '/api/playground/run', run(t2))).json.code, 'token', 'another player cannot use it');
});

test('gear is bought with stars on the server: refused when short, kept once bought, and the run may then use it', async () => {
  const { player, clock } = await rig(), me = player();
  assert.equal((await me('POST', '/api/playground/unlock', { gear: 'boots' })).json.code, 'gear');
  assert.equal((await me('POST', '/api/playground/unlock', { gear: 'skates' })).json.code, 'short');
  const { token } = (await me('POST', '/api/playground/start', {})).json.data;
  await me('POST', '/api/playground/run', run(token, { stars: 120, score: 1200 }));
  let r = await me('POST', '/api/playground/unlock', { gear: 'skates' });
  assert.equal(r.json.data.stars, 20); assert.deepEqual(r.json.data.unlocks, ['boots', 'skates']); assert.equal(r.json.data.gear, 'skates');
  r = await me('POST', '/api/playground/unlock', { gear: 'skates' }); assert.equal(r.json.data.stars, 20, 'bought once');
  assert.equal((await me('POST', '/api/playground/unlock', { gear: 'jetpack' })).json.code, 'short');
  clock.advance(TOKEN_GAP_MS + 1);
  const t2 = (await me('POST', '/api/playground/start', {})).json.data.token;
  r = await me('POST', '/api/playground/run', run(t2, { gear: 'skates', stars: 10, score: 100 }));
  assert.equal(r.json.data.gear, 'skates'); assert.equal(r.json.data.stars, 30);
  assert.deepEqual((await me('GET', '/api/playground/me')).json.data.unlocks, ['boots', 'skates']);
  // the kit chosen is kept, and only what is owned can be chosen
  assert.equal((await me('POST', '/api/playground/gear', { gear: 'boots' })).json.data.gear, 'boots');
  assert.equal((await me('POST', '/api/playground/gear', { gear: 'jetpack' })).json.code, 'gear');
  assert.equal((await me('POST', '/api/playground/gear', { gear: 'skates' })).json.data.gear, 'skates');
  assert.equal((await me('GET', '/api/playground/me')).json.data.gear, 'skates');
});

test('the boards: each player\'s best finished run, today and all-time, the viewer marked, cached for fifteen seconds', async () => {
  const { player, clock } = await rig(), a = player(), b = player();
  const play = async (p: (m: string, u: string, b?: unknown) => Promise<{ json: { data: { token: string } } }>, score: number) => { const { token } = (await p('POST', '/api/playground/start', {})).json.data; await p('POST', '/api/playground/run', run(token, { score, stars: Math.min(MAX_STARS, Math.ceil(score / 40)) })); clock.advance(TOKEN_GAP_MS + 1); };
  await play(a, 800); await play(a, 1200); await play(b, 1000);
  let rows = (await a('GET', '/api/playground/board?range=today')).json.data;
  assert.deepEqual(rows.map((r: { name: string; score: number; you?: boolean }) => [r.score, r.you ?? false]), [[1200, true], [1000, false]], 'one line per player, their best');
  assert.match(rows[0].name, /^Guest \d+$/);
  const { token } = (await b('POST', '/api/playground/start', {})).json.data; await b('POST', '/api/playground/run', run(token, { score: 2000, stars: 50 }));
  assert.equal((await b('GET', '/api/playground/board?range=today')).json.data[0].score, 1200, 'the cache still stands');
  clock.advance(BOARD_CACHE_MS);
  rows = (await b('GET', '/api/playground/board?range=today')).json.data;
  assert.deepEqual(rows.map((r: { score: number; you?: boolean }) => [r.score, r.you ?? false]), [[2000, true], [1200, false]]);
  clock.advance(24 * 3600_000);
  assert.deepEqual((await a('GET', '/api/playground/board?range=today')).json.data, [], 'a new day');
  assert.equal((await a('GET', '/api/playground/board?range=all')).json.data.length, 2, 'all-time keeps them');
});
const BOARD_CACHE_MS = 15_001;

test('the daily bridge, switched on: the first finished run of the day pays the fair\'s points, once a day, into the ledger', async () => {
  const { player, clock } = await rig(true), me = player();
  const finish = async (score: number) => { const { token } = (await me('POST', '/api/playground/start', {})).json.data; const r = await me('POST', '/api/playground/run', run(token, { score })); clock.advance(TOKEN_GAP_MS + 1); return r.json; };
  let j = await finish(500);
  assert.deepEqual(j.events, [{ action: 'playground_daily', xp: 50, note: 'The day\'s first run through the gate' }]); assert.equal(j.me.xp, 50, 'on the fair\'s score');
  j = await finish(700); assert.deepEqual(j.events, [], 'once a day');
  const { token } = (await me('POST', '/api/playground/start', {})).json.data;
  assert.deepEqual((await me('POST', '/api/playground/run', run(token, { finished: false }))).json.events, [], 'an unfinished run pays nothing'); clock.advance(TOKEN_GAP_MS + 1);
  clock.advance(24 * 3600_000);
  j = await finish(600); assert.equal(j.events.length, 1, 'the next day pays again'); assert.equal(j.me.xp, 100);
});

test('Orbit 2: open once through the gate on Orbit 1 while its switch is on; its own best, its own boards, its seed kept; claimed anywhere else, the run is Orbit 1\'s and pays all the same', async () => {
  const { player, clock, db } = await rig(), me = player();
  const go = async (o: Parameters<typeof run>[1]) => { const { token } = (await me('POST', '/api/playground/start', {})).json.data; const r = await me('POST', '/api/playground/run', run(token, o)); clock.advance(TOKEN_GAP_MS + 1); return { token, d: r.json.data }; };
  // not yet through the gate on Orbit 1: an Orbit 2 run is recorded as Orbit 1's, and pays
  let { token, d } = await go({ orbit: 2, seed: 77, score: 700, stars: 30 });
  assert.equal(d.best.score, 700); assert.equal(d.best2, null); assert.equal(d.stars, 30); assert.equal(d.newBest, true);
  assert.deepEqual(await orbitOf(db, token), { orbit: 1, seed: null });
  // open now: Orbit 2 keeps its own best, and its seed
  ({ token, d } = await go({ orbit: 2, seed: 4_000_000_000, score: 500, stars: 20 }));
  assert.equal(d.best.score, 700, 'Orbit 1\'s best stands'); assert.equal(d.best2.score, 500); assert.equal(d.newBest, true, 'the first through the gate on Orbit 2 is its best'); assert.equal(d.stars, 50);
  assert.deepEqual(await orbitOf(db, token), { orbit: 2, seed: 4_000_000_000 });
  ({ d } = await go({ orbit: 2, seed: 99, score: 400, stars: 10 })); assert.equal(d.newBest, false); assert.equal(d.best2.score, 500);
  ({ d } = await go({ orbit: 1, score: 650 })); assert.equal(d.newBest, false, 'short of Orbit 1\'s best, whatever Orbit 2\'s is');
  ({ token } = await go({ orbit: 2, seed: -3, score: 300 })); assert.deepEqual(await orbitOf(db, token), { orbit: 2, seed: null }, 'a seed that is no seed is not kept');
  // each orbit its own boards
  const scores = async (q: string) => (await me('GET', `/api/playground/board?range=today${q}`)).json.data.map((r: { score: number }) => r.score);
  assert.deepEqual(await scores(''), [700]); assert.deepEqual(await scores('&orbit=2'), [500]); assert.deepEqual(await scores('&orbit=9'), [700], 'anything else is Orbit 1');
  assert.equal((await me('GET', '/api/playground/me')).json.data.best2.score, 500);
});

test('Orbit 2 stays shut while its switch is off (the show\'s own site until the crew turns it on): every run is Orbit 1\'s', async () => {
  const { player, clock } = await rig(false, true), me = player();
  for (const score of [600, 800]) {
    const { token } = (await me('POST', '/api/playground/start', {})).json.data;
    const d = (await me('POST', '/api/playground/run', run(token, { orbit: 2, seed: 5, score }))).json.data; clock.advance(TOKEN_GAP_MS + 1);
    assert.equal(d.best2, null); assert.equal(d.best.score, score);
  }
  assert.deepEqual((await me('GET', '/api/playground/board?range=all&orbit=2')).json.data, []);
});

test('the runs table gains its orbit and seed on a database made before them; the runs it had are Orbit 1\'s', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { openNodeDb } = await import('./db/sqlite-node.js'); const { SCHEMA } = await import('./db/schema.js');
  const file = join(tmpdir(), `mx-upgrade-${crypto.randomUUID()}.db`), old = new DatabaseSync(file);
  old.exec(`CREATE TABLE playground_runs (token TEXT PRIMARY KEY, player_id TEXT NOT NULL, gear TEXT NOT NULL, score INTEGER NOT NULL, stars INTEGER NOT NULL,
    combo_max INTEGER NOT NULL, seconds INTEGER NOT NULL, finished INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
  old.exec("INSERT INTO playground_runs VALUES ('t1', 'p1', 'boots', 900, 40, 3, 60, 1, 5)");
  old.close();
  const db = openNodeDb(file, SCHEMA);
  assert.deepEqual(await orbitOf(db, 't1'), { orbit: 1, seed: null });
  const again = openNodeDb(file, SCHEMA); // a second open adds nothing and fails nothing
  assert.equal((await again.all('SELECT name FROM pragma_table_info(?) WHERE name IN (?, ?)', ['playground_runs', 'orbit', 'seed'])).length, 2);
});
