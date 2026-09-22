// Presence engine, server side (Systems doc §3): on-site anchors (a real booth QR scan puts the player at that booth,
// and counts as "at MIHAS" for half an hour), walking XP, and invisibility. There is no GPS: everyone plays in the
// virtual hall, and a scan at the real booth is the only proof of being there.
import { Game, dayOf } from './game.js';
import type { XpEvent } from '../shared/types.js';
import { ONSITE_TTL_MS, WALK_XP_DAILY_CAP, WALK_XP_PER_M } from '../shared/rules.js';

export class Venue {
  readonly hidden = new Set<string>();
  /** Metres accepted on this instance and not yet written down. The database row holds the total and what was paid. */
  private unpaid = new Map<string, number>();

  constructor(private g: Game) {}

  async anchorOf(id: string): Promise<{ stationId: string; at: number } | null> {
    const a = await this.g.db.get<{ station_id: string; anchored_at: number }>('SELECT station_id, anchored_at FROM anchors WHERE player_id = ?', [id]);
    return a ? { stationId: a.station_id, at: a.anchored_at } : null;
  }

  /** On site = a scan at a real booth within the last half hour. Kept 20 s per instance; this instance's own anchors
   *  refresh it at once. */
  private onsite = new Map<string, { v: boolean; at: number }>();
  async isOnsite(id: string, t: number): Promise<boolean> {
    const c = this.onsite.get(id);
    if (c && t - c.at >= 0 && t - c.at < 20_000) return c.v;
    const a = await this.anchorOf(id), v = !!a && t - a.at <= ONSITE_TTL_MS;
    if (this.onsite.size > 50_000) this.onsite.clear();
    this.onsite.set(id, { v, at: t });
    return v;
  }

  /** An on-site proof at a station: remember it. (The avatar stays where the player walked it in the virtual hall.) */
  async anchor(id: string, stationId: string, t: number): Promise<void> {
    if (!this.g.stations.has(stationId)) return;
    await this.g.db.run('INSERT INTO anchors (player_id, station_id, anchored_at) VALUES (?,?,?) ON CONFLICT(player_id) DO UPDATE SET station_id = excluded.station_id, anchored_at = excluded.anchored_at', [id, stationId, t]);
    this.onsite.set(id, { v: true, at: t });
  }

  async isHidden(id: string): Promise<boolean> {
    const f = await this.g.db.get<{ hidden: number }>('SELECT hidden FROM player_flags WHERE player_id = ?', [id]);
    if (f?.hidden) this.hidden.add(id); else this.hidden.delete(id);
    return !!f?.hidden;
  }

  async setHidden(id: string, hidden: boolean): Promise<void> {
    await this.g.db.run('INSERT INTO player_flags (player_id, hidden) VALUES (?,?) ON CONFLICT(player_id) DO UPDATE SET hidden = excluded.hidden', [id, hidden ? 1 : 0]);
    if (hidden) this.hidden.add(id); else this.hidden.delete(id);
  }

  /** Real walking on deck earns 1 XP per 10 m, capped daily. Metres come from server-accepted deck movement only. */
  async walk(id: string, metres: number, t: number): Promise<XpEvent[]> {
    if (!this.g.features.explore || metres <= 0) return [];
    const pending = (this.unpaid.get(id) ?? 0) + metres;
    if (pending < 25) { this.unpaid.set(id, pending); return []; } // touch the database every 25 m, not every ping
    this.unpaid.delete(id);
    const day = dayOf(t), row = await this.g.db.get<{ metres: number; xp: number }>('SELECT metres, xp FROM walks WHERE player_id = ? AND day = ?', [id, day]);
    const total = (row?.metres ?? 0) + pending, paid = row?.xp ?? 0;
    const due = Math.min(WALK_XP_DAILY_CAP, Math.floor(total * WALK_XP_PER_M)) - paid, pay = due >= 5 || paid + due >= WALK_XP_DAILY_CAP ? Math.max(0, due) : 0; // pay in batches of 5+
    await this.g.db.batch([
      ['INSERT INTO walks (player_id, day, metres, xp) VALUES (?,?,?,?) ON CONFLICT(player_id, day) DO UPDATE SET metres = excluded.metres, xp = excluded.xp', [id, day, total, paid + pay]],
      ...(pay ? this.g.award(id, 'walk', pay, null, { metres: Math.round(total) }, t) : []),
    ]);
    return pay ? [{ action: 'walk', xp: pay, target: `${Math.round(total)} m on deck today` }] : [];
  }
}
