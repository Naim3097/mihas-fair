// The Playground's server side, beside the fair's rules and touching none of them: a run token per player, the run
// believed only within what the course can pay, the star balance and the gear bought, the best run, and the boards
// (today and all-time) cached like the fair's. The daily bridge to the fair's points is a switch, off unless the
// deployment turns it on. The client runs on its own store until these answer, behind the same interface.
import { Game, GameError, dayStart } from './game.js';
import type { Stmt } from './db/types.js';
import type { PlaygroundBest, PlaygroundBoardRow, PlaygroundGear, PlaygroundMe, PlaygroundRunInput, PlaygroundRunResult, XpEvent } from '../shared/types.js';
import { buildCourse } from '../src/playground/course.js';
import { GEAR } from '../src/playground/gear.js';
import { COMBO_MAX, DIAMOND, DIAMOND_STARS, GATE_BONUS_PER_S, O2_CAP, STAR } from '../src/playground/run.js';

const GEARS: PlaygroundGear[] = ['boots', 'skates', 'jetpack'];
/** A token opens one run; another is not issued within this gap (Again after a short run must still work), and one
 *  older than the life is no longer believed. */
export const TOKEN_GAP_MS = 15_000, TOKEN_TTL_MS = 10 * 60_000;
/** A run counts as finished only past this many seconds (the course cannot be crossed faster), and none lasts an hour. */
export const MIN_FINISH_S = 20, MAX_RUN_S = 3600;
/** What the first finished run of a day pays into the fair's ledger, when the bridge is on. */
export const DAILY_XP = 50, DAILY_ACTION = 'playground_daily';
const course = buildCourse();
const DIAMONDS = course.pickups.filter((k) => k.kind === 'diamond').length;
/** What the course holds: every star on every line, and the diamonds' stars. */
export const MAX_STARS = course.pickups.filter((k) => k.kind === 'star').length + DIAMONDS * DIAMOND_STARS;
/** The most `stars` can pay: every star at the top combo, every diamond, a full tank of air at the gate. */
export const maxScore = (stars: number): number => stars * STAR * COMBO_MAX + DIAMONDS * DIAMOND + O2_CAP * GATE_BONUS_PER_S;
const BOARD_TTL_MS = 15_000, BOARD_SIZE = 10;

interface StateRow { stars: number; unlocks: string; gear: string }
interface RunRow { gear: string; score: number; created_at: number }
interface TokenRow { player_id: string; created_at: number; used_at: number | null; credited: number }
type CachedRow = Omit<PlaygroundBoardRow, 'you'> & { id: string };

export class Playground {
  private boardCache = new Map<'today' | 'all', { at: number; rows: CachedRow[] }>();
  constructor(private g: Game, private opts: { daily: boolean } = { daily: false }) {}

