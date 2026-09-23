// The second way an exhibitor gets in: the crew registers them at the counter. One form on the crew console makes the
// exhibitor's card and their booth (approved on the spot — the crew is looking at them), and prints a hand-over link.
// The exhibitor opens it on their own phone and that account, booth and all, becomes theirs. The first way, signing up
// in the game themselves, is untouched (stations.claim).
import { Game, GameError, cleanText } from './game.js';
import { shortCode } from './crypto.js';
import type { Stations } from './stations.js';
import type { BoothTeam } from './team.js';
import type { CrewRegisterInput, HandoffPeek, HandoffRow } from '../shared/types.js';
import { HANDOFF_TTL_MS } from '../shared/rules.js';

interface HandoffDb { station_id: string; owner_id: string; code: string; created_at: number; taken_at: number | null; company: string | null; status: string | null; name: string; phone: string; email: string }
const ROWS = `SELECT h.station_id, h.owner_id, h.code, h.created_at, h.taken_at, s.company, s.status, p.name, p.phone, p.email
              FROM booth_handoffs h JOIN passports p ON p.player_id = h.owner_id
              LEFT JOIN stations s ON s.station_id = h.station_id AND s.owner_id = h.owner_id`;

export class Onboarding {
  constructor(private g: Game, private stations: Stations, private team: BoothTeam) {}

  private url(code: string) { return `${this.g.publicOrigin}/?join=${code}`; }
  /** The crew hands out two links: the account (join) and, for colleagues, the booth team (team). */
  private async row(r: HandoffDb): Promise<HandoffRow> {
    return { stationId: r.station_id, company: r.company ?? '', name: r.name, phone: r.phone, email: r.email, code: r.code, url: this.url(r.code), teamUrl: await this.team.inviteLink(r.owner_id), createdAt: r.created_at, taken: r.taken_at != null, status: r.status === 'approved' || r.status === 'pending' || r.status === 'revoked' ? r.status : 'released' };
  }

  /** Crew: an exhibitor's card and booth in one go. The booth is approved — the crew has them in front of them. */
  async register(input: CrewRegisterInput): Promise<HandoffRow> {
    const stationId = cleanText(input.stationId, 8).toUpperCase(), booth = this.g.stations.get(stationId);
    if (!booth) throw new GameError('no_station', 'No booth with that number in Halls 6–8');
    if (booth.id === this.g.level.hero.id) throw new GameError('reserved', 'That one is ours — Lean X Digital');
    const live = await this.g.db.get<{ company: string; status: string }>('SELECT company, status FROM stations WHERE station_id = ?', [booth.id]);
    if (live && live.status !== 'revoked') throw new GameError('taken', `Booth ${booth.id} is already online as ${live.company}. Release it first in Booths if that is wrong.`, 409);
    if (live) throw new GameError('revoked', `Booth ${booth.id} was revoked — release it first in Booths`, 409);
    if (input.consent !== true) throw new GameError('consent', 'Tick that the exhibitor has agreed to the privacy notice');
    const company = cleanText(input.company, 80);
    if (company.length < 2) throw new GameError('company', 'Enter the company name on the booth');

    const id = await this.g.createGuest();
    await this.g.start(id, 'exhibitor');
    await this.g.issuePassport(id, { name: String(input.name ?? ''), company, role: String(input.role ?? ''), phone: String(input.phone ?? ''), email: String(input.email ?? ''), showContact: false, consentMarketing: false, consentNotice: true });
    await this.stations.claim(id, { stationId: booth.id, company, offer: String(input.offer ?? ''), link: String(input.link ?? ''), color: 0x1e9e6a });
    await this.stations.crewSetStatus(booth.id, 'approved');
    const code = shortCode(8), t = this.g.now();
    await this.g.db.run('INSERT INTO booth_handoffs (station_id, owner_id, code, created_at) VALUES (?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET owner_id = excluded.owner_id, code = excluded.code, created_at = excluded.created_at, taken_at = NULL', [booth.id, id, code, t]);
    return this.row((await this.g.db.get<HandoffDb>(`${ROWS} WHERE h.station_id = ?`, [booth.id]))!);
  }

  /** Crew: everyone registered this way, newest first, with their hand-over links. */
  async list(): Promise<HandoffRow[]> {
    const rows = await this.g.db.all<HandoffDb>(`${ROWS} ORDER BY h.created_at DESC`), out: HandoffRow[] = [];
    for (const r of rows) out.push(await this.row(r));
    return out;
  }

  private async byCode(rawCode: unknown): Promise<HandoffDb> {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const r = code ? await this.g.db.get<HandoffDb>(`${ROWS} WHERE h.code = ?`, [code]) : undefined;
    if (!r || r.status == null || r.status === 'revoked') throw new GameError('bad_handoff', 'This link is not valid any more — ask the crew at Booth 8H18A for a new one', 404);
    if (this.g.now() - r.created_at > HANDOFF_TTL_MS) throw new GameError('expired', 'This link has expired — ask the crew at Booth 8H18A for a new one', 410);
    return r;
  }

  async peek(rawCode: unknown): Promise<HandoffPeek> {
    const r = await this.byCode(rawCode);
    return { stationId: r.station_id, company: r.company ?? '', name: r.name, taken: r.taken_at != null };
  }

  /** The exhibitor opens the link: the crew-made account becomes this phone's. Returns the player to sign the session as. */
  async take(rawCode: unknown): Promise<{ id: string; peek: HandoffPeek }> {
    const r = await this.byCode(rawCode);
    await this.g.db.run('UPDATE booth_handoffs SET taken_at = COALESCE(taken_at, ?) WHERE code = ?', [this.g.now(), r.code]);
    return { id: r.owner_id, peek: { stationId: r.station_id, company: r.company ?? '', name: r.name, taken: true } };
  }
}
