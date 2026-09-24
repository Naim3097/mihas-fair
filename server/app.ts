import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { GameError } from './game.js';
import type { Services } from './wire.js';
import { renderPassport, renderVcard } from './passport-page.js';
import type { ApiErr, ApiOk, XpEvent } from '../shared/types.js';

/** Where session cookies live. Default: real HTTP cookies. The in-browser demo backend (src/demo) keeps its own jar,
 *  because a service worker is not allowed to put Set-Cookie on the responses it makes. */
export interface CookieIO { get(c: Context, name: string): string | undefined; set(c: Context, name: string, value: string, maxAgeS: number): void }
export interface AppDeps extends Services { crewPin: string; publicOrigin: string; secureCookies: boolean; cookies?: CookieIO }
type Vars = { Variables: { playerId: string } };

const YEAR = 365 * 24 * 3600;

/** Fixed-window limiter. Per-process; on Workers put Cloudflare rate-limiting rules in front as well. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, now = Date.now()) => {
    const h = hits.get(key);
    if (!h || now > h.reset) { hits.set(key, { n: 1, reset: now + windowMs }); if (hits.size > 50_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

/** Spreadsheet-safe CSV: quotes everything and neutralises formula prefixes. */
function toCsv(cols: string[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join('\r\n');
}
const csvHeaders = (name: string) => ({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` });

export function createApp({ game, stations, social, crews, venue, director, gc, ops, signer, ceritera, checkpoints, referrals, team, onboarding, playground, crewPin, publicOrigin, secureCookies, cookies: cookieIO }: AppDeps) {
  const app = new Hono<Vars>();
  const cookieOpts = { httpOnly: true, sameSite: 'Lax' as const, secure: secureCookies, path: '/' };
  const cookies: CookieIO = cookieIO ?? { get: (c, name) => getCookie(c, name), set: (c, name, value, maxAge) => setCookie(c, name, value, { ...cookieOpts, maxAge }) };
  const writeLimit = limiter(40, 60_000), pingLimit = limiter(90, 60_000), loginLimit = limiter(8, 10 * 60_000), guestLimit = limiter(30, 3600_000);
  const ip = (c: Context) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  const ok = async <T,>(c: Context<Vars>, data: T, events: XpEvent[] = [], withMe = true) =>
    c.json<ApiOk<T>>({ ok: true, data, events, me: withMe ? await game.me(c.get('playerId')) : undefined });
  const body = async (c: Context) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  app.onError((e, c) => {
    if (e instanceof GameError) return c.json<ApiErr>({ ok: false, error: e.message, code: e.code }, e.status as 400);
    console.error(e);
    return c.json<ApiErr>({ ok: false, error: 'Something went wrong on our side', code: 'server' }, 500);
  });

  /* ---- player session: signed HttpOnly cookie, guest account on first contact ---- */
  const player = new Hono<Vars>();
  player.use('*', async (c, next) => {
    let id = (await signer.verify(cookies.get(c, 'mx_s')))?.replace(/^p:/, '') ?? null;
    if (id && !(await game.exists(id))) id = null;
    if (!id) {
      if (!guestLimit(ip(c))) throw new GameError('rate', 'Too many new sessions from this network', 429);
      id = await game.createGuest();
      cookies.set(c, 'mx_s', await signer.sign(`p:${id}`), YEAR);
    }
    c.set('playerId', id);
    if (c.req.method !== 'GET' && c.req.path !== '/api/presence' && c.req.path !== '/api/host/presence' && !writeLimit(id)) throw new GameError('rate', 'Slow down a little', 429);
    if (c.req.method !== 'GET' && (await ops.isBanned(id))) throw new GameError('review', 'This player is under review — please see the crew at Booth 7E17', 403);
    await next();
  });
  const pid = (c: Context<Vars>) => c.get('playerId');

  player.get('/me', (c) => ok(c, null));
  player.post('/start', async (c) => { await game.start(pid(c), String((await body(c)).role)); return ok(c, null); });
  player.post('/avatar', async (c) => { await game.setAvatar(pid(c), (await body(c)).spec); return ok(c, null); });

  /* Ceritera, the library game: the six avatars, and this player's character */
  player.get('/ceritera/classes', (c) => ok(c, ceritera.classes(), [], false));
  player.get('/ceritera/character', async (c) => ok(c, await ceritera.character(pid(c)), [], false));
  player.post('/ceritera/character', async (c) => { const b = await body(c); return ok(c, await ceritera.create(pid(c), b.classKey, { name: b.name, replace: b.replace === true }), [], false); });
  player.post('/ceritera/xp', async (c) => { const b = await body(c); return ok(c, await ceritera.fight(pid(c), b.amount, b.detail), [], false); });
  player.post('/presence', async (c) => {
    if (!pingLimit(pid(c))) throw new GameError('rate', 'Too many updates', 429);
    const b = await body(c);
    const r = await game.ping(pid(c), { x: Number(b.x), y: Number(b.y), h: Number(b.h), pose: typeof b.pose === 'string' ? (b.pose as never) : undefined, deck: b.deck === true, sigma: Number(b.sigma), steps: Number(b.steps), kit: b.kit === 'skates' || b.kit === 'jetpack' ? b.kit : undefined, z: typeof b.z === 'number' ? b.z : undefined }, b.spawn === true);
    return ok(c, { holograms: (await ops.flags()).holograms ? r.holograms : [], online: r.online, deck: r.deck }, r.events, r.events.length > 0);
  });
  player.post('/stamp', async (c) => ok(c, null, await game.stamp(pid(c), (await body(c)) as never)));
  player.post('/passport', async (c) => { await ops.require('registration'); return ok(c, null, await game.issuePassport(pid(c), (await body(c)) as never)); });
  player.get('/flags', async (c) => ok(c, await ops.flags(), [], false));
  player.get('/boards', async (c) => { const k = c.req.query('board') ?? 'xp'; if (!['xp', 'today', 'explorer', 'connector', 'stations', 'companies'].includes(k)) throw new GameError('bad_board', 'Unknown board'); return ok(c, await ops.board(k as never, pid(c)), [], false); });
  player.get('/trust', async (c) => ok(c, await ops.trust(pid(c)), [], false));
  player.get('/team', async (c) => ok(c, await ops.team(pid(c)), [], false));
  player.post('/team/create', async (c) => ok(c, await ops.createTeam(pid(c), (await body(c)).name), [], false));
  player.post('/team/join', async (c) => ok(c, await ops.joinTeam(pid(c), (await body(c)).code), [], false));
  player.post('/team/leave', async (c) => { await ops.leaveTeam(pid(c)); return ok(c, null, [], false); });
  player.post('/event', async (c) => { const b = await body(c); await game.track(pid(c), String(b.name), b.props); return ok(c, null, [], false); });

  /* the Playground beside the X: a token per run, the run, the gear bought with stars, the boards */
  player.get('/playground/me', async (c) => ok(c, await playground.me(pid(c)), [], false));
  player.post('/playground/start', async (c) => ok(c, await playground.start(pid(c)), [], false));
  player.post('/playground/run', async (c) => { const r = await playground.run(pid(c), (await body(c)) as never); return ok(c, r.result, r.events, r.events.length > 0); });
  player.post('/playground/unlock', async (c) => ok(c, await playground.unlock(pid(c), String((await body(c)).gear)), [], false));
  player.post('/playground/gear', async (c) => ok(c, await playground.choose(pid(c), String((await body(c)).gear)), [], false));
  player.get('/playground/board', async (c) => ok(c, await playground.board(c.req.query('range') === 'all' ? 'all' : 'today', pid(c)), [], false));

  /* stations: claim, host, share */
  player.get('/stations', async (c) => ok(c, await stations.list(), [], false));
  player.post('/station/claim', async (c) => { await ops.require('claims'); return ok(c, null, await stations.claim(pid(c), (await body(c)) as never)); });
  player.post('/station/share', async (c) => { const b = await body(c); return ok(c, null, await stations.share(pid(c), String(b.stationId), b.fields)); });
  player.post('/station/unshare', async (c) => { await stations.revokeShare(pid(c), String((await body(c)).stationId)); return ok(c, null); });
  player.get('/host/stations', async (c) => ok(c, await stations.mine(pid(c)), [], false));
  /* the dashboard, while open, keeps its host standing at the booth in the game */
  player.post('/host/presence', async (c) => { if (!pingLimit(pid(c))) throw new GameError('rate', 'Too many updates', 429); return ok(c, await stations.atCounter(pid(c), String((await body(c)).station ?? '')), [], false); });
  player.get('/host/code', async (c) => ok(c, await stations.hostCode(pid(c), c.req.query('station') ?? ''), [], false));
  /* the exhibitor's dashboard: who scanned their QR, their printable QR, their logo */
  player.get('/host/scans', async (c) => ok(c, await checkpoints.scans(pid(c), c.req.query('station') ?? ''), [], false));
  player.get('/host/scans.csv', async (c) => {
    const station = c.req.query('station') ?? '', rows = await checkpoints.scans(pid(c), station);
    return c.body(toCsv(['name', 'phone', 'email', 'company', 'scanned_at', 'checkpoint'], rows.map((r) => ({ ...r, scanned_at: new Date(r.at).toISOString(), checkpoint: r.checkpoint ? 'yes' : '' }))), 200, csvHeaders(`visitors-${station.replace(/[^0-9A-Za-z]/g, "")}.csv`));
  });
  /* the booth team: colleagues join the owner's booths with a link, each on their own phone */
  player.get('/host/team', async (c) => ok(c, await team.view(pid(c)), [], false));
  player.post('/host/team/reset', async (c) => { await team.resetLink(pid(c)); return ok(c, await team.view(pid(c)), [], false); });
  player.post('/host/team/remove', async (c) => { await team.remove(pid(c), String((await body(c)).key ?? '')); return ok(c, await team.view(pid(c)), [], false); });
  player.post('/host/team/leave', async (c) => { await team.leave(pid(c)); return ok(c, null); });
  player.get('/booth-team/peek', async (c) => ok(c, await team.peek(c.req.query('code')), [], false));
  player.post('/booth-team/join', async (c) => ok(c, await team.join(pid(c), (await body(c)).code)));
  /* an exhibitor the crew registered at the counter opens their hand-over link: this phone becomes that account */
  player.get('/handoff/peek', async (c) => ok(c, await onboarding.peek(c.req.query('code')), [], false));
  player.post('/handoff', async (c) => {
    const { id, peek } = await onboarding.take((await body(c)).code);
    cookies.set(c, 'mx_s', await signer.sign(`p:${id}`), YEAR); c.set('playerId', id);
    return ok(c, peek);
  });
  player.get('/host/referrals', async (c) => ok(c, await referrals.view(pid(c)), [], false));
  player.get('/host/qr', async (c) => ok(c, await checkpoints.printableQr(pid(c), c.req.query('station') ?? ''), [], false));
  player.post('/station/logo', async (c) => { const b = await body(c); await checkpoints.setImage(pid(c), String(b.stationId ?? ''), 'logo', b.image); return ok(c, null, [], false); });
  player.post('/station/photo', async (c) => { const b = await body(c); await checkpoints.setImage(pid(c), String(b.stationId ?? ''), 'photo', b.image); return ok(c, null, [], false); });
  player.get('/host/leads', async (c) => ok(c, await stations.leads(pid(c), c.req.query('station') ?? ''), [], false));
  player.get('/host/leads.csv', async (c) => {
    const sid = c.req.query('station') ?? '', rows = await stations.leads(pid(c), sid);
    const csv = toCsv(['name', 'company', 'role', 'phone', 'email', 'verified', 'callsign', 'shared_at'], rows.map((r) => ({ ...r, verified: r.verified ? 'yes' : 'no', shared_at: new Date(r.at).toISOString() })));
    return c.body(csv, 200, csvHeaders(`leads-${sid.replace(/[^0-9A-Za-z]/g, '')}.csv`));
  });

  /* link-up + contact log */
  player.post('/link/prefs', async (c) => { await social.setPrefs(pid(c), (await body(c)).fields); return ok(c, null); });
  player.post('/link/code', async (c) => { await ops.require('links'); return ok(c, await social.linkCode(pid(c)), [], false); });
  player.post('/link/peek', async (c) => ok(c, await social.peek(pid(c), (await body(c)).code), [], false));
  player.post('/link', async (c) => { await ops.require('links'); const b = await body(c); return ok(c, null, await social.link(pid(c), b.code, b.fields)); });
  player.get('/contacts', async (c) => ok(c, await social.contacts(pid(c)), [], false));
  player.post('/contacts/note', async (c) => { const b = await body(c); await social.setNote(pid(c), b.key, b.note); return ok(c, null, [], false); });
  player.post('/contacts/revoke', async (c) => { await social.revokePerson(pid(c), String((await body(c)).key)); return ok(c, null, [], false); });

  player.get('/sectors', async (c) => ok(c, await crews.view(), [], false));

  /* presence engine: venue gate + invisibility. The fix is used for one distance check and discarded. */
  player.post('/hidden', async (c) => { await venue.setHidden(pid(c), (await body(c)).hidden === true); return ok(c, null); });

  /* what is special today: the booth of the day, set by the crew */
  player.get('/today', async (c) => ok(c, { drop: await ops.drop(pid(c)), online: await game.onlineNow() }, [], false));

  /* Mission Director (switched off) */
  player.get('/missions', async (c) => ok(c, { ...(await director.view(pid(c))), drop: await ops.drop(pid(c)) }, [], false));
  player.post('/missions/accept', async (c) => { await director.accept(pid(c), String((await body(c)).id)); return ok(c, await director.view(pid(c)), [], false); });
  player.post('/missions/abandon', async (c) => { await director.abandon(pid(c)); return ok(c, await director.view(pid(c)), [], false); });

  /* Ground Control co-op */
  player.get('/gc', async (c) => ok(c, await gc.view(pid(c)), [], false));
  player.post('/gc/join', async (c) => ok(c, await gc.join(pid(c)), [], false));
  player.post('/gc/leave', async (c) => { await gc.leave(pid(c)); return ok(c, await gc.view(pid(c)), [], false); });
  player.post('/gc/waypoint', async (c) => { const b = await body(c); await gc.waypoint(pid(c), Number(b.x), Number(b.y)); return ok(c, await gc.view(pid(c)), [], false); });

  /* ---- crew (booth staff): PIN → signed cookie ---- */
  const crew = new Hono();
  crew.post('/login', async (c) => {
    if (!loginLimit(ip(c))) throw new GameError('rate', 'Too many attempts — wait ten minutes', 429);
    if (String((await body(c)).pin) !== crewPin) throw new GameError('pin', 'Wrong PIN', 401);
    cookies.set(c, 'mx_crew', await signer.sign(`crew:${Date.now() + 14 * 3600_000}`), 14 * 3600);
    return c.json({ ok: true, data: null });
  });
  crew.use('*', async (c, next) => {
    const p = await signer.verify(cookies.get(c, 'mx_crew'));
    if (!p?.startsWith('crew:') || Number(p.slice(5)) < Date.now()) throw new GameError('crew_auth', 'Crew sign-in required', 401);
    await next();
  });
  crew.get('/check', (c) => c.json({ ok: true, data: null }));
  crew.post('/logout', (c) => { cookies.set(c, 'mx_crew', '', 0); return c.json({ ok: true, data: null }); });
  crew.get('/ticket', async (c) => c.json({ ok: true, data: await game.crewTicket(c.req.query('t') ?? '') }));
  crew.post('/dock', async (c) => c.json({ ok: true, data: await game.crewDock(String((await body(c)).t ?? '')) }));
  crew.get('/beacons', async (c) => c.json({ ok: true, data: await game.beacons() }));
  crew.get('/leads', async (c) => c.json({ ok: true, data: await game.leads() }));
  crew.get('/leads.csv', async (c) => c.body(
    toCsv(['name', 'company', 'role', 'phone', 'email', 'consent_marketing', 'callsign', 'cls', 'xp', 'stamps', 'links', 'docked_at', 'created_at'], await game.leads()),
    200, csvHeaders('mission-x-leads.csv')));
  crew.get('/stations', async (c) => c.json({ ok: true, data: await stations.crewList() }));

  /* live ops: review before any prize is announced, switches for a bad afternoon, today's drop, the big screen */
  crew.get('/review', async (c) => c.json({ ok: true, data: await ops.review((c.req.query('board') ?? 'today') as never) }));
  crew.get('/ledger', async (c) => c.json({ ok: true, data: await ops.ledger(c.req.query('callsign') ?? '') }));
  crew.post('/void', async (c) => { const b = await body(c); await ops.setVoided(Number(b.id), b.voided !== false); return c.json({ ok: true, data: null }); });
  crew.post('/ban', async (c) => { const b = await body(c); await ops.setBanned(String(b.callsign), b.banned !== false, b.reason); return c.json({ ok: true, data: null }); });
  crew.get('/flags', async (c) => c.json({ ok: true, data: await ops.flags() }));
  crew.post('/flags', async (c) => { const b = await body(c); await ops.setFlag(String(b.flag), b.on === true); return c.json({ ok: true, data: await ops.flags() }); });
  crew.get('/drop', async (c) => c.json({ ok: true, data: await ops.drop(null) }));
  crew.post('/drop', async (c) => { const b = await body(c); await ops.setDrop(b.stationId, b.title, b.bonus); return c.json({ ok: true, data: await ops.drop(null) }); });
  crew.get('/screen', async (c) => {
    const t = game.now(), dots = await game.presence.all(t, venue.hidden);
    return c.json({ ok: true, data: { dots, online: dots.length, totals: await ops.totals(), board: await ops.board('today', null), booths: await ops.board('stations', null), sectors: await crews.view(), storm: await director.stormView(), drop: await ops.drop(null), joinUrl: publicOrigin } });
  });
  crew.get('/referrals', async (c) => c.json({ ok: true, data: await referrals.ranking() }));
  crew.post('/stations/status', async (c) => { const b = await body(c); await stations.crewSetStatus(String(b.stationId), String(b.status)); return c.json({ ok: true, data: null }); });
  crew.post('/stations/prepare', async (c) => { const b = await body(c); await stations.crewPrepare(b.stationId, b.company); return c.json({ ok: true, data: null }); });
  crew.post('/stations/image', async (c) => { const b = await body(c); await checkpoints.crewSetImage(String(b.stationId ?? ''), b.kind === 'photo' ? 'photo' : 'logo', b.image); return c.json({ ok: true, data: null }); });
  /* registering an exhibitor at the counter: their card and booth, and the link that hands the account to them */
  crew.post('/register', async (c) => c.json({ ok: true, data: await onboarding.register((await body(c)) as never) }));
  crew.get('/registered', async (c) => c.json({ ok: true, data: await onboarding.list() }));

  // The pages ask this first: a healthy answer means "real backend"; anything else and they start the in-browser demo.
  // Registered before the player routes so that asking does not create a guest account.
  app.get('/api/healthz', (c) => c.json({ ok: true, data: 'live' }));
  // Exhibitors' logos, for their booths in the world. Versioned URLs (?v=), so they cache for good.
  for (const kind of ['logo', 'photo'] as const) app.get(`/api/${kind}/:id`, async (c) => {
    const l = await checkpoints.image(c.req.param('id'), kind);
    return l ? c.body(l.bytes as unknown as ArrayBuffer, 200, { 'content-type': l.mime, 'cache-control': 'public, max-age=31536000, immutable' }) : c.text('None', 404);
  });
  app.route('/api/crew', crew);
  app.route('/api', player);

  /* ---- public Passport pages ---- */
  app.get('/p/:slug', async (c) => {
    const p = await game.publicPassport(c.req.param('slug'));
    return p ? c.html(renderPassport(p, publicOrigin)) : c.text('Passport not found', 404);
  });
  app.get('/p/:slug/vcard', async (c) => {
    const p = await game.publicPassport(c.req.param('slug'));
    if (!p) return c.text('Passport not found', 404);
    return c.body(renderVcard(p, publicOrigin), 200, { 'content-type': 'text/vcard; charset=utf-8', 'content-disposition': `attachment; filename="${p.slug}.vcf"` });
  });

  app.get('/healthz', (c) => c.text('ok'));
  return app;
}
