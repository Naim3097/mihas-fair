// Local / single-server entry. Serves the API, and the built client from dist/ when present.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { buildServices } from './wire.js';
import { openNodeDb } from './db/sqlite-node.js';
import { openPostgres } from './db/postgres.js';
import { SCHEMA } from './db/schema.js';
import type { LevelData } from '../shared/types.js';

const root = resolve(import.meta.dirname, '..');
const prod = process.env.NODE_ENV === 'production';
// Dev tools often export PORT for the *web* server, so the API only honours PORT in production.
const PORT = Number(process.env.API_PORT ?? (prod ? process.env.PORT : undefined) ?? 8787);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';

const secret = process.env.MX_SECRET ?? 'dev-only-secret-change-me';
const crewPin = process.env.CREW_PIN ?? '2026';
if (prod && (!process.env.MX_SECRET || !process.env.CREW_PIN)) throw new Error('MX_SECRET and CREW_PIN must be set in production');
if (!prod) console.warn(`[mission-x] dev mode — default secret, crew PIN ${crewPin}`);

const level = JSON.parse(readFileSync(resolve(root, 'public/data/floor.json'), 'utf8')) as LevelData;
// DATABASE_URL → Postgres (e.g. the Supabase project); otherwise a local SQLite file.
const pg = process.env.DATABASE_URL ? openPostgres(process.env.DATABASE_URL) : null;
if (pg) await pg.migrate();
const db = pg ?? openNodeDb(process.env.DB_FILE ?? resolve(root, 'data/mission-x.db'), SCHEMA);
const app = createApp({ ...buildServices({ db, secret, level, publicOrigin: PUBLIC_ORIGIN, playgroundDaily: process.env.PLAYGROUND_DAILY === '1' }), crewPin, publicOrigin: PUBLIC_ORIGIN, secureCookies: prod });

if (existsSync(resolve(root, 'dist/index.html'))) {
  app.get('/fair', (c) => c.redirect('/')); // the fair is the root page; the old address still works
  app.use('/*', serveStatic({ root: './dist' }));
}

serve({ fetch: app.fetch, port: PORT }, (i) => console.log(`[mission-x] api on http://localhost:${i.port} · ${level.booths.length} stations · ${pg ? 'postgres' : 'sqlite'} · origin ${PUBLIC_ORIGIN}`));
