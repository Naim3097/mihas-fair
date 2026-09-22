import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData } from '../shared/types.js';
import { CLASSES, classByKey, statsAt } from '../content/index.js';

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;

async function rig() {
  let now = Date.UTC(2026, 8, 19, 8, 0, 0);
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: unknown, cookies = jar) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!; const i = kv.indexOf('='); cookies.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: res.status, json: await res.json() };
  };
  // Hono percent-encodes cookie values; the signer wants the raw token.
  const playerId = async () => (await services.signer.verify(decodeURIComponent(jar.get('mx_s')!)))!.replace(/^p:/, '');
  return { call, services, jar, playerId, clock: { advance: (ms: number) => { now += ms; } } };
}

test('new journey: the six classes are offered, one is chosen, the sheet starts at level 1 with the class base stats', async () => {
  const { call } = await rig();
  let r = await call('GET', '/api/ceritera/classes');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.map((c: { key: string }) => c.key), CLASSES.map((c) => c.key));

  r = await call('GET', '/api/ceritera/character');
  assert.equal(r.json.data, null, 'no character until an avatar is chosen');

  assert.equal((await call('POST', '/api/ceritera/character', { classKey: 'astronaut' })).json.code, 'bad_class');
  r = await call('POST', '/api/ceritera/character', { classKey: 'ilmuwan' });
  assert.equal(r.status, 200);
  const c = r.json.data;
  assert.equal(c.classKey, 'ilmuwan'); assert.equal(c.name, 'Ilmuwan'); assert.equal(c.level, 1); assert.equal(c.xp, 0);
  assert.deepEqual(c.stats, classByKey('ilmuwan')!.base);
  assert.equal(c.xpIntoLevel, 0); assert.equal(c.xpToNext, 300);

  // choosing again is refused unless it is explicitly a new journey
  assert.equal((await call('POST', '/api/ceritera/character', { classKey: 'tabib' })).json.code, 'exists');
  r = await call('POST', '/api/ceritera/character', { classKey: 'tabib', replace: true, name: '  Aisyah  ' });
  assert.equal(r.json.data.classKey, 'tabib'); assert.equal(r.json.data.name, 'Aisyah'); assert.equal(r.json.data.xp, 0);
  assert.deepEqual((await call('GET', '/api/ceritera/character')).json.data.classKey, 'tabib');
});

test('xp: the ledger is the truth, level and stats follow the content curve', async () => {
  const { call, services, playerId } = await rig();
  await call('POST', '/api/ceritera/character', { classKey: 'ilmuwan' });
  const id = await playerId();
  await assert.rejects(services.ceritera.grant('nobody', 'read', 10), /avatar/);

  // eslint-disable-next-line prefer-const -- character is reassigned below, events is not
  let { character, events } = await services.ceritera.grant(id, 'read', 450, 'kitab-nusantara');
  assert.deepEqual(events, [{ action: 'read', xp: 450 }]);
  assert.equal(character.level, 2); assert.equal(character.xpIntoLevel, 150); assert.equal(character.xpToNext, 600);
  assert.deepEqual(character.stats, statsAt(classByKey('ilmuwan')!, 2));
  assert.deepEqual(character.stats, { knowledge: 3, observation: 2, endurance: 1, curiosity: 3 });

  ({ character } = await services.ceritera.grant(id, 'quest', 870));
  assert.equal(character.xp, 1320); assert.equal(character.level, 3); assert.equal(character.xpIntoLevel, 420); assert.equal(character.xpToNext, 1000, 'the character board: 420 / 1,000 at level 3');
  assert.deepEqual(character.stats, { knowledge: 4, observation: 2, endurance: 2, curiosity: 4 });

  const rows = (await services.game.db.all<{ action: string; xp: number }>('SELECT action, xp FROM ceritera_ledger WHERE player_id = ? ORDER BY id', [id])).map((r) => ({ action: r.action, xp: r.xp }));
  assert.deepEqual(rows, [{ action: 'begin', xp: 0 }, { action: 'read', xp: 450 }, { action: 'quest', xp: 870 }]);
  const cached = await services.game.db.get<{ xp: number }>('SELECT xp FROM characters WHERE player_id = ?', [id]);
  assert.equal(cached!.xp, rows.reduce((n, r) => n + r.xp, 0), 'the cached total equals the ledger');
});

test('a tampered session cookie gets a fresh guest, never someone else\'s character', async () => {
  const { call, jar } = await rig();
  await call('POST', '/api/ceritera/character', { classKey: 'pendekar' });
  const forged = new Map(jar); forged.set('mx_s', jar.get('mx_s')!.slice(0, -4) + 'zzzz');
  const r = await call('GET', '/api/ceritera/character', undefined, forged);
  assert.equal(r.json.data, null);
  assert.notEqual(forged.get('mx_s'), jar.get('mx_s'));
});

test('XP from the hall: whole numbers from 1 to 600 are paid into the ledger; anything else is refused', async () => {
  const { call } = await rig();
  await call('POST', '/api/ceritera/character', { classKey: 'pendekar' });
  assert.equal((await call('POST', '/api/ceritera/xp', { amount: 0 })).json.code, 'bad_xp');
  assert.equal((await call('POST', '/api/ceritera/xp', { amount: 1000 })).json.code, 'bad_xp');
  assert.equal((await call('POST', '/api/ceritera/xp', { amount: 'many' })).json.code, 'bad_xp');
  const r = await call('POST', '/api/ceritera/xp', { amount: 350, detail: 'dewan-ilmu' });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.xp, 350);
  assert.equal(r.json.data.level, 2);
  assert.equal(r.json.data.stats.endurance, 4, 'level 2 grew the Pendekar');
});
