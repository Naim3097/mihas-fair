// What outlasts a run: the star balance, the gear bought, the best run. On this device for now (localStorage), the
// server when the backend has the endpoints; the interface does not change when it does.
import type { Gear } from './course';
import type { RunSummary } from './run';

export interface BestRun extends RunSummary { gear: Gear; at: number }
export interface PlaygroundState { stars: number; unlocks: Gear[]; best: BestRun | null; runs: number; gear: Gear }

const KEY = 'mx_playground';
const EMPTY: PlaygroundState = { stars: 0, unlocks: ['boots'], best: null, runs: 0, gear: 'boots' };

export class LocalStore {
  private state: PlaygroundState;
  constructor() { this.state = this.load(); }
  private load(): PlaygroundState {
    try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as Partial<PlaygroundState>; return { ...EMPTY, ...s, unlocks: Array.from(new Set(['boots', ...(s.unlocks ?? [])])) as Gear[] }; } } catch { /* private mode, or something else wrote here */ }
    return { ...EMPTY };
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode: this visit only */ } }

  get(): PlaygroundState { return { ...this.state, unlocks: [...this.state.unlocks] }; }
  /** Stars bank the moment they are picked up. */
  addStars(n: number) { this.state.stars += n; this.save(); }
  spend(gear: Gear, price: number): boolean {
    if (this.state.unlocks.includes(gear)) return true;
    if (this.state.stars < price) return false;
    this.state.stars -= price; this.state.unlocks.push(gear); this.save(); return true;
  }
  choose(gear: Gear) { if (this.state.unlocks.includes(gear)) { this.state.gear = gear; this.save(); } }
  /** A finished run counts for the boards; any run counts as played. Returns whether it is a new best. */
  record(s: RunSummary, gear: Gear): boolean {
    this.state.runs++;
    const best = s.reason === 'gate' && (!this.state.best || s.score > this.state.best.score);
    if (best) this.state.best = { ...s, gear, at: Date.now() };
    this.save(); return best;
  }
}
