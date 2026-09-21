import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData, ReferralRow, ReferralView } from '../shared/types.js';
import { REFERRAL_POINTS } from '../shared/rules.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/data/floor.json'), 'utf8')) as LevelData;

async function rig() {
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test' });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const user = () => {
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      return { status: res.status, json: await res.json() };
    };
    /** An exhibitor bringing a booth online, perhaps with someone's referral code. */
    const exhibit = async (name: string, booth: string, ref?: string) => {
      await call('POST', '/api/start', { role: 'exhibitor' });
      await call('POST', '/api/passport', { name, company: `${name} Co`, role: 'Owner', phone: '+60123456789', email: `${name.toLowerCase().replace(/\W/g, '')}@example.com`, showContact: false, consentMarketing: false, consentNotice: true });
      const r = await call('POST', '/api/station/claim', { stationId: booth, company: `${name} Co`, offer: '', link: '', color: 0, ref });
      assert.equal(r.status, 200, r.json.error);
    };
    return { call, exhibit, refs: async () => (await call('GET', '/api/host/referrals')).json.data as ReferralView };
  };
  const crew = user(); await crew.call('POST', '/api/crew/login', { pin: '4321' });
  const approve = (id: string, status = 'approved') => crew.call('POST', '/api/crew/stations/status', { stationId: id, status });
  return { user, crew, approve };
}

test('an exhibitor who invites exhibitors earns 10 points for each one the crew approves', async () => {
  const { user, crew, approve } = await rig();
  const hana = user(); await hana.exhibit('Hana', '7C17');
  const mine = await hana.refs();
  assert.match(mine.code, /^[A-Z0-9]{6}$/);
  assert.equal(mine.url, `http://x.test/?ref=${mine.code}`);
  assert.equal((await hana.refs()).code, mine.code, 'one code, kept');
  assert.deepEqual([mine.points, mine.joined], [0, []]);

  // two exhibitors join with her code (one of them brings two booths: still one referral); one with no code; one with a bad code
  const ali = user(); await ali.exhibit('Ali', '7C19', mine.code.toLowerCase());
  await ali.call('POST', '/api/station/claim', { stationId: '6E13', company: 'Ali Co', offer: '', link: '', color: 0, ref: mine.code });
  const siti = user(); await siti.exhibit('Siti', '6A17', mine.code);
  const lone = user(); await lone.exhibit('Lone', '6C06');
  const bad = user(); await bad.exhibit('Bad', '6H13', 'NOPE12');

  let v = await hana.refs();
  assert.deepEqual(v.joined.map((j) => [j.company, j.approved]), [['Ali Co', false], ['Siti Co', false]], 'joined, waiting for approval');
  assert.equal(v.points, 0, 'no points before the crew approves');

  await approve('7C19'); await approve('6A17');
  v = await hana.refs();
  assert.equal(v.points, 2 * REFERRAL_POINTS);

  // a booth the crew revokes stops counting
  await approve('6A17', 'revoked');
  assert.equal((await hana.refs()).points, REFERRAL_POINTS);

  // no referring yourself
  const self = user(); await self.exhibit('Self', '8H19');
  const own = await self.refs();
  await self.call('POST', '/api/station/claim', { stationId: '8H20', company: 'Self Co', offer: '', link: '', color: 0, ref: own.code });
  assert.deepEqual((await self.refs()).joined, []);

  // the crew's ranking, for the special prize
  const rank = (await crew.call('GET', '/api/crew/referrals')).json.data as ReferralRow[];
  assert.equal(rank.length, 1);
  assert.deepEqual([rank[0]!.name, rank[0]!.points, rank[0]!.approved, rank[0]!.booths], ['Hana', REFERRAL_POINTS, 1, '7C17']);
  assert.equal((await user().call('GET', '/api/crew/referrals')).status, 401, 'crew only');
});
