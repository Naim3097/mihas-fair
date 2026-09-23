// A company's booth team. Whoever registers the booth owns it; they invite colleagues with a link, and each colleague
// joins on their own phone — their own avatar, labelled with the company — and works the same booths: the dashboard, the
// QR, the visitors, the logo, photo and profile. Only the owner adds booths and manages the team. Everywhere the game asks
// "is this your booth?", it asks about the team's owner (ownerFor).
import { Game, GameError } from './game.js';
import { shortCode } from './crypto.js';
import type { BoothTeamPeek as TeamPeek, BoothTeamView as TeamView } from '../shared/types.js';
import { BOOTH_TEAM_MAX as TEAM_MAX } from '../shared/rules.js';

export class BoothTeam {
  constructor(private g: Game) {}

  /** The owner whose booths this player works: themselves, unless they joined someone's team. */
  async ownerFor(id: string): Promise<string> {
    return (await this.g.db.get<{ owner_id: string }>('SELECT owner_id FROM booth_team WHERE member_id = ?', [id]))?.owner_id ?? id;
  }

  async isMember(id: string): Promise<boolean> {
    return !!(await this.g.db.get('SELECT 1 AS x FROM booth_team WHERE member_id = ?', [id]));
  }

  /** Runs a booth: owns one, or is on a team. Exhibitors do not play the visitor mission or appear on its boards. */
  async isExhibitor(id: string): Promise<boolean> {
    return (await this.isMember(id)) || !!(await this.g.db.get("SELECT 1 AS x FROM stations WHERE owner_id = ? AND status != 'revoked'", [id]));
  }

  private async booths(ownerId: string): Promise<{ station_id: string; company: string }[]> {
    return this.g.db.all("SELECT station_id, company FROM stations WHERE owner_id = ? AND status != 'revoked' ORDER BY claimed_at", [ownerId]);
  }

  private async code(ownerId: string, fresh = false): Promise<string> {
    const have = await this.g.db.get<{ code: string }>('SELECT code FROM booth_team_codes WHERE owner_id = ?', [ownerId]);
    if (have && !fresh) return have.code;
    const code = shortCode(8);
    await this.g.db.run('INSERT INTO booth_team_codes (owner_id, code, created_at) VALUES (?,?,?) ON CONFLICT(owner_id) DO UPDATE SET code = excluded.code, created_at = excluded.created_at', [ownerId, code, this.g.now()]);
    return code;
  }

  /** The owner's invitation link: colleagues open it on their own phone and join the booth team. */
  async inviteLink(ownerId: string): Promise<string> { return `${this.g.publicOrigin}/?team=${await this.code(ownerId)}`; }

  async view(id: string): Promise<TeamView> {
    const owner = await this.ownerFor(id), booths = await this.booths(owner);
    if (!booths.length) throw new GameError('no_booth', 'Bring your booth online first', 404);
    const lead = await this.g.passportOf(owner);
    const members = await this.g.db.all<{ member_id: string; name: string; phone: string; email: string; joined_at: number }>(
      'SELECT t.member_id, p.name, p.phone, p.email, t.joined_at FROM booth_team t JOIN passports p ON p.player_id = t.member_id WHERE t.owner_id = ? ORDER BY t.joined_at', [owner]);
    return {
      owner: owner === id, company: booths[0]!.company, ownerName: lead?.name ?? '',
      link: owner === id ? await this.inviteLink(owner) : null,
      members: members.map((m) => ({ key: m.member_id, name: m.name, phone: m.phone, email: m.email, joinedAt: m.joined_at })),
    };
  }

  /** A new link: the old one stops working (people already on the team stay). */
  async resetLink(id: string): Promise<void> {
    if ((await this.ownerFor(id)) !== id || !(await this.booths(id)).length) throw new GameError('not_owner', 'Only the person who registered the booth can do that', 403);
    await this.code(id, true);
  }

  async remove(id: string, memberKey: string): Promise<void> {
    if ((await this.ownerFor(id)) !== id) throw new GameError('not_owner', 'Only the person who registered the booth can do that', 403);
    await this.g.db.run('DELETE FROM booth_team WHERE owner_id = ? AND member_id = ?', [id, String(memberKey)]);
  }

  async leave(id: string): Promise<void> {
    await this.g.db.run('DELETE FROM booth_team WHERE member_id = ?', [id]);
  }

  private async byCode(rawCode: unknown): Promise<string> {
    const r = await this.g.db.get<{ owner_id: string }>('SELECT owner_id FROM booth_team_codes WHERE code = ?', [String(rawCode ?? '').trim().toUpperCase()]);
    if (!r || !(await this.booths(r.owner_id)).length) throw new GameError('bad_team', 'This team link is not valid any more — ask for a new one', 404);
    return r.owner_id;
  }

  async peek(rawCode: unknown): Promise<TeamPeek> {
    const owner = await this.byCode(rawCode), booths = await this.booths(owner);
    return { company: booths[0]!.company, booths: booths.map((b) => b.station_id), ownerName: (await this.g.passportOf(owner))?.name ?? '' };
  }

  /** Joining a team: with a card (the owner sees who is on it), and not while running a booth or another team of one's own. */
  async join(id: string, rawCode: unknown): Promise<TeamPeek> {
    const owner = await this.byCode(rawCode);
    if (owner === id) throw new GameError('own_team', 'This is your own team link — send it to your colleagues');
    await this.g.requirePassport(id).catch(() => { throw new GameError('card', 'First fill in your card, so your team knows who you are'); });
    if ((await this.booths(id)).length) throw new GameError('has_booth', 'You already run a booth of your own — use a different phone, or ask the crew at 8H18A');
    const current = await this.g.db.get<{ owner_id: string }>('SELECT owner_id FROM booth_team WHERE member_id = ?', [id]);
    if (current && current.owner_id !== owner) throw new GameError('other_team', 'You are on another company’s team — leave it first from your dashboard');
    const n = (await this.g.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM booth_team WHERE owner_id = ?', [owner]))!.n;
    if (!current && n >= TEAM_MAX) throw new GameError('team_full', `This team is full (${TEAM_MAX} people)`);
    await this.g.db.batch([
      ['INSERT INTO booth_team (member_id, owner_id, joined_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', [id, owner, this.g.now()]],
      ["UPDATE players SET cls = 'exhibitor' WHERE id = ?", [id]],
    ]);
    return this.peek(rawCode);
  }
}
