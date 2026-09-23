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

  // an exhibitor uploads a logo and a photo: in the world straight away, approval or not
  assert.equal((await ex[0]!.u.call('POST', '/api/station/logo', { stationId: '7C17', image: 'data:text/html;base64,PGI+' })).json.code, 'logo');
  assert.equal((await r.user().call('POST', '/api/station/logo', { stationId: '7C17', image: PNG })).status, 403, 'only the owner');
  assert.equal((await ex[0]!.u.call('POST', '/api/station/logo', { stationId: '7C17', image: PNG })).status, 200);
  assert.equal((await ex[0]!.u.call('POST', '/api/station/photo', { stationId: '7C17', image: PNG })).status, 200, 'and a photo of the booth');
  assert.equal(((await ex[0]!.u.call('GET', '/api/host/stations')).json.data as StationView[])[0]!.photo !== null, true, 'the owner sees their photo');
  r.tick(10_000); // the station list is cached for a few seconds
  let list = (await r.crew.call('GET', '/api/stations')).json.data as StationView[];
  assert.ok(list.find((s) => s.id === '7C17')!.logo && list.find((s) => s.id === '7C17')!.photo, 'pending, and already in the world');
  for (const id of ids.slice(0, 5)) assert.equal((await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' })).status, 200);
  r.tick(10_000);
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
  assert.equal((await v.me()).mission.started, false, 'no card, no mission');
  await v.call('POST', '/api/passport', { name: 'Aisyah Rahman', company: 'Kedai Kopi', role: 'Founder', phone: '+60123456789', email: 'aisyah@example.com', showContact: false, consentMarketing: false, consentNotice: true });
  let me = await v.me();
  assert.equal(me.mission.started, true, 'the card starts the mission: no need to come to Lean X first');

  // the Lean X QR starts nothing: it says how the visitor is doing, and can be scanned again and again
  r.tick(); const hero = await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  assert.equal(hero.json.events[0].action, 'progress');
  assert.match(hero.json.events[0].note, new RegExp(`^0 of ${CHECKPOINTS} checkpoints`));
  r.tick(); assert.equal((await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) })).json.events[0].action, 'progress');
  me = await v.me();
  assert.equal(me.mission.started, true);
  assert.equal(me.mission.target, CHECKPOINTS);
  assert.equal(me.mission.checkpoints.length, CHECKPOINTS, 'five approved: three of them, drawn at random');
  assert.ok(me.mission.checkpoints.every((c) => ids.slice(0, 5).includes(c.stationId)), 'the pending booth is not one');
  // the walkthrough below scans 7C17 and 7C19 by name: make sure they are on this visitor's list
  for (const id of ['7C17', '7C19']) if (!me.mission.checkpoints.some((c) => c.stationId === id)) {
    const drop = me.mission.checkpoints.find((c) => !['7C17', '7C19'].includes(c.stationId))!;
    await r.services.game.db.run('UPDATE checkpoints SET station_id = ? WHERE station_id = ?', [id, drop.stationId]); me = await v.me();
  }
  const facts = (m: Me) => ({ started: m.mission.started, card: !!m.passport, checkpoints: m.mission.checkpoints.filter((c) => c.done).length, target: m.mission.target, claimed: m.docked });
  assert.deepEqual(chapters(facts(me)).filter((c) => !c.done).map((c) => c.n), [2, 3]);

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
  assert.deepEqual(chapters(facts(me)).filter((c) => !c.done).map((c) => c.n), [3], 'all checkpoints done: the tote bag at Lean X is what is left');
  r.tick(); const back = await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  assert.equal(back.json.events[0].action, 'prize', 'the Lean X QR now says the tote bag is here');
  const ticket = (await r.crew.call('GET', `/api/crew/ticket?t=${me.ticket!.code}`)).json.data;
  assert.deepEqual(ticket.checkpoints, { started: true, done: CHECKPOINTS, target: CHECKPOINTS });
  assert.equal((await r.crew.call('POST', '/api/crew/dock', { t: me.ticket!.code })).status, 200);
  me = await v.me();
  assert.deepEqual(chapters(facts(me)).filter((c) => !c.done).map((c) => c.n), [], 'tote bag claimed: mission complete');
});

