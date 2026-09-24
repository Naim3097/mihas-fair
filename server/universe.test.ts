// One universe, on the server: the crew's switches for the newest parts (off on the live site until turned on, on
// everywhere else), and what crosses between the fair and the Playground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { testStores } from './test-db.js';
import type { LevelData, Me, TodayView } from '../shared/types.js';

const level = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'public/data/floor.json'), 'utf8')) as LevelData;

async function rig(o: { live?: boolean } = {}) {
  let now = Date.UTC(2026, 8, 24, 2, 0, 0);
  const services = buildServices({ ...(await testStores()), secret: 'test-secret', level, publicOrigin: 'http://x.test', now: () => now, live: o.live });
  const app = createApp({ ...services, crewPin: '4321', publicOrigin: 'http://x.test', secureCookies: false });
  const user = () => {
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      for (const sc of res.headers.getSetCookie()) { const kv = sc.split(';')[0]!, i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
      const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      return { status: res.status, json };
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
  return { user, crew, services, tick: (ms = 10_000) => { now += ms; } };
}

test('the newest switches start off on the live site and on everywhere else; the crew turns them on; the pages hear it', async () => {
  for (const live of [true, false]) {
    const r = await rig({ live }), u = r.user(); await u.register('Aisyah R', 'visitor');
    assert.deepEqual(((await u.call('GET', '/api/today')).json.data as TodayView).switches, { sky: !live, warp: !live }, live ? 'off on the live site' : 'on on a laptop');
    const flags = (await r.crew.call('GET', '/api/crew/flags')).json.data as Record<string, boolean>;
    assert.equal(flags.registration && flags.claims && flags.links && flags.holograms, true, 'the switches from before are on, as ever');
    assert.equal(flags.sky, !live); assert.equal(flags.warp, !live);
  }
  const r = await rig({ live: true }), u = r.user(); await u.register('Aisyah R', 'visitor');
  await r.crew.call('POST', '/api/crew/flags', { flag: 'sky', on: true });
  assert.deepEqual(((await u.call('GET', '/api/today')).json.data as TodayView).switches, { sky: true, warp: false }, 'the crew turned the sky on');
  await r.crew.call('POST', '/api/crew/flags', { flag: 'sky', on: false });
  assert.equal(((await u.call('GET', '/api/today')).json.data as TodayView).switches?.sky, false, 'and off again, at once');
});
