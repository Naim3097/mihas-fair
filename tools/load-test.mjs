// Load test: simulated players against a running API (never production). Usage:
//   LOAD_BASE=http://localhost:8790 node tools/load-test.mjs 300 600 1000
// Start the API the way Vercel runs it (server/vercel.ts, presence in the database) against a throwaway Postgres.
// Simulated players against the production API code. Each: its own session and IP, joins as a visitor and pings its
// position every 3 s (everyone sees everyone); all poll the booth list every 20 s like the real client. Reports latency percentiles, errors and throughput per stage.
const BASE = process.env.LOAD_BASE ?? 'http://localhost:8790';
const stages = process.argv.slice(2).map(Number); // e.g. 300 600 1000
const STAGE_S = 60, EVERY_MS = 3000;
const lat = [], errs = new Map(); let reqs = 0;
async function req(p, m, path, body) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + path, { method: m, headers: { 'content-type': 'application/json', 'x-forwarded-for': p.ip, cookie: p.cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie(); if (sc.length) p.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const j = await r.json(); reqs++; lat.push(performance.now() - t0);
    if (!j.ok) errs.set(`${r.status} ${j.code}`, (errs.get(`${r.status} ${j.code}`) ?? 0) + 1);
    return j;
  } catch (e) { reqs++; errs.set('network ' + (e.cause?.code ?? e.message), (errs.get('network ' + (e.cause?.code ?? e.message)) ?? 0) + 1); lat.push(performance.now() - t0); }
}
const players = []; let stop = false;
async function player(i) {
  const p = { ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, cookie: '' };
  players.push(p);
  await req(p, 'GET', '/api/me'); await req(p, 'POST', '/api/start', { role: 'visitor' });
  let x = 30 + Math.random() * 140, y = 40 + Math.random() * 60, lastPoll = 0;
  const every = EVERY_MS;
  await new Promise((r) => setTimeout(r, Math.random() * every)); // spread out, as real phones are
  while (!stop) {
    const t = Date.now();
    x += (Math.random() - 0.5) * 8; y += (Math.random() - 0.5) * 8;
    x = Math.min(180, Math.max(10, x)); y = Math.min(105, Math.max(40, y));
    await req(p, 'POST', '/api/presence', { x, y, h: 0 });
    if (t - lastPoll > 20000) { lastPoll = t; await req(p, 'GET', '/api/stations'); await req(p, 'GET', '/api/today'); }
    await new Promise((r) => setTimeout(r, Math.max(0, every - (Date.now() - t))));
  }
}
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
let n = 0; const runs = [];
for (const target of stages) {
  while (n < target) runs.push(player(n++)), await new Promise((r) => setTimeout(r, 4)); // ramp up
  await new Promise((r) => setTimeout(r, 15000)); // settle
  lat.length = 0; errs.clear(); reqs = 0;
  const t0 = Date.now(); await new Promise((r) => setTimeout(r, STAGE_S * 1000));
  const s = [...lat].sort((a, b) => a - b), secs = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ players: target, reqPerSec: +(reqs / secs).toFixed(1), p50: +pct(s, 0.5).toFixed(1), p95: +pct(s, 0.95).toFixed(1), p99: +pct(s, 0.99).toFixed(1), max: +(s.at(-1) ?? 0).toFixed(1), errors: Object.fromEntries(errs) }));
}
stop = true; await Promise.race([Promise.all(runs), new Promise((r) => setTimeout(r, 15000))]); process.exit(0);
