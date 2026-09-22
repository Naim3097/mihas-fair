// What outlasts a run: the star balance, the gear bought, the best run, and the finished runs behind the boards. On
// this device for now (localStorage); the server when the backend has the endpoints, behind the same interface, so
// the engine and the sheets do not change when the switch is made.
import type { Gear } from './course';
import type { RunSummary } from './run';

export interface BestRun extends RunSummary { gear: Gear; at: number }
/** A finished run, as the boards list it. */
export interface BoardRun { score: number; gear: Gear; stars: number; comboMax: number; seconds: number; at: number }
/** One line of a board: a place, a name, the gear, the score; whether it is the viewer's, and their best. */
export interface BoardRow { rank: number; name: string; gear: Gear; score: number; at: number; you: boolean; best: boolean }
export type BoardRange = 'today' | 'all';
export interface PlaygroundState { stars: number; unlocks: Gear[]; best: BestRun | null; runs: number; gear: Gear; history: BoardRun[] }

export interface PlaygroundStore {
  /** true while the balance and the runs live on this device only */
  readonly local: boolean;
  get(): PlaygroundState;
  /** Stars bank the moment they are picked up. */
  addStars(n: number): void;
  /** Buy a gear if the balance allows; true when it is owned afterwards. */
  spend(gear: Gear, price: number): boolean;
  choose(gear: Gear): void;
  /** A finished run counts for the boards; any run counts as played. Returns whether it is a new best. */
  record(s: RunSummary, gear: Gear): boolean;
  /** The top ten, best first; `name` is what this device's own runs are listed as. */
  boards(range: BoardRange, name: string): Promise<BoardRow[]>;
}

const KEY = 'mx_playground', HISTORY = 50, TOP = 10;
const EMPTY: PlaygroundState = { stars: 0, unlocks: ['boots'], best: null, runs: 0, gear: 'boots', history: [] };

/** Midnight before `t`, on this device's clock. */
export const dayStart = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The top ten of a list of one player's runs, best first (earlier first among equals), the best of them marked. */
export function rankRuns(runs: BoardRun[], name: string, since = 0): BoardRow[] {
  const top = runs.filter((r) => r.at >= since).sort((a, b) => b.score - a.score || a.at - b.at).slice(0, TOP);
  const best = runs.reduce((m, r) => Math.max(m, r.score), -1);
  return top.map((r, i) => ({ rank: i + 1, name, gear: r.gear, score: r.score, at: r.at, you: true, best: r.score === best }));
}

export class LocalStore implements PlaygroundStore {
  readonly local = true;
  private state: PlaygroundState;
  constructor() { this.state = this.load(); }
  private load(): PlaygroundState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw) as Partial<PlaygroundState>; return { ...EMPTY, ...s, unlocks: Array.from(new Set(['boots', ...(s.unlocks ?? [])])) as Gear[], history: Array.isArray(s.history) ? s.history : [] }; }
    } catch { /* private mode, or something else wrote here */ }
    return { ...EMPTY, unlocks: ['boots'], history: [] };
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode: this visit only */ } }

  get(): PlaygroundState { return { ...this.state, unlocks: [...this.state.unlocks], history: [...this.state.history] }; }
  addStars(n: number) { this.state.stars += n; this.save(); }
  spend(gear: Gear, price: number): boolean {
    if (this.state.unlocks.includes(gear)) return true;
    if (this.state.stars < price) return false;
    this.state.stars -= price; this.state.unlocks.push(gear); this.save(); return true;
  }
  choose(gear: Gear) { if (this.state.unlocks.includes(gear)) { this.state.gear = gear; this.save(); } }
  record(s: RunSummary, gear: Gear): boolean {
    this.state.runs++;
    const finished = s.reason === 'gate', at = Date.now();
    if (finished) { this.state.history.push({ score: s.score, gear, stars: s.stars, comboMax: s.comboMax, seconds: s.seconds, at }); if (this.state.history.length > HISTORY) this.state.history.splice(0, this.state.history.length - HISTORY); }
    const best = finished && (!this.state.best || s.score > this.state.best.score);
    if (best) this.state.best = { ...s, gear, at };
    this.save(); return best;
  }
  boards(range: BoardRange, name: string): Promise<BoardRow[]> { return Promise.resolve(rankRuns(this.state.history, name, range === 'today' ? dayStart(Date.now()) : 0)); }
}
