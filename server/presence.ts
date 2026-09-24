import type { Hologram } from '../shared/types.js';
import { DECK_MAX_SPEED_MPS, MAX_SPEED_MPS, PRESENCE_LINGER_MS } from '../shared/rules.js';
import type { Db } from './db/types.js';

/** A ping this recent means the person is live: their position is current and the speed check applies. */
export const FRESH_MS = 15_000;
/** Quiet longer than this and the avatar is gone; until then it stands where the person last was. */
const LINGER_MS = PRESENCE_LINGER_MS;
/** How long a position this instance saw itself stands in for a database read (a ping every 2 s, or 12 s off site). */
const LAST_FRESH_MS = 13_000;
type Dot = { x: number; y: number; cls: Hologram['cls']; deck: boolean };

/** Who is where, right now. Two implementations: memory (one Node process) and database (serverless). */
export interface Presence {
  /** Returns the metres accepted, or null when the move is implausibly fast (the previous position is kept). */
  update(p: Hologram, now: number, isSpawn: boolean): Promise<number | null>;
  position(id: string, now: number): Promise<{ x: number; y: number } | null>;
  /** Everyone seen within LINGER_MS, nearest first: the live ones and the ones standing where they stopped.
   *  Others never get a real person's exact spot: deck positions are snapped to a 1.5 m lattice. Hidden players are omitted. */
  near(id: string, x: number, y: number, now: number, hidden: ReadonlySet<string>, radius?: number, limit?: number): Promise<Hologram[]>;
  /** Every fresh position, for the booth's big screen: crew colour and whether the person is really there — nothing else. */
  all(now: number, hidden: ReadonlySet<string>): Promise<Dot[]>;
  online(now: number): Promise<number>;
}

/** On deck the avatar follows a walking person, so the ceiling is walking pace, not joystick pace.
 *  Switching from free roam to deck is a legitimate jump (GPS puts the person where they really are); sustained deck
 *  movement is held to walking pace, plus the tighter of the two fixes' GPS uncertainty — a fix wobbles inside its
 *  circle, but the client reports its own sigma, so it only ever buys the smaller one. */
function tooFast(prev: { x: number; y: number; deck: boolean; sigma: number; t: number }, p: Hologram, now: number): { moved: number; refuse: boolean } {
  const dt = Math.max(0.25, (now - prev.t) / 1000), moved = Math.hypot(p.x - prev.x, p.y - prev.y);
  if (p.deck && !prev.deck) return { moved, refuse: false };
  if (p.deck) return { moved, refuse: moved > DECK_MAX_SPEED_MPS * dt + Math.min(prev.sigma, p.sigma) };
  return { moved, refuse: moved / dt > MAX_SPEED_MPS };
}
/** `live` is false for someone whose phone has gone quiet: they stand still, whatever pose their last ping carried. */
function publicView(e: Hologram, d: number, live: boolean): Hologram & { d: number } {
  const q = e.deck ? 1.5 : 0;
  // a phone gone quiet stands still on the floor: no pose held, nobody left hanging in the air
  return { id: e.id.slice(0, 8), callsign: e.callsign, cls: e.cls, x: q ? Math.round(e.x / q) * q : e.x, y: q ? Math.round(e.y / q) * q : e.y, h: e.h, av: e.av, pose: live ? e.pose || undefined : undefined, deck: e.deck, sigma: e.sigma, kit: e.kit || undefined, z: live ? e.z || 0 : 0, d };
}
const nearest = (list: (Hologram & { d: number })[], limit: number) => list.sort((a, b) => a.d - b.d).slice(0, limit).map(({ d: _d, ...h }) => h);

/** In-memory: correct and fast for a single Node process (local dev, a VM). */
export class PresenceStore implements Presence {
  private map = new Map<string, Hologram & { t: number }>();

  async update(p: Hologram, now: number, isSpawn: boolean) {
    const prev = this.map.get(p.id);
    let moved = 0;
    if (prev && !isSpawn && now - prev.t < 30_000) {
      const r = tooFast(prev, p, now); moved = r.moved;
      if (r.refuse) { prev.t = now; return null; }
    }
    this.map.set(p.id, { ...p, t: now });
    return moved;
  }
  async position(id: string, now: number) { const e = this.map.get(id); return e && now - e.t <= FRESH_MS ? { x: e.x, y: e.y } : null; }
  async near(id: string, x: number, y: number, now: number, hidden: ReadonlySet<string>, radius = 90, limit = 60) {
    const out: (Hologram & { d: number })[] = [];
    for (const [k, e] of this.map) {
      if (now - e.t > LINGER_MS) { this.map.delete(k); continue; }
      if (k === id || hidden.has(k)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= radius) out.push(publicView(e, d, now - e.t <= FRESH_MS));
    }
    return nearest(out, limit);
  }
  async all(now: number, hidden: ReadonlySet<string>) {
    const out: Dot[] = [];
    for (const [k, e] of this.map) if (now - e.t <= LINGER_MS && !hidden.has(k)) out.push({ x: +e.x.toFixed(1), y: +e.y.toFixed(1), cls: e.cls, deck: e.deck });
    return out;
  }
  async online(now: number) { let n = 0; for (const e of this.map.values()) if (now - e.t <= LINGER_MS) n++; return n; }
}