  private async state(id: string): Promise<{ stars: number; unlocks: PlaygroundGear[]; gear: PlaygroundGear }> {
    const r = await this.g.db.get<StateRow>('SELECT stars, unlocks, gear FROM playground_state WHERE player_id = ?', [id]);
    if (!r) return { stars: 0, unlocks: ['boots'], gear: 'boots' };
    const unlocks = r.unlocks.split(',').filter((u): u is PlaygroundGear => GEARS.includes(u as PlaygroundGear));
    return { stars: r.stars, unlocks: unlocks.includes('boots') ? unlocks : ['boots', ...unlocks], gear: GEARS.includes(r.gear as PlaygroundGear) ? (r.gear as PlaygroundGear) : 'boots' };
  }
  private async best(id: string): Promise<PlaygroundBest | null> {
    const r = await this.g.db.get<RunRow>('SELECT gear, score, created_at FROM playground_runs WHERE player_id = ? AND finished = 1 ORDER BY score DESC, created_at LIMIT 1', [id]);
    return r ? { score: r.score, gear: r.gear as PlaygroundGear, at: r.created_at } : null;
  }
  async me(id: string): Promise<PlaygroundMe> {
    const s = await this.state(id), best = await this.best(id);
    const today = (await this.g.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM playground_runs WHERE player_id = ? AND created_at >= ?', [id, dayStart(this.g.now())]))?.n ?? 0;
    return { ...s, best, runsToday: Number(today) };
  }

  /** A token for the run about to start: none within the gap of the last one issued. */
  async start(id: string): Promise<{ token: string }> {
    const t = this.g.now();
    const last = await this.g.db.get<{ created_at: number }>('SELECT created_at FROM playground_tokens WHERE player_id = ? ORDER BY created_at DESC LIMIT 1', [id]);
    if (last && t - last.created_at < TOKEN_GAP_MS) throw new GameError('soon', 'One run at a time: a moment, then again', 429);
    const token = crypto.randomUUID();
    await this.g.db.run('INSERT INTO playground_tokens (token, player_id, created_at, used_at, credited) VALUES (?,?,?,NULL,0)', [token, id, t]);
    return { token };
  }

  /** The run against its token, or the part of it a tab going away sends (`partial`, which leaves the token open for
   *  the rest). What it picked up is credited once; what it says it scored is believed within the course's limits; a
   *  finished one may be the best and, with the bridge on, the day's first pays the fair's points. */
  async run(id: string, input: Partial<PlaygroundRunInput>): Promise<{ result: PlaygroundRunResult; events: XpEvent[] }> {
    const t = this.g.now(), token = typeof input.token === 'string' ? input.token : '';
    const tok = token ? await this.g.db.get<TokenRow>('SELECT player_id, created_at, used_at, credited FROM playground_tokens WHERE token = ?', [token]) : undefined;
    if (!tok || tok.player_id !== id || tok.used_at != null || t - tok.created_at > TOKEN_TTL_MS) throw new GameError('token', 'This run cannot be recorded: start again from the pad');
    const s = await this.state(id), gear = input.gear as PlaygroundGear;
    if (!GEARS.includes(gear) || !s.unlocks.includes(gear)) throw new GameError('gear', 'That gear is not yours');
    const n = (v: unknown, max: number) => { const x = Number(v); if (!Number.isInteger(x) || x < 0 || x > max) throw new GameError('bad_run', 'The run does not add up'); return x; };
    const stars = n(input.stars, MAX_STARS), score = n(input.score, maxScore(stars)), comboMax = Math.max(1, n(input.comboMax, COMBO_MAX)), seconds = n(input.seconds, MAX_RUN_S);
    const partial = input.partial === true, finished = input.finished === true && !partial;
    if (finished && seconds < MIN_FINISH_S) throw new GameError('bad_run', 'The run does not add up');
    const before = await this.best(id), delta = Math.max(0, stars - tok.credited), events: XpEvent[] = [];
    const stmts: Stmt[] = [
      ['UPDATE playground_tokens SET credited = credited + ?, used_at = ? WHERE token = ?', [delta, partial ? null : t, token]],
      ['INSERT INTO playground_runs (token, player_id, gear, score, stars, combo_max, seconds, finished, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET gear = excluded.gear, score = excluded.score, stars = excluded.stars, combo_max = excluded.combo_max, seconds = excluded.seconds, finished = excluded.finished, created_at = excluded.created_at', [token, id, gear, score, stars, comboMax, seconds, finished ? 1 : 0, t]],
      ['INSERT INTO playground_state (player_id, stars, unlocks, gear, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET stars = playground_state.stars + excluded.stars, gear = excluded.gear, updated_at = excluded.updated_at', [id, delta, 'boots', gear, t]],
    ];
    if (finished && this.opts.daily) {
      const paid = await this.g.db.get<{ x: number }>('SELECT 1 AS x FROM xp_ledger WHERE player_id = ? AND action = ? AND voided = 0 AND created_at >= ?', [id, DAILY_ACTION, dayStart(t)]);
      if (!paid) { stmts.push(...this.g.award(id, DAILY_ACTION, DAILY_XP, null, null, t)); events.push({ action: DAILY_ACTION, xp: DAILY_XP, note: 'The day\'s first run through the gate' }); }
    }
    await this.g.db.batch(stmts);
    const newBest = finished && (!before || score > before.score);
    return { result: { ...(await this.me(id)), newBest }, events };
  }

  /** Buy a gear with stars: refused when short, kept once bought. */
  async unlock(id: string, gear: string): Promise<PlaygroundMe> {
    if (!GEARS.includes(gear as PlaygroundGear) || gear === 'boots') throw new GameError('gear', 'No such gear');
    const g = gear as PlaygroundGear, s = await this.state(id), price = GEAR[g].price;
    if (s.unlocks.includes(g)) return this.me(id);
    if (s.stars < price) throw new GameError('short', `${price - s.stars} more stars for ${GEAR[g].name}`);
    await this.g.db.run('INSERT INTO playground_state (player_id, stars, unlocks, gear, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET stars = excluded.stars, unlocks = excluded.unlocks, gear = excluded.gear, updated_at = excluded.updated_at', [id, s.stars - price, [...s.unlocks, g].join(','), g, this.g.now()]);
    return this.me(id);
  }

  /** The ten best finished runs, one per player, today (from midnight, Malaysian time) or ever; the viewer marked. */
  async board(range: 'today' | 'all', viewer: string | null): Promise<PlaygroundBoardRow[]> {
    const t = this.g.now(), hit = this.boardCache.get(range);
    let rows = hit && t - hit.at < BOARD_TTL_MS ? hit.rows : null;
    if (!rows) {
      const since = range === 'today' ? dayStart(t) : 0;
      const tops = await this.g.db.all<{ player_id: string; score: number }>(`SELECT player_id, MAX(score) AS score FROM playground_runs WHERE finished = 1 AND created_at >= ? AND player_id NOT IN (SELECT player_id FROM bans) GROUP BY player_id ORDER BY score DESC LIMIT ${BOARD_SIZE}`, [since]);
      rows = [];
      for (const [i, r] of tops.entries()) {
        const run = await this.g.db.get<RunRow>('SELECT gear, score, created_at FROM playground_runs WHERE player_id = ? AND finished = 1 AND score = ? AND created_at >= ? ORDER BY created_at LIMIT 1', [r.player_id, r.score, since]);
        rows.push({ id: r.player_id, rank: i + 1, name: (await this.g.player(r.player_id)).callsign, gear: (run?.gear ?? 'boots') as PlaygroundGear, score: Number(r.score), at: run?.created_at ?? 0 });
      }
      this.boardCache.set(range, { at: t, rows });
    }
    return rows.map(({ id, ...r }) => ({ ...r, you: id === viewer ? true : undefined }));
  }
}
