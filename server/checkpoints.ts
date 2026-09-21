// The MIHAS mission: register at Lean X Digital (8H18A) and scan its QR to start; then scan the QR at the exhibitor
// booths you were given. Checkpoints are drawn at random from the booths the crew has approved, up to CHECKPOINTS each,
// and topped up as more exhibitors are approved. Every QR scan at an exhibitor's booth lands on that exhibitor's
// dashboard with the visitor's name, phone and email: agreeing to that is part of registering.
import { Game, GameError } from './game.js';
import type { BoothScan, CheckpointMission, XpEvent } from '../shared/types.js';
import { CHECKPOINTS } from '../shared/rules.js';

const IMAGE_MAX_BYTES = { logo: 400_000, photo: 900_000 } as const;
const IMAGE_TABLE = { logo: 'station_logos', photo: 'station_photos' } as const;
export type BoothImage = keyof typeof IMAGE_TABLE;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class Checkpoints {
  private approved: { at: number; rows: { station_id: string; company: string; owner_id: string }[] } = { at: -1e9, rows: [] };
  constructor(private g: Game) {}

  /** Booths the crew has approved, Lean X's own excepted. Cached briefly: every /me asks. */
  private async approvedBooths(): Promise<{ station_id: string; company: string; owner_id: string }[]> {
    const t = this.g.now();
    if (t - this.approved.at < 10_000) return this.approved.rows;
    const rows = await this.g.db.all<{ station_id: string; company: string; owner_id: string }>("SELECT station_id, company, owner_id FROM stations WHERE status = 'approved' AND station_id != ?", [this.g.level.hero.id]);
    this.approved = { at: t, rows };
    return rows;
  }
  forget() { this.approved.at = -1e9; }

  async started(id: string): Promise<boolean> {
    return !!(await this.g.db.get('SELECT 1 AS x FROM mission_starts WHERE player_id = ?', [id]));
  }

  /** The Lean X Digital QR, scanned at the booth. Registering comes first: the card is what exhibitors receive. */
  async start(id: string, t: number): Promise<XpEvent[]> {
    await this.g.requirePassport(id).catch(() => { throw new GameError('card', 'Register first: fill in your free card here at the booth, then scan the QR again'); });
    if (await this.started(id)) throw new GameError('dup', 'Your mission has already started — head to your checkpoints');
    await this.g.db.run('INSERT INTO mission_starts (player_id, started_at) VALUES (?,?) ON CONFLICT DO NOTHING', [id, t]);
    await this.topUp(id, t);
    const n = (await this.g.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM checkpoints WHERE player_id = ?', [id]))!.n;
    return [{ action: 'mission_start', xp: 0, target: 'Lean X Digital', note: n ? `${n} checkpoint${n > 1 ? 's are' : ' is'} on your map` : 'Checkpoints will appear as exhibitors join' }];
  }

  /** Give this player more checkpoints, at random, until they have CHECKPOINTS or there are no more approved booths. */
  private async topUp(id: string, t: number): Promise<void> {
    const have = await this.g.db.all<{ station_id: string }>('SELECT station_id FROM checkpoints WHERE player_id = ?', [id]);
    if (have.length >= CHECKPOINTS) return;
    const mine = new Set(have.map((r) => r.station_id)), pool = (await this.approvedBooths()).filter((r) => !mine.has(r.station_id) && r.owner_id !== id); // never your own booth
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    const add = pool.slice(0, CHECKPOINTS - have.length);
    if (add.length) await this.g.db.batch(add.map((r) => ['INSERT INTO checkpoints (player_id, station_id, assigned_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [id, r.station_id, t]]));
  }

  async view(id: string): Promise<CheckpointMission> {
    if (!(await this.started(id))) return { started: false, target: 0, checkpoints: [] };
    await this.topUp(id, this.g.now());
    const rows = await this.g.db.all<{ station_id: string; company: string | null; scanned_at: number | null }>(
      `SELECT c.station_id, s.company, c.scanned_at FROM checkpoints c LEFT JOIN stations s ON s.station_id = c.station_id
       WHERE c.player_id = ? AND (s.status IS NULL OR s.status != 'revoked') ORDER BY c.assigned_at, c.station_id`, [id]);
    const checkpoints = rows.map((r) => ({ stationId: r.station_id, company: r.company || this.g.stations.get(r.station_id)?.name || `Booth ${r.station_id}`, done: r.scanned_at != null }));
    return { started: true, target: Math.min(CHECKPOINTS, checkpoints.length), checkpoints };
  }

  /** A booth an exhibitor runs in the game (any status but revoked): its QR is a checkpoint scan. */
  async isExhibitorBooth(stationId: string): Promise<boolean> {
    return !!(await this.g.db.get("SELECT 1 AS x FROM stations WHERE station_id = ? AND status != 'revoked'", [stationId]));
  }

  async scannedBefore(id: string, stationId: string): Promise<boolean> {
    return !!(await this.g.db.get('SELECT 1 AS x FROM booth_scans WHERE player_id = ? AND station_id = ?', [id, stationId]));
  }

  /** A QR scan at an exhibitor's booth: onto their dashboard, and ticked off if it is one of this player's checkpoints. */
  async onScan(id: string, stationId: string, proof: string, t: number): Promise<XpEvent[]> {
    await this.g.db.run('INSERT INTO booth_scans (station_id, player_id, proof, created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING', [stationId, id, proof, t]);
    const hit = await this.g.db.get<{ scanned_at: number | null }>('SELECT scanned_at FROM checkpoints WHERE player_id = ? AND station_id = ?', [id, stationId]);
    if (!hit || hit.scanned_at != null) return [];
    await this.g.db.run('UPDATE checkpoints SET scanned_at = ? WHERE player_id = ? AND station_id = ?', [t, id, stationId]);
    const m = await this.view(id), done = m.checkpoints.filter((c) => c.done).length;
    const company = m.checkpoints.find((c) => c.stationId === stationId)?.company ?? stationId;
    return [{ action: 'checkpoint', xp: 0, target: company, note: done >= m.target ? 'All checkpoints done — claim your prize at Booth 8H18A' : `${done} of ${m.target} checkpoints` }];
  }

  /** The exhibitor's dashboard: everyone who scanned this booth's QR, newest first. Only the booth's owner may ask. */
  async scans(ownerId: string, stationId: string): Promise<BoothScan[]> {
    await this.owner(ownerId, stationId);
    const rows = await this.g.db.all<{ name: string; phone: string; email: string; company: string; at: number; checkpoint: number }>(
      `SELECT p.name, p.phone, p.email, p.company, b.created_at AS at,
              CASE WHEN EXISTS (SELECT 1 FROM checkpoints c WHERE c.player_id = b.player_id AND c.station_id = b.station_id) THEN 1 ELSE 0 END AS checkpoint
       FROM booth_scans b JOIN passports p ON p.player_id = b.player_id WHERE b.station_id = ? ORDER BY b.created_at DESC`, [stationId]);
    return rows.map((r) => ({ name: r.name, phone: r.phone, email: r.email, company: r.company, at: r.at, checkpoint: r.checkpoint === 1 }));
  }

  private async owner(ownerId: string, stationId: string): Promise<void> {
    const r = await this.g.db.get<{ owner_id: string; status: string }>('SELECT owner_id, status FROM stations WHERE station_id = ?', [stationId]);
    if (!r || r.owner_id !== ownerId || r.status === 'revoked') throw new GameError('not_host', 'This is not your booth', 403);
  }

  /** The exhibitor's own printable QR: the same signed booth code the crew prints. */
  async printableQr(ownerId: string, stationId: string): Promise<{ stationId: string; url: string }> {
    await this.owner(ownerId, stationId);
    return { stationId, url: `${this.g.publicOrigin}/?b=${encodeURIComponent(await this.g.beaconToken(stationId))}` };
  }

  /** The logo, or a photo of the real booth, as a data URL (the browser resizes it first). Shown in the world once the
   *  crew approves the booth: the logo on the counter and a sign over it, the photo on the back wall. */
  async setImage(ownerId: string, stationId: string, kind: BoothImage, dataUrl: unknown): Promise<void> {
    await this.owner(ownerId, stationId);
    const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
    if (!m || !LOGO_TYPES.includes(m[1]!)) throw new GameError(kind, 'Upload a PNG, JPG or WebP image');
    if (m[2]!.length * 0.75 > IMAGE_MAX_BYTES[kind]) throw new GameError(kind, 'That image is too large — try a smaller one');
    await this.g.db.run(`INSERT INTO ${IMAGE_TABLE[kind]} (station_id, mime, data, updated_at) VALUES (?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
      [stationId, m[1]!, m[2]!, this.g.now()]);
  }

  async image(stationId: string, kind: BoothImage): Promise<{ mime: string; bytes: Uint8Array } | null> {
    const r = await this.g.db.get<{ mime: string; data: string }>(`SELECT mime, data FROM ${IMAGE_TABLE[kind]} WHERE station_id = ?`, [stationId]);
    return r ? { mime: r.mime, bytes: Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0)) } : null;
  }

  /** Crew: how far along a visitor is, shown when they come to claim the prize. */
  async progress(id: string): Promise<{ started: boolean; done: number; target: number }> {
    const m = await this.view(id);
    return { started: m.started, done: m.checkpoints.filter((c) => c.done).length, target: m.target };
  }
}