interface Row { player_id: string; callsign: string; cls: Hologram['cls']; pose: string; av: string; x: number; y: number; h: number; deck: number; sigma: number; kit: string; z: number; t: number }
const NOT_HIDDEN = 'player_id NOT IN (SELECT player_id FROM player_flags WHERE hidden = 1)';

/**
 * Database-backed: every request may land on a different serverless instance, so nothing can live in memory.
 * Costs a read and a write per ping — fine for a show-sized crowd; a Durable Object / Redis is the next step beyond that.
 * Invisibility is read from player_flags in SQL, so the in-memory `hidden` set is ignored here.
 */
export class DbPresence implements Presence {
  private count = { at: -1e9, n: 0 };
  /** The last position this instance accepted per player. A player's pings mostly land on the same warm instance, so the
   *  speed check needs no read; older than LAST_FRESH_MS (or unknown) and the database is asked. */
  private last = new Map<string, { x: number; y: number; deck: number; sigma: number; t: number }>();
  constructor(private db: Db) {}
  private remember(id: string, r: { x: number; y: number; deck: number; sigma: number; t: number }) { if (this.last.size > 50_000) this.last.clear(); this.last.set(id, r); }
  private async prev(id: string, now: number) {
    const l = this.last.get(id);
    if (l && now - l.t <= LAST_FRESH_MS) return l;
    return this.db.get<Row>('SELECT x, y, deck, sigma, t FROM presence WHERE player_id = ?', [id]);
  }

  private upsert(p: Hologram, now: number) {
    return this.db.run(
      `INSERT INTO presence (player_id, callsign, cls, pose, av, x, y, h, deck, sigma, kit, z, t) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(player_id) DO UPDATE SET callsign = excluded.callsign, cls = excluded.cls, pose = excluded.pose, av = excluded.av,
         x = excluded.x, y = excluded.y, h = excluded.h, deck = excluded.deck, sigma = excluded.sigma, kit = excluded.kit, z = excluded.z, t = excluded.t`,
      [p.id, p.callsign, p.cls, p.pose ?? '', p.av, p.x, p.y, p.h, p.deck ? 1 : 0, p.sigma, p.kit ?? '', p.z ?? 0, now]);
  }
  async update(p: Hologram, now: number, isSpawn: boolean) {
    const prev = await this.prev(p.id, now);
    let moved = 0;
    if (prev && !isSpawn && now - prev.t < 30_000) {
      const r = tooFast({ x: prev.x, y: prev.y, deck: prev.deck === 1, sigma: prev.sigma, t: prev.t }, p, now); moved = r.moved;
      if (r.refuse) { await this.db.run('UPDATE presence SET t = ? WHERE player_id = ?', [now, p.id]); this.remember(p.id, { ...prev, t: now }); return null; }
    }
    await this.upsert(p, now);
    this.remember(p.id, { x: p.x, y: p.y, deck: p.deck ? 1 : 0, sigma: p.sigma, t: now });
    return moved;
  }
  async position(id: string, now: number) {
    const l = this.last.get(id);
    if (l && now - l.t <= LAST_FRESH_MS) return { x: l.x, y: l.y };
    const e = await this.db.get<Row>('SELECT x, y FROM presence WHERE player_id = ? AND t >= ?', [id, now - FRESH_MS]);
    return e ? { x: e.x, y: e.y } : null;
  }
  async near(id: string, x: number, y: number, now: number, _hidden: ReadonlySet<string>, radius = 90, limit = 60) {
    const rows = await this.db.all<Row>(`SELECT * FROM presence WHERE t >= ? AND player_id != ? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ? AND ${NOT_HIDDEN} LIMIT 400`, [now - LINGER_MS, id, x - radius, x + radius, y - radius, y + radius]);
    const out = rows.map((e) => publicView({ id: e.player_id, callsign: e.callsign, cls: e.cls, av: e.av, pose: (e.pose || undefined) as Hologram['pose'], x: e.x, y: e.y, h: e.h, deck: e.deck === 1, sigma: e.sigma, kit: (e.kit || undefined) as Hologram['kit'], z: e.z ?? 0 }, Math.hypot(e.x - x, e.y - y), now - e.t <= FRESH_MS)).filter((e) => e.d <= radius);
    return nearest(out, limit);
  }
  async all(now: number, _hidden: ReadonlySet<string>) {
    const rows = await this.db.all<Row>(`SELECT x, y, cls, deck FROM presence WHERE t >= ? AND ${NOT_HIDDEN} LIMIT 2000`, [now - LINGER_MS]);
    return rows.map((e) => ({ x: +e.x.toFixed(1), y: +e.y.toFixed(1), cls: e.cls, deck: e.deck === 1 }));
  }
  async online(now: number) {
    if (now - this.count.at > 8000) this.count = { at: now, n: (await this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM presence WHERE t >= ?', [now - LINGER_MS]))?.n ?? 0 };
    return this.count.n;
  }
}
