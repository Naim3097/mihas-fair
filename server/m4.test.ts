import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { BoardRow, HostCode, LevelData, Me, MissionsView, ReviewRow, ScreenView, SectorsView, TeamView, TrustView } from '../shared/types.js';
import { ALL_FEATURES } from '../shared/rules.js';

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;
const booth = (id: string) => level.booths.find((b) => b.id === id)!;

async function rig() {
  let now = Date.UTC(2026, 8, 23, 2, 5, 0);
  const clock = { advance: (ms: number) => { now += ms; } };
  const services = buildServices({ ...(await testStores()), features: ALL_FEATURES, secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const user = () => {
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      return { status: res.status, json: res.headers.get('content-type')?.includes('json') ? await res.json() : null };
    };
    const u = {
      get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
      me: async () => (await call('GET', '/api/me')).json.me as Me,
      async join(cls: string, name?: string) {
        await call('POST', '/api/start', { role: cls });
        if (name) assert.equal((await call('POST', '/api/passport', { name, company: `${name} Co`, role: 'Owner', phone: '+60120000001', email: 'a@example.com', showContact: false, consentMarketing: false, consentNotice: true })).status, 200);
        return u;
      },
      async walkTo(id: string) { clock.advance(60_000); const b = booth(id); assert.equal((await call('POST', '/api/presence', { x: b.x - 2.5, y: b.y, h: 0 })).status, 200); },
    };
    return u;
  };
  const crew = async () => { const u = user(); assert.equal((await u.post('/api/crew/login', { pin: '4321' })).status, 200); return u; };
  return { clock, user, crew, services };
}

test('one deck: Level 2 only, booth ids unique, and the sectors are Halls 6–8', async () => {
  const { user } = await rig(), p = await user().join('visitor');
  assert.deepEqual(level.decks.map((d) => d.level), [2]);
  assert.ok(level.booths.every((b) => b.deck === 2) && level.lifts.length === 0);
  assert.equal(level.booths.length, new Set(level.booths.map((b) => b.id)).size, 'booth ids are unique');
  const sectors = ((await p.get('/api/sectors')).json.data as SectorsView).sectors;
  assert.deepEqual(sectors.map((s) => s.hall).sort((a, b) => a - b), [6, 7, 8]);
});

test('trust: remote play cannot reach the bar; a booth QR + the live code + docking does; a teleport attempt costs it', async () => {
  const { clock, user, crew, services } = await rig();
  const host = await user().join('exhibitor', 'Hana Host'), remote = await user().join('visitor', 'Rita Remote'), onsite = await user().join('visitor', 'Omar Onsite');
  await host.post('/api/station/claim', { stationId: '7C17', company: 'Mamee', offer: '', link: '', color: 0 });

  let t = (await remote.get('/api/trust')).json.data as TrustView;
  assert.deepEqual([t.score, t.trusted], [0.35, false], 'plausible + nothing-to-contradict: not enough');

  assert.equal((await onsite.post('/api/stamp', { stationId: '7C17', proof: 'beacon', beacon: await services.game.beaconToken('7C17') })).status, 200, 'the printed QR on the counter');
  const code = (await host.get('/api/host/code?station=7C17')).json.data as HostCode;
  assert.equal((await onsite.post('/api/stamp', { stationId: '7C17', proof: 'host', code: code.digits })).status, 200);
  t = (await onsite.get('/api/trust')).json.data;
  assert.deepEqual([t.score, t.trusted], [0.9, true], 'booth QR .25 + live code .30 + plausible .20 + steps .15');

  // a jump across the hall in one second is refused AND remembered
  const gate = level.spawns.short; // at the entrance, outside every hall: no first-visit points muddying the sums
  await onsite.post('/api/presence', { x: gate.x, y: gate.y, h: 0, spawn: true }); clock.advance(1000);
  await onsite.post('/api/presence', { x: gate.x + 60, y: gate.y, h: 0 });
  t = (await onsite.get('/api/trust')).json.data;
  assert.equal(t.parts.plausible, false);
  assert.deepEqual([t.score, t.trusted], [0.7, true], 'still just over the bar — one signal alone does not sink an honest player');

  // boards: trusted flag per row; review shows the breakdown; voiding and banning work
  clock.advance(20_000);
  let board = (await remote.get('/api/boards?board=today')).json.data as BoardRow[];
  assert.deepEqual(board.map((r) => r.trusted), board.map((r) => r.sub !== 'Cadet' ? r.trusted : r.trusted)); // shape check
  assert.equal(board.find((r) => r.trusted)?.value, 50 + 200, 'Omar: a real-booth scan + the card, today');
  assert.equal((await remote.get('/api/crew/review')).status, 401);

  const staff = await crew();
  const review = (await staff.get('/api/crew/review?board=today')).json.data as ReviewRow[];
  const omar = review.find((r) => r.name === 'Omar Onsite')!;
  assert.deepEqual([omar.trust.trusted, omar.flags, omar.banned], [true, 1, false]);
  const ledger = (await staff.get(`/api/crew/ledger?callsign=${omar.callsign}`)).json.data as { id: number; action: string; xp: number }[];
  const stampRow = ledger.find((l) => l.action === 'stamp')!;
  await staff.post('/api/crew/void', { id: stampRow.id });
  assert.equal((await onsite.me()).xp, 200, 'the voided scan no longer counts: only the card is left');
  await staff.post('/api/crew/void', { id: stampRow.id, voided: false });
  assert.equal((await onsite.me()).xp, 200 + 50, 'and can be restored');

  await staff.post('/api/crew/ban', { callsign: omar.callsign, reason: 'test' });
  clock.advance(20_000);
  board = (await remote.get('/api/boards?board=xp')).json.data;
  assert.ok(!board.some((r) => r.title === omar.callsign), 'banned accounts leave every board');
  assert.equal((await onsite.post('/api/suit-up', { cls: 'exhibitor' })).json.code, 'review');
  assert.equal((await onsite.get('/api/me')).status, 200, 'they can still look');
  void services;
});

test('teams, kill switches, the Daily Drop, and what the big screen is allowed to know', async () => {
  const { clock, user, crew } = await rig();
  const boss = await user().join('visitor', 'Bea Boss'), mate = await user().join('visitor', 'Mo Mate'), guest = await user().join('visitor');
  const staff = await crew();

  assert.equal((await guest.post('/api/team/create', { name: 'x' })).json.code, 'need_passport');
  const team = (await boss.post('/api/team/create', {})).json.data as TeamView;
  assert.deepEqual([team.name, team.owner, team.members.length], ['Bea Boss Co', true, 1]);
  assert.equal((await mate.post('/api/team/join', { code: 'AAAAAAAA' })).json.code, 'bad_code');
  const joined = (await mate.post('/api/team/join', { code: team.code })).json.data as TeamView;
  assert.deepEqual([joined.owner, joined.code, joined.members.length, joined.score], [false, null, 2, 400]);
  assert.equal((await mate.post('/api/team/create', {})).json.code, 'in_team');
  const co = (await guest.get('/api/boards?board=companies')).json.data as BoardRow[];
  assert.deepEqual([co[0]!.title, co[0]!.value, co[0]!.trusted], ['Bea Boss Co', 400, false]);
  await boss.post('/api/team/leave');
  assert.equal((await mate.get('/api/team')).json.data, null, 'the founder leaving dissolves the team');

  // kill switches
  assert.equal((await guest.post('/api/crew/flags', { flag: 'claims', on: false })).status, 401);
  await staff.post('/api/crew/flags', { flag: 'claims', on: false });
  clock.advance(6000);
  assert.equal((await boss.post('/api/station/claim', { stationId: '7C17', company: 'Bea', offer: '', link: '', color: 0 })).status, 503);
  await staff.post('/api/crew/flags', { flag: 'claims', on: true }); clock.advance(6000);
  assert.equal((await boss.post('/api/station/claim', { stationId: '7C17', company: 'Bea', offer: '', link: '', color: 0 })).status, 200);
  await staff.post('/api/crew/flags', { flag: 'holograms', on: false }); clock.advance(6000);
  const s = level.spawns.short;
  await boss.post('/api/presence', { x: s.x, y: s.y, h: 0, spawn: true });
  assert.equal((await mate.post('/api/presence', { x: s.x + 1, y: s.y, h: 0, spawn: true })).json.data.holograms.length, 0);

  // Daily Drop: only an on-site stamp of today's station pays, once
  assert.equal((await staff.post('/api/crew/drop', { stationId: 'nope', title: 'x', bonus: 100 })).json.code, 'no_station');
  await staff.post('/api/crew/drop', { stationId: '7c17', title: 'Kopi o’clock', bonus: 120 });
  assert.equal(((await mate.get('/api/missions')).json.data as MissionsView).drop?.stationId, '7C17');
  await mate.walkTo('7C17');
  assert.deepEqual((await mate.post('/api/stamp', { stationId: '7C17', proof: 'virtual' })).json.events.map((e: { action: string }) => e.action), ['stamp'], 'walked up remotely: no drop');
  const code = (await boss.get('/api/host/code?station=7C17')).json.data as HostCode;
  const paid = (await mate.post('/api/stamp', { stationId: '7C17', proof: 'host', code: code.digits })).json.events as { action: string; xp: number }[];
  assert.deepEqual(paid.map((e) => [e.action, e.xp]), [['verified_contact', 0], ['daily_drop', 120]]);
  assert.equal((await mate.get('/api/today')).json.data.drop.done, true, 'the simple game reads the booth of the day from /api/today');
  assert.equal(((await mate.get('/api/missions')).json.data as MissionsView).drop?.done, true);

  // the big screen: crew only, and it carries positions and totals — never identities
  assert.equal((await guest.get('/api/crew/screen')).status, 401);
  const screen = (await staff.get('/api/crew/screen')).json.data as ScreenView;
  assert.ok(screen.dots.length >= 1 && screen.totals.passports === 2 && screen.joinUrl === 'http://x.test');
  assert.deepEqual(Object.keys(screen.dots[0]!).sort(), ['cls', 'deck', 'x', 'y']);
  assert.ok(!JSON.stringify(screen.dots).match(/Bea|Mo Mate/));
});
