import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { BoardRow, BoothScan, BoothTeamView, HostStation, LevelData, Me } from '../shared/types.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/floor.json'), 'utf8')) as LevelData;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
    const card = (name: string, role: 'visitor' | 'exhibitor' = 'visitor') => call('POST', '/api/start', { role }).then(() => call('POST', '/api/passport', { name, company: 'Kedai Kopi', role: 'Staff', phone: '+60123456789', email: `${name.toLowerCase().replace(/\W/g, '')}@example.com`, showContact: false, consentMarketing: false, consentNotice: true }));
    return { call, card, me: async () => (await call('GET', '/api/me')).json.me as Me };
  };
  const crew = user(); await crew.call('POST', '/api/crew/login', { pin: '4321' });
  const beacon = async (id: string) => new URL(((await crew.call('GET', '/api/crew/beacons')).json.data as { id: string; url: string }[]).find((b) => b.id === id)!.url).searchParams.get('b')!;
  return { user, crew, beacon, services, tick: (ms = 10_000) => { now += ms; } };
}

test('a company works its booth as a team: colleagues join with a link, each on their own phone', async () => {
  const { user, crew, beacon, services, tick } = await rig();
  const hana = user(); await hana.card('Hana', 'exhibitor');
  assert.equal((await hana.call('GET', '/api/host/team')).status, 404, 'a team needs a booth');
  await hana.call('POST', '/api/station/claim', { stationId: '7C17', company: 'Kedai Kopi', offer: '', link: '', color: 0 });
  await crew.call('POST', '/api/crew/stations/status', { stationId: '7C17', status: 'approved' });
  let team = (await hana.call('GET', '/api/host/team')).json.data as BoothTeamView;
  assert.equal(team.owner, true); assert.equal(team.company, 'Kedai Kopi');
  const code = new URL(team.link!).searchParams.get('team')!;
  assert.match(code, /^[A-Z0-9]{8}$/);
  assert.equal((await hana.call('POST', '/api/booth-team/join', { code })).json.code, 'own_team');

  // a colleague: sees what they are joining, needs a card, then joins
  const ali = user(); await ali.call('POST', '/api/start', { role: 'visitor' });
  assert.deepEqual((await ali.call('GET', `/api/booth-team/peek?code=${code.toLowerCase()}`)).json.data, { company: 'Kedai Kopi', booths: ['7C17'], ownerName: 'Hana' });
  assert.equal((await ali.call('POST', '/api/booth-team/join', { code })).json.code, 'card');
  await ali.card('Ali');
  assert.equal((await ali.call('POST', '/api/booth-team/join', { code })).status, 200);
  const me = await ali.me();
  assert.deepEqual([me.cls, me.hosting], ['exhibitor', ['7C17']], 'the booth is theirs to work now');

  // the whole dashboard: QR, visitors, booth list — and the logo, photo and profile
  const v = user(); await v.card('Visitor Vi'); tick();
  await v.call('POST', '/api/stamp', { stationId: '7C17', proof: 'beacon', beacon: await beacon('7C17') });
  assert.deepEqual(((await ali.call('GET', '/api/host/scans?station=7C17')).json.data as BoothScan[]).map((s) => s.name), ['Visitor Vi']);
  assert.equal((await ali.call('GET', '/api/host/qr?station=7C17')).status, 200);
  assert.equal(((await ali.call('GET', '/api/host/stations')).json.data as HostStation[])[0]!.id, '7C17');
  assert.equal((await ali.call('POST', '/api/station/logo', { stationId: '7C17', image: PNG })).status, 200);
  assert.equal((await ali.call('POST', '/api/station/photo', { stationId: '7C17', image: PNG })).status, 200);
  assert.equal((await ali.call('POST', '/api/station/claim', { stationId: '7C17', company: 'Kedai Kopi', offer: 'Free kopi at 3', link: '', color: 0 })).status, 200);
  // … but only the owner adds booths and manages the team
  assert.equal((await ali.call('POST', '/api/station/claim', { stationId: '7C19', company: 'Kedai Kopi', offer: '', link: '', color: 0 })).json.code, 'not_owner');
  team = (await ali.call('GET', '/api/host/team')).json.data as BoothTeamView;
  assert.deepEqual([team.owner, team.link, team.members.map((m) => m.name)], [false, null, ['Ali']]);
  assert.equal((await ali.call('POST', '/api/host/team/reset')).json.code, 'not_owner');

  // on the floor: the colleague wears the company name, and plays no visitor mission or board
  tick(60_000);
  await ali.call('POST', '/api/presence', { x: level.spawns.short.x, y: level.spawns.short.y, h: 0, spawn: true});
  const seen = (await v.call('POST', '/api/presence', { x: level.spawns.short.x + 1, y: level.spawns.short.y, h: 0, spawn: true})).json.data.holograms as { callsign: string; company?: string }[];
  assert.equal(seen.find((h) => h.callsign.startsWith('Ali'))?.company, 'Kedai Kopi');
  assert.equal((await ali.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await beacon(level.hero.id) })).json.code, 'exhibitor');
  tick(); await ali.call('POST', '/api/stamp', { stationId: '6A17', proof: 'beacon', beacon: await beacon('6A17') }); // points, but not on the board
  const board = (await v.call('GET', '/api/boards?board=xp')).json.data as BoardRow[];
  assert.ok(!board.some((r) => r.title.startsWith('Ali') || r.title.startsWith('Hana')), JSON.stringify(board.map((r) => r.title)));
  assert.ok(board.some((r) => r.title === 'Visitor V.'), 'the visitor is');

  // one team at a time; the owner removes someone; a reset link stops working
  const other = user(); await other.card('Owner Two', 'exhibitor');
  await other.call('POST', '/api/station/claim', { stationId: '6E13', company: 'Other Co', offer: '', link: '', color: 0 });
  const otherCode = new URL(((await other.call('GET', '/api/host/team')).json.data as BoothTeamView).link!).searchParams.get('team')!;
  assert.equal((await ali.call('POST', '/api/booth-team/join', { code: otherCode })).json.code, 'other_team');
  assert.equal((await other.call('POST', '/api/booth-team/join', { code })).json.code, 'has_booth', 'running a booth, you cannot also join another');
  team = (await hana.call('POST', '/api/host/team/remove', { key: team.members[0]!.key })).json.data as BoothTeamView;
  assert.deepEqual(team.members, []);
  assert.equal((await ali.call('GET', '/api/host/scans?station=7C17')).status, 403, 'removed: no access');
  await hana.call('POST', '/api/host/team/reset');
  assert.equal((await ali.call('POST', '/api/booth-team/join', { code })).json.code, 'bad_team', 'the old link is dead');
  void services;
});
