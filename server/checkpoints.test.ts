import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { BoothScan, LevelData, Me, StationView } from '../shared/types.js';
import { CHECKPOINTS, chapters } from '../shared/rules.js';

const root = resolve(import.meta.dirname, '..');
const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;
/** A 1×1 PNG. */
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
      const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      return { status: res.status, json, res };
    };
    return {
      call,
      async register(name: string, role: 'visitor' | 'exhibitor') {
        await call('POST', '/api/start', { role });
        const r = await call('POST', '/api/passport', { name, company: `${name} Co`, role: 'Owner', phone: '+60123456789', email: `${name.split(' ')[0]!.toLowerCase()}@example.com`, showContact: false, consentMarketing: false, consentNotice: true });
        assert.equal(r.status, 200, r.json?.error);
      },
      me: async () => (await call('GET', '/api/me')).json.me as Me,
    };
  };
  const crew = user(); await crew.call('POST', '/api/crew/login', { pin: '4321' });
  const beacon = async (id: string) => new URL(((await crew.call('GET', '/api/crew/beacons')).json.data as { id: string; url: string }[]).find((b) => b.id === id)!.url).searchParams.get('b')!;
  return { user, crew, beacon, services, tick: (ms = 10_000) => { now += ms; } };
}

/** Exhibitors who have signed up themselves and brought a booth online (pending until the crew approves). */
async function exhibitors(r: Awaited<ReturnType<typeof rig>>, ids: string[]) {
  const out: { id: string; u: ReturnType<typeof r.user> }[] = [];
  for (const id of ids) {
    const u = r.user(); await u.register(`Owner ${id}`, 'exhibitor');
    const c = await u.call('POST', '/api/station/claim', { stationId: id, company: `Company ${id}`, offer: '', link: '', color: 0x17b6d6 });
    assert.equal(c.status, 200, c.json?.error);
    out.push({ id, u });
  }
  return out;
}

