// Exhibitors bring in exhibitors. Each exhibitor has one code (and a link carrying it); an exhibitor who registers their
// first booth with it becomes theirs, once. Every referred exhibitor the crew has approved is worth REFERRAL_POINTS to
// whoever invited them — computed from the stations table, so a booth revoked later stops counting.
import { Game } from './game.js';
import type { BoothTeam } from './team.js';
import { shortCode } from './crypto.js';
import type { ReferralRow, ReferralView } from '../shared/types.js';
import { REFERRAL_POINTS } from '../shared/rules.js';

export class Referrals {
  constructor(private g: Game, private team: BoothTeam) {}

  /** This exhibitor's code, made the first time they ask for it. */
  async code(id: string): Promise<string> {
    const have = await this.g.db.get<{ code: string }>('SELECT code FROM referral_codes WHERE player_id = ?', [id]);
    if (have) return have.code;
    for (let i = 0; i < 5; i++) {
      const code = shortCode(6);
      await this.g.db.run('INSERT INTO referral_codes (code, player_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [code, id, this.g.now()]);
      const got = await this.g.db.get<{ code: string }>('SELECT code FROM referral_codes WHERE player_id = ?', [id]);
      if (got) return got.code;
    }
    throw new Error('Could not make a referral code');
  }

  /** Called when an exhibitor brings their first booth online: whose invitation was it? Unknown codes and one's own are ignored. */
  async record(referredId: string, rawCode: unknown): Promise<void> {
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return;
    const r = await this.g.db.get<{ player_id: string }>('SELECT player_id FROM referral_codes WHERE code = ?', [code]);
    if (!r || r.player_id === referredId) return;
    await this.g.db.run('INSERT INTO referrals (referred_id, referrer_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [referredId, r.player_id, this.g.now()]);
  }

  /** The company's invitations: every member of a booth team shares the owner's code and points. */
  async view(member: string): Promise<ReferralView> {
    const id = await this.team.ownerFor(member), code = await this.code(id);
    const rows = await this.g.db.all<{ company: string; booth: string; approved: number }>(
      `SELECT MIN(s.company) AS company, MIN(s.station_id) AS booth, MAX(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END) AS approved
       FROM referrals r JOIN stations s ON s.owner_id = r.referred_id AND s.status != 'revoked'
       WHERE r.referrer_id = ? GROUP BY r.referred_id ORDER BY MIN(r.created_at)`, [id]);
    const joined = rows.map((r) => ({ company: r.company, booth: r.booth, approved: r.approved === 1 }));
    return { code, url: `${this.g.publicOrigin}/?ref=${code}`, points: joined.filter((j) => j.approved).length * REFERRAL_POINTS, joined };
  }

  /** The crew's ranking, for the special prize: most approved referrals first. */
  async ranking(): Promise<ReferralRow[]> {
    const rows = await this.g.db.all<{ id: string; name: string; company: string; phone: string; email: string; approved: number; pending: number }>(
      `SELECT r.referrer_id AS id, p.name, p.company, p.phone, p.email,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM stations s WHERE s.owner_id = r.referred_id AND s.status = 'approved') THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM stations s WHERE s.owner_id = r.referred_id AND s.status = 'approved')
                        AND EXISTS (SELECT 1 FROM stations s WHERE s.owner_id = r.referred_id AND s.status = 'pending') THEN 1 ELSE 0 END) AS pending
       FROM referrals r JOIN passports p ON p.player_id = r.referrer_id
       GROUP BY r.referrer_id, p.name, p.company, p.phone, p.email`);
    const booths = new Map<string, string[]>();
    for (const b of await this.g.db.all<{ owner_id: string; station_id: string }>("SELECT owner_id, station_id FROM stations WHERE status != 'revoked' ORDER BY station_id"))
      (booths.get(b.owner_id) ?? booths.set(b.owner_id, []).get(b.owner_id)!).push(b.station_id);
    return rows
      .map(({ id, ...r }) => ({ ...r, booths: (booths.get(id) ?? []).join(', '), points: r.approved * REFERRAL_POINTS }))
      .sort((a, b) => b.points - a.points || b.pending - a.pending);
  }
}
