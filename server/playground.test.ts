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

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;

async function rig(daily = false) {
  let now = Date.UTC(2026, 8, 23, 2, 0, 0); // 10:00 MYT, show day 1
  const clock = { advance: (ms: number) => { now += ms; } };
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now, playgroundDaily: daily });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const call = async (method: string, path: string, body?: unknown, cookies = new Map<string, string>()) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: res.status, json: await res.json() };
  };
  /** One player's session: the cookie jar goes with every call. */
  const player = () => { const jar = new Map<string, string>(); return (method: string, path: string, body?: unknown) => call(method, path, body, jar); };
  return { player, clock };
}
const run = (token: string, o: Partial<{ gear: string; score: number; stars: number; comboMax: number; seconds: number; finished: boolean; partial: boolean }> = {}) => ({ token, gear: 'boots', score: 400, stars: 30, comboMax: 3, seconds: 45, finished: true, ...o });

test('a run needs its token, is believed within what the course can pay, credits its stars once even in two parts, and a finished one is the best', async () => {
  const { player, clock } = await rig(), me = player();
  let r = await me('GET', '/api/playground/me');
  assert.deepEqual(r.json.data, { stars: 0, unlocks: ['boots'], gear: 'boots', best: null, runsToday: 0 });
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
