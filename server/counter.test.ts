// The exhibitor's dashboard keeps its host standing at the booth in the game, and stepping back into the game from
// there is not a teleport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { Hologram, HostStation, LevelData } from '../shared/types.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/floor.json'), 'utf8')) as LevelData;

async function rig() {
  let now = Date.UTC(2026, 8, 23, 2, 0, 0);
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const user = () => {
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      return { status: res.status, json: await res.json() };
    };
    const card = (name: string, role: 'visitor' | 'exhibitor' = 'visitor') => call('POST', '/api/start', { role }).then(() => call('POST', '/api/passport', { name, company: 'UOB', role: 'Staff', phone: '+60123456789', email: `${name.toLowerCase()}@example.com`, showContact: false, consentMarketing: false, consentNotice: true }));
    const see = async (x: number, y: number, spawn = false) => (await call('POST', '/api/presence', { x, y, h: 0, spawn })).json.data.holograms as Hologram[];
    return { call, card, see };
  };
  return { user, services, tick: (ms = 3_000) => { now += ms; } };
}

test('the dashboard stands its host behind the counter; a visitor sees them there, with the company; the game takes them back without a teleport flag', async () => {
  const r = await rig(), roy = r.user(), v = r.user();
  await roy.card('Roy', 'exhibitor');
  assert.equal((await roy.call('POST', '/api/station/claim', { stationId: '8H17B', company: 'UOB', offer: '', link: '', color: 0 })).status, 200);
  await v.card('Zafran');
  const gate = level.spawns.short;
  await roy.see(gate.x, gate.y, true); // Roy walked in by the Hall 8 gate
  r.tick();
  let seen = (await v.see(gate.x + 2, gate.y, true)).find((h) => h.callsign === 'Roy');
  assert.ok(seen && Math.abs(seen.x - gate.x) < 0.01, 'Roy is at the gate');

  const at = (await roy.call('POST', '/api/host/presence', { station: '8H17B' })).json.data as { x: number; y: number; h: number };
  const booth = level.booths.find((b) => b.id === '8H17B')!;
  assert.ok(Math.hypot(at.x - booth.x, at.y - booth.y) < 2.2, `the spot is inside the 3 m cell, got ${at.x},${at.y} for ${booth.x},${booth.y}`);
  r.tick();
  seen = (await v.see(gate.x + 2, gate.y)).find((h) => h.callsign === 'Roy');
  assert.ok(seen, 'Roy is still in the hall');
  assert.equal(`${seen.x},${seen.y}`, `${at.x},${at.y}`, 'standing at the counter, 15 m from the gate in one hop: a placement, not a run');
  assert.equal(seen.company, 'UOB', 'labelled with the company');
  const mine = (await roy.call('GET', '/api/host/stations')).json.data as HostStation[];
  assert.equal(mine[0]?.hosted, true, 'the booth counts him as at the counter');

  r.tick(); // 3 s later the game tab is in front again, pinging from the gate: far too fast for a walk, but he was at his own counter
  await roy.see(gate.x, gate.y);
  seen = (await v.see(gate.x + 2, gate.y)).find((h) => h.callsign === 'Roy');
  assert.ok(seen && Math.abs(seen.x - gate.x) < 0.01, `Roy is back at the gate, not stuck at the counter: ${seen?.x},${seen?.y}`);

  r.tick(); // a plain teleport across the hall is still refused
  await roy.see(gate.x + 60, gate.y + 30);
  seen = (await v.see(gate.x + 2, gate.y)).find((h) => h.callsign === 'Roy');
  assert.ok(seen && Math.abs(seen.x - gate.x) < 0.01, 'the jump from the gate is refused');

  assert.equal((await v.call('POST', '/api/host/presence', { station: '8H17B' })).json.code, 'not_host', 'only the booth team can stand there');
});
