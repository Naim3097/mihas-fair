// Serverless entry (Vercel). No disk, no shared memory: the database is Supabase Postgres and presence lives in it.
// Built once per warm instance; every misconfiguration turns into a readable JSON error instead of a blank 500.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { DbPresence } from './presence.js';
import { openPostgres } from './db/postgres.js';
import type { LevelData } from '../shared/types.js';

export class ConfigError extends Error {}
const env = (k: string) => process.env[k]?.trim() || undefined;

function publicOrigin(): string {
  if (env('PUBLIC_ORIGIN')) return env('PUBLIC_ORIGIN')!.replace(/\/$/, '');
  // production → the project's stable domain; previews → that deployment's own URL, so QR codes stay inside the preview
  const host = env('VERCEL_ENV') === 'production' ? env('VERCEL_PROJECT_PRODUCTION_URL') ?? env('VERCEL_URL') : env('VERCEL_URL');
  if (!host) throw new ConfigError('PUBLIC_ORIGIN is not set');
  return `https://${host}`;
}

const REQUIRED = ['DATABASE_URL', 'MX_SECRET', 'CREW_PIN'];
/** A preview deployment (a branch, not the show) runs the in-browser demo, every switch on: it never opens the live
 *  database, whatever the project's variables say, unless previews are meant to share it (PREVIEW_USES_DB=1). */
export const demoPreview = (): boolean => env('VERCEL_ENV') === 'preview' && env('PREVIEW_USES_DB') !== '1';

async function init(): Promise<Hono<never>> {
  if (demoPreview()) throw new ConfigError('This preview runs the demo in your browser: reload the page.');
  const missing = REQUIRED.filter((k) => !env(k));
  if (missing.length) throw new ConfigError(`Missing environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Add them in Vercel → Project → Settings → Environment Variables, then redeploy.`);
  if (env('MX_SECRET')!.length < 24) throw new ConfigError('MX_SECRET must be at least 24 random characters');

  const db = openPostgres(env('DATABASE_URL')!);
  if (env('MX_SKIP_MIGRATE') !== '1') await db.migrate(); // idempotent; one round trip per cold start
  const level = JSON.parse(readFileSync(join(process.cwd(), 'public/data/floor.json'), 'utf8')) as LevelData;
  const origin = publicOrigin();
  const services = buildServices({
    db, secret: env('MX_SECRET')!, level, publicOrigin: origin, presence: new DbPresence(db), playgroundDaily: env('PLAYGROUND_DAILY') === '1', live: true,
  });
  return createApp({ ...services, crewPin: env('CREW_PIN')!, publicOrigin: origin, secureCookies: true }) as unknown as Hono<never>;
}

let app: Promise<Hono<never>> | null = null;

export async function handle(req: Request): Promise<Response> {
  // The pages ask this before anything else. No database configured yet → say so calmly (no error, no log noise):
  // they start the in-browser demo instead (src/demo). With the variables set, the real app answers 'live'.
  if (new URL(req.url).pathname === '/api/healthz') {
    if (demoPreview()) return Response.json({ ok: true, data: 'demo', preview: true });
    const missing = REQUIRED.filter((k) => !env(k)); if (missing.length) return Response.json({ ok: true, data: 'demo', missing });
  }
  try {
    app ??= init();
    return await (await app).fetch(req);
  } catch (e) {
    app = null; // let the next request try again (e.g. after the env vars were added)
    console.error(e);
    const message = e instanceof ConfigError ? e.message : 'The station could not start. Check the function logs.';
    return Response.json({ ok: false, error: message, code: e instanceof ConfigError ? 'config' : 'server' }, { status: 500 });
  }
}