test('more exhibitors than checkpoints: each visitor gets three at random; fewer approved, fewer checkpoints, topped up later', async () => {
  const r = await rig();
  const ids = ['7C17', '7C19', '6A17', '6E13', '6C06', '8H19', '8H20'];
  await exhibitors(r, ids);
  for (const id of ids.slice(0, 2)) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });

  const v = r.user(); await v.register('Ben Tan', 'visitor');
  await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  let m = (await v.me()).mission;
  assert.equal(m.target, 2, 'two approved so far: two checkpoints');

  for (const id of ids.slice(2)) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });
  r.tick(20_000);
  m = (await v.me()).mission;
  assert.equal(m.target, CHECKPOINTS);
  assert.equal(m.checkpoints.length, CHECKPOINTS, 'topped up to three, not seven');
  assert.ok(ids.slice(0, 2).every((id) => m.checkpoints.some((c) => c.stationId === id)), 'the first ones are kept');
});

test('the crew registers an exhibitor at the counter: card and booth in one go, approved, handed over by a link', async () => {
  const r = await rig();
  const reg = (body: object) => r.crew.call('POST', '/api/crew/register', { stationId: '7C17', company: 'Kencana Foods', name: 'Aisyah Rahman', role: 'Founder', phone: '+60123456789', email: 'aisyah@example.com', offer: 'Free samples', link: 'kencana.my', consent: true, ...body });
  assert.equal((await reg({ consent: false })).json.code, 'consent');
  assert.equal((await reg({ stationId: 'ZZ99' })).json.code, 'no_station');
  assert.equal((await reg({ email: 'nope' })).json.code, 'email');
  const made = await reg({});
  assert.equal(made.status, 200, made.json?.error);
  const row = made.json.data as { stationId: string; company: string; status: string; url: string; teamUrl: string; taken: boolean; code: string };
  assert.deepEqual([row.stationId, row.company, row.status, row.taken], ['7C17', 'Kencana Foods', 'approved', false]);
  assert.match(row.url, /^http:\/\/x\.test\/\?join=[A-Z2-9]{8}$/);
  assert.match(row.teamUrl, /^http:\/\/x\.test\/\?team=[A-Z2-9]{8}$/, 'and the booth-team link for colleagues, handed out at the same time');
  assert.equal((await reg({})).json.code, 'taken', 'the booth is online now');
  assert.equal(((await r.crew.call('GET', '/api/crew/registered')).json.data as { stationId: string }[]).map((x) => x.stationId).join(), '7C17');
  // in the world, approved, so a checkpoint for visitors
  r.tick(10_000);
  const st = ((await r.crew.call('GET', '/api/stations')).json.data as StationView[]).find((s) => s.id === '7C17')!;
  assert.deepEqual([st.company, st.status, st.offer, st.link], ['Kencana Foods', 'approved', 'Free samples', 'https://kencana.my/']);

  // the exhibitor opens the link on their phone: the account is theirs, booth and all
  const phone = r.user();
  assert.equal((await phone.call('GET', '/api/handoff/peek?code=NOPE1234')).status, 404);
  const peek = (await phone.call('GET', `/api/handoff/peek?code=${row.code}`)).json.data;
  assert.deepEqual(peek, { stationId: '7C17', company: 'Kencana Foods', name: 'Aisyah Rahman', taken: false });
  const took = await phone.call('POST', '/api/handoff', { code: row.code });
  assert.equal(took.status, 200);
  const me = took.json.me as Me;
  assert.deepEqual([me.cls, me.passport?.name, me.hosting], ['exhibitor', 'Aisyah Rahman', ['7C17']]);
  assert.equal((await phone.me()).passport?.name, 'Aisyah Rahman', 'the session cookie now belongs to that account');
  assert.equal(((await phone.call('GET', '/api/host/stations')).json.data as StationView[])[0]!.id, '7C17', 'their dashboard');
  assert.equal(((await r.crew.call('GET', '/api/crew/registered')).json.data as { taken: boolean }[])[0]!.taken, true);
  // released by the crew: the link stops working
  await r.crew.call('POST', '/api/crew/stations/status', { stationId: '7C17', status: 'release' });
  assert.equal((await r.user().call('GET', `/api/handoff/peek?code=${row.code}`)).status, 404);
});

