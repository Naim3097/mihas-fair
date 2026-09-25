// The serverless entry's one rule for previews: a branch's deployment runs the in-browser demo and never opens the
// live database, even when the project's variables would let it; the show's own deployment is as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoPreview, handle } from './vercel.js';

const vars = { DATABASE_URL: 'postgres://nobody:never@127.0.0.1:1/live', MX_SECRET: 'x'.repeat(32), CREW_PIN: '9999' };
function withEnv(e: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before = Object.fromEntries(Object.keys(e).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(e)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  return fn().finally(() => { for (const [k, v] of Object.entries(before)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
}
const ask = async (path: string) => (await handle(new Request(`https://branch.example.vercel.app${path}`))).json();

test('a preview runs the demo in the browser and never opens the database, whatever the variables say', () => withEnv({ ...vars, VERCEL_ENV: 'preview', PREVIEW_USES_DB: undefined }, async () => {
  assert.equal(demoPreview(), true);
  assert.deepEqual(await ask('/api/healthz'), { ok: true, data: 'demo', preview: true });
  const r = await ask('/api/today');
  assert.equal(r.ok, false); assert.equal(r.code, 'config', 'refused before any database is opened');
}));

test('the show\'s deployment, and a preview told to share the database, are as they were', () => withEnv({ ...vars, VERCEL_ENV: 'production', PREVIEW_USES_DB: undefined }, async () => {
  assert.equal(demoPreview(), false);
  await withEnv({ VERCEL_ENV: 'preview', PREVIEW_USES_DB: '1' }, async () => assert.equal(demoPreview(), false));
  await withEnv({ DATABASE_URL: undefined }, async () => assert.deepEqual(await ask('/api/healthz'), { ok: true, data: 'demo', missing: ['DATABASE_URL'] }));
}));