test('register at Lean X, scan its QR to start, get checkpoints, scan them — and each exhibitor sees who came', async () => {
  const r = await rig();
  const ids = ['7C17', '7C19', '6A17', '6E13', '6C06', '8H19'];
  const ex = await exhibitors(r, ids);

  // an exhibitor uploads a logo; it stays out of the world until the crew approves the booth
  assert.equal((await ex[0]!.u.call('POST', '/api/station/logo', { stationId: '7C17', image: 'data:text/html;base64,PGI+' })).json.code, 'logo');
  assert.equal((await r.user().call('POST', '/api/station/logo', { stationId: '7C17', image: PNG })).status, 403, 'only the owner');
  assert.equal((await ex[0]!.u.call('POST', '/api/station/logo', { stationId: '7C17', image: PNG })).status, 200);
  assert.equal((await ex[0]!.u.call('POST', '/api/station/photo', { stationId: '7C17', image: PNG })).status, 200, 'and a photo of the booth');
  assert.equal(((await ex[0]!.u.call('GET', '/api/host/stations')).json.data as StationView[])[0]!.photo !== null, true, 'the owner sees their photo before approval');
  let list = (await r.crew.call('GET', '/api/stations')).json.data as StationView[];
  assert.deepEqual([list.find((s) => s.id === '7C17')!.logo, list.find((s) => s.id === '7C17')!.photo], [null, null], 'pending: nothing in the world yet');
  for (const id of ids.slice(0, 5)) assert.equal((await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' })).status, 200);
  r.tick(10_000); // the station list is cached for a few seconds
  list = (await r.crew.call('GET', '/api/stations')).json.data as StationView[];
  const logoUrl = list.find((s) => s.id === '7C17')!.logo!;
  assert.match(logoUrl, /^\/api\/logo\/7C17\?v=\d+$/);
  const img = await r.crew.call('GET', logoUrl);
  assert.equal(img.res.headers.get('content-type'), 'image/png');
  const photoUrl = list.find((s) => s.id === '7C17')!.photo!;
  assert.match(photoUrl, /^\/api\/photo\/7C17\?v=\d+$/);
  assert.equal((await r.crew.call('GET', photoUrl)).res.headers.get('content-type'), 'image/png');

  // a visitor who scans before registering is sent to register; the Lean X QR needs the card too
  const v = r.user(); await v.call('POST', '/api/start', { role: 'visitor' });
  assert.equal((await v.call('POST', '/api/stamp', { stationId: '7C17', proof: 'beacon', beacon: await r.beacon('7C17') })).json.code, 'card');
  assert.equal((await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) })).json.code, 'card');
  await v.call('POST', '/api/passport', { name: 'Aisyah Rahman', company: 'Kedai Kopi', role: 'Founder', phone: '+60123456789', email: 'aisyah@example.com', showContact: false, consentMarketing: false, consentNotice: true });
  let me = await v.me();
  assert.equal(me.mission.started, false);

  // walking up to the Lean X booth in the game does not start anything; its QR does
  r.tick(); const hero = await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  assert.equal(hero.json.events[0].action, 'mission_start');
  assert.equal((await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) })).json.code, 'dup');
  me = await v.me();
  assert.equal(me.mission.started, true);
  assert.equal(me.mission.target, CHECKPOINTS);
  assert.deepEqual(me.mission.checkpoints.map((c) => c.stationId).sort(), ids.slice(0, 5).sort(), 'five approved, so all five; the pending booth is not one');
  const facts = (m: Me) => ({ started: m.mission.started, card: !!m.passport, checkpoints: m.mission.checkpoints.filter((c) => c.done).length, target: m.mission.target, claimed: m.docked });
  assert.deepEqual(chapters(facts(me)).filter((c) => !c.done).map((c) => c.n), [3]);

  // scanning a checkpoint: the exhibitor's live QR, or their printed one
  const live = (await ex[0]!.u.call('GET', '/api/host/code?station=7C17')).json.data as { url: string };
  r.tick(); let s = await v.call('POST', '/api/stamp', { stationId: '7C17', proof: 'host', code: new URL(live.url).searchParams.get('h')! });
  assert.ok(s.json.events.some((e: { action: string; note?: string }) => e.action === 'checkpoint' && e.note === `1 of ${CHECKPOINTS} checkpoints`), JSON.stringify(s.json.events));
  assert.equal((await v.call('POST', '/api/stamp', { stationId: '7C17', proof: 'beacon', beacon: await r.beacon('7C17') })).json.code, 'dup');
  const printed = (await ex[1]!.u.call('GET', '/api/host/qr?station=7C19')).json.data as { url: string };
  r.tick(); s = await v.call('POST', '/api/stamp', { stationId: '7C19', proof: 'beacon', beacon: new URL(printed.url).searchParams.get('b')! });
  assert.ok(s.json.events.some((e: { action: string }) => e.action === 'checkpoint'));
  // the exhibitor who is not a checkpoint (still pending) still gets the visitor on their dashboard
  r.tick(); s = await v.call('POST', '/api/stamp', { stationId: '8H19', proof: 'beacon', beacon: await r.beacon('8H19') });
  assert.ok(!s.json.events.some((e: { action: string }) => e.action === 'checkpoint'));

  // the dashboard: name, phone and email of everyone who scanned — only for the booth's owner
  const scans = (await ex[0]!.u.call('GET', '/api/host/scans?station=7C17')).json.data as BoothScan[];
  assert.deepEqual(scans.map((x) => [x.name, x.phone, x.email, x.checkpoint]), [['Aisyah Rahman', '+60123456789', 'aisyah@example.com', true]]);
  assert.equal(((await ex[5]!.u.call('GET', '/api/host/scans?station=8H19')).json.data as BoothScan[])[0]!.checkpoint, false);
  assert.equal((await ex[1]!.u.call('GET', '/api/host/scans?station=7C17')).status, 403);
  assert.match(await (await ex[0]!.u.call('GET', '/api/host/scans.csv?station=7C17')).res.text(), /Aisyah Rahman.*aisyah@example.com/);

  // the rest of the checkpoints, then the prize: the crew sees how far the visitor got
  for (const c of me.mission.checkpoints.filter((c) => !['7C17', '7C19'].includes(c.stationId))) { r.tick(); await v.call('POST', '/api/stamp', { stationId: c.stationId, proof: 'beacon', beacon: await r.beacon(c.stationId) }); }
  me = await v.me();
  assert.deepEqual(chapters(facts(me)).filter((c) => !c.done).map((c) => c.n), [], 'all checkpoints done: mission complete');
  const ticket = (await r.crew.call('GET', `/api/crew/ticket?t=${me.ticket!.code}`)).json.data;
  assert.deepEqual(ticket.checkpoints, { started: true, done: CHECKPOINTS, target: CHECKPOINTS });
});

test('more exhibitors than checkpoints: each visitor gets five at random; fewer approved, fewer checkpoints, topped up later', async () => {
  const r = await rig();
  const ids = ['7C17', '7C19', '6A17', '6E13', '6C06', '8H19', '8H20'];
  await exhibitors(r, ids);
  for (const id of ids.slice(0, 3)) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });

  const v = r.user(); await v.register('Ben Tan', 'visitor');
  await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  let m = (await v.me()).mission;
  assert.equal(m.target, 3, 'three approved so far: three checkpoints');

  for (const id of ids.slice(3)) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });
  r.tick(20_000);
  m = (await v.me()).mission;
  assert.equal(m.target, CHECKPOINTS);
  assert.equal(m.checkpoints.length, CHECKPOINTS, 'topped up to five, not seven');
  assert.ok(ids.slice(0, 3).every((id) => m.checkpoints.some((c) => c.stationId === id)), 'the first ones are kept');
});

test('exhibitors are here with a booth: the visitor mission is not for them', async () => {
  const r = await rig();
  const ex = await exhibitors(r, ['7C17', '7C19']);
  for (const id of ['7C17', '7C19']) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });
  const owner = ex[0]!.u;
  assert.equal((await owner.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) })).json.code, 'exhibitor');
  assert.equal((await owner.me()).mission.started, false);
});