test('exhibitors are here with a booth: the visitor mission is not for them', async () => {
  const r = await rig();
  const ex = await exhibitors(r, ['7C17', '7C19']);
  for (const id of ['7C17', '7C19']) await r.crew.call('POST', '/api/crew/stations/status', { stationId: id, status: 'approved' });
  const owner = ex[0]!.u;
  assert.equal((await owner.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) })).json.code, 'exhibitor');
  assert.equal((await owner.me()).mission.started, false);
});

test('release: the next owner of a booth starts clean — no old logo, photo, scans or cards', async () => {
  const r = await rig();
  const first = r.user(), next = r.user(), v = r.user();
  await first.register('Wrong Owner', 'exhibitor'); await next.register('Real Owner', 'exhibitor'); await v.register('Aisyah Rahman', 'visitor');
  assert.equal((await first.call('POST', '/api/station/claim', { stationId: '7C17', company: 'Wrong Co', offer: '', link: '', color: 0 })).status, 200);
  await first.call('POST', '/api/station/logo', { stationId: '7C17', image: PNG }); await first.call('POST', '/api/station/photo', { stationId: '7C17', image: PNG });
  r.tick(); assert.equal((await v.call('POST', '/api/stamp', { stationId: '7C17', proof: 'beacon', beacon: await r.beacon('7C17') })).status, 200);
  assert.equal((await v.call('POST', '/api/station/share', { stationId: '7C17', fields: ['name', 'email'] })).status, 200);
  assert.equal(((await first.call('GET', '/api/host/scans?station=7C17')).json.data as BoothScan[]).length, 1);

  assert.equal((await r.crew.call('POST', '/api/crew/stations/status', { stationId: '7C17', status: 'release' })).status, 200);
  assert.equal((await next.call('POST', '/api/station/claim', { stationId: '7C17', company: 'Real Co', offer: '', link: '', color: 0 })).status, 200);
  const mine = (await next.call('GET', '/api/host/stations')).json.data as { id: string; logo: string | null; photo: string | null; scans: number }[];
  assert.deepEqual(mine.map((s) => [s.id, s.logo, s.photo, s.scans]), [['7C17', null, null, 0]]);
  assert.deepEqual((await next.call('GET', '/api/host/scans?station=7C17')).json.data, [], 'the old owner\'s visitors are not handed over');
  assert.deepEqual((await next.call('GET', '/api/host/leads?station=7C17')).json.data, [], 'nor the cards left with them');
  assert.equal((await first.call('GET', '/api/host/scans?station=7C17')).status, 403, 'and the old owner is out');
  assert.ok((await v.me()).stamps.includes('7C17'), 'the visitor keeps their stamp and points');
});

test('a booth row with no exhibitor behind it (no card) is shown to the crew and never handed out as a checkpoint', async () => {
  const r = await rig();
  const ex = await exhibitors(r, ['7C17']);
  await r.crew.call('POST', '/api/crew/stations/status', { stationId: '7C17', status: 'approved' });
  // a stray row, the way a seed script once made them: an owner who never filled in a card
  const ghost = await r.services.game.createGuest();
  await r.services.game.db.run("INSERT INTO stations (station_id, owner_id, company, offer, link, color, status, claimed_at) VALUES ('7H18', ?, 'Ghost Co', '', '', 0, 'approved', 1)", [ghost]);
  r.tick(20_000);
  const rows = (await r.crew.call('GET', '/api/crew/stations')).json.data as { id: string; ownerName: string }[];
  assert.deepEqual(rows.map((x) => [x.id, x.ownerName]).sort(), [['7C17', 'Owner 7C17'], ['7H18', '']], 'the crew sees the stray booth, with no owner name');
  const v = r.user(); await v.register('Ben Tan', 'visitor');
  await v.call('POST', '/api/stamp', { stationId: level.hero.id, proof: 'beacon', beacon: await r.beacon(level.hero.id) });
  assert.deepEqual((await v.me()).mission.checkpoints.map((c) => c.stationId), ['7C17'], 'only the real exhibitor is a checkpoint');
  void ex;
});
