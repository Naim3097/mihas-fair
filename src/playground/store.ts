// What outlasts a run: the star balance, the gear bought, the best run of each orbit, and the finished runs behind the
// boards. On this device for now (localStorage); the server when the backend has the endpoints, behind the same
// interface, so the engine and the sheets do not change when the switch is made.
import type { PlaygroundMe, PlaygroundOrbit, PlaygroundRunInput } from '../../shared/types';
import type { Item } from '../../shared/playground';
import { ApiError, api } from '../net/api';
import type { Gear } from './course';
import type { RunSummary } from './run';
import { pgBalance, pgBest, pgBest2, pgGear, pgUnlocks } from './state';

/** The course as it was (1), or awake: its tiles moving by a seed each run (2). */
export type Orbit = PlaygroundOrbit;
/** What a player can own: the kits, worn; and Warp, never worn (a ride across the fair, used there). */
export type Unlock = Gear | Item;
const KITS: readonly Gear[] = ['boots', 'skates', 'jetpack'];
export const isKit = (u: Unlock): u is Gear => KITS.includes(u as Gear);
/** The kits among what is owned: what the chip switches between, and what is worn. */
export const kitsOf = (u: readonly Unlock[]): Gear[] => u.filter(isKit);
export interface BestRun extends RunSummary { gear: Gear; at: number }
/** A finished run, as the boards list it (no orbit: Orbit 1, as every run was before Orbit 2). */
export interface BoardRun { score: number; gear: Gear; stars: number; comboMax: number; seconds: number; at: number; orbit?: Orbit }
/** One line of a board: a place, a name, the gear, the score; whether it is the viewer's, and their best. */
export interface BoardRow { rank: number; name: string; gear: Gear; score: number; at: number; you: boolean; best: boolean }
export type BoardRange = 'today' | 'all';
/** `best`: Orbit 1's; `best2`: Orbit 2's; `orbit`: the one chosen on the pad. */
export interface PlaygroundState { stars: number; unlocks: Unlock[]; best: BestRun | null; best2: BestRun | null; runs: number; gear: Gear; history: BoardRun[]; orbit: Orbit }

export interface PlaygroundStore {
  /** true while the balance and the runs live on this device only */
  readonly local: boolean;
  get(): PlaygroundState;
  /** Stars bank the moment they are picked up. */
  addStars(n: number): void;
  /** Buy a kit (or Warp) if the balance allows; true when it is owned afterwards. */
  spend(what: Unlock, price: number): boolean;
  choose(gear: Gear): void;
  /** The orbit to play, chosen on the pad (this device's choice). */
  chooseOrbit(orbit: Orbit): void;
  /** Ask again what counts (the fair pays stars too: a card left at an exhibitor's booth); nothing for a local store. */
  refresh(): void;
  /** A finished run counts for its orbit's boards; any run counts as played. Returns whether it is its orbit's new best.
   *  `seed`: the seed Orbit 2's tiles moved by. */
  record(s: RunSummary, gear: Gear, orbit?: Orbit, seed?: number): boolean;
  /** An orbit's top ten, best first; `name` is what this device's own runs are listed as. */
  boards(range: BoardRange, name: string, orbit?: Orbit): Promise<BoardRow[]>;
  /** A run is starting: the server's store asks for its token. */
  beginRun(): void;
  /** The tab is going away mid-run: the server's store sends what there is so far. */
  flush(s: RunSummary, gear: Gear, orbit?: Orbit, seed?: number): void;
  /** Whenever the store changes (a pickup, a purchase, a choice, the server's word): both worlds listen. Returns the
   *  way to stop listening. The store also keeps the interface's signals current itself. */
  onChange(fn: () => void): () => void;
}

const KEY = 'mx_playground', HISTORY = 50, TOP = 10;
const EMPTY: PlaygroundState = { stars: 0, unlocks: ['boots'], best: null, best2: null, runs: 0, gear: 'boots', history: [], orbit: 1 };

const SEEN_KEY = 'mx_orbit_seen', SEEN_MAX = 90;
/** The movements this device has met lately on Orbit 2, oldest first: the next run's plan draws others first. */
export function seenMovements(): Set<string> {
  try { const a: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []); } catch { return new Set(); }
}
/** A run's movements met: remembered, newest last, the oldest let go past the last six runs or so. */
export function rememberMovements(ids: readonly string[]) {
  try { const keep = [...seenMovements()].filter((x) => !ids.includes(x)).concat(ids).slice(-SEEN_MAX); localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); } catch { /* private mode: this visit only */ }
}

/** Midnight before `t`, on this device's clock. */
export const dayStart = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The top ten of a list of one player's runs on an orbit, best first (earlier first among equals), the best of them marked. */
export function rankRuns(runs: BoardRun[], name: string, since = 0, orbit: Orbit = 1): BoardRow[] {
  const mine = runs.filter((r) => (r.orbit ?? 1) === orbit);
  const top = mine.filter((r) => r.at >= since).sort((a, b) => b.score - a.score || a.at - b.at).slice(0, TOP);
  const best = mine.reduce((m, r) => Math.max(m, r.score), -1);
  return top.map((r, i) => ({ rank: i + 1, name, gear: r.gear, score: r.score, at: r.at, you: true, best: r.score === best }));
}

export class LocalStore implements PlaygroundStore {
  readonly local = true;
  private subs = new Set<() => void>();
  private state: PlaygroundState;
  constructor() { this.state = this.load(); this.publish(); }
  onChange(fn: () => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  /** The interface's signals follow the store; then whoever listens. */
  private publish() {
    const s = this.state;
    if (pgBalance.value !== s.stars) pgBalance.value = s.stars;
    if (pgUnlocks.value.join() !== s.unlocks.join()) pgUnlocks.value = [...s.unlocks];
    if (pgGear.value !== s.gear) pgGear.value = s.gear;
    const best = s.best?.score ?? null; if (pgBest.value !== best) pgBest.value = best;
    const best2 = s.best2?.score ?? null; if (pgBest2.value !== best2) pgBest2.value = best2;
  }
  private changed() { this.publish(); for (const f of [...this.subs]) f(); }
  private load(): PlaygroundState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw) as Partial<PlaygroundState>; return { ...EMPTY, ...s, unlocks: Array.from(new Set(['boots', ...(s.unlocks ?? [])])) as Unlock[], history: Array.isArray(s.history) ? s.history : [], orbit: s.orbit === 2 ? 2 : 1, gear: KITS.includes(s.gear as Gear) ? s.gear! : 'boots' }; }
    } catch { /* private mode, or something else wrote here */ }
    return { ...EMPTY, unlocks: ['boots'], history: [] };
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode: this visit only */ } }

  get(): PlaygroundState { return { ...this.state, unlocks: [...this.state.unlocks], history: [...this.state.history] }; }
  addStars(n: number) { this.state.stars += n; this.save(); this.changed(); }
  spend(what: Unlock, price: number): boolean {
    if (this.state.unlocks.includes(what)) return true;
    if (this.state.stars < price) return false;
    this.state.stars -= price; this.state.unlocks.push(what); this.save(); this.changed(); return true;
  }
  choose(gear: Gear) { if (isKit(gear) && this.state.unlocks.includes(gear) && this.state.gear !== gear) { this.state.gear = gear; this.save(); this.changed(); } } // only a kit is worn
  chooseOrbit(orbit: Orbit) { if (this.state.orbit !== orbit) { this.state.orbit = orbit; this.save(); this.changed(); } }
  refresh() { /* this device is all there is */ }
  record(s: RunSummary, gear: Gear, orbit: Orbit = 1, _seed?: number): boolean { // the seed is the server's to keep
    this.state.runs++;
    const finished = s.reason === 'gate', at = Date.now(), key = orbit === 2 ? 'best2' : 'best', was = this.state[key];
    if (finished) { this.state.history.push({ score: s.score, gear, stars: s.stars, comboMax: s.comboMax, seconds: s.seconds, at, ...(orbit === 2 ? { orbit } : {}) }); if (this.state.history.length > HISTORY) this.state.history.splice(0, this.state.history.length - HISTORY); }
    const best = finished && (!was || s.score > was.score);
    if (best) this.state[key] = { ...s, gear, at };
    this.save(); this.changed(); return best;
  }
  boards(range: BoardRange, name: string, orbit: Orbit = 1): Promise<BoardRow[]> { return Promise.resolve(rankRuns(this.state.history, name, range === 'today' ? dayStart(Date.now()) : 0, orbit)); }
  beginRun() { /* nothing to ask for */ }
  flush() { /* the stars are banked already */ }
  /** What the server says, taken over what this device had. */
  adopt(p: Partial<PlaygroundState>) { this.state = { ...this.state, ...p, unlocks: p.unlocks ? [...p.unlocks] : this.state.unlocks }; this.save(); this.changed(); }
}

/** The store on the server, with the local one as its cache: reads are instant from the cache, writes go out and the
 *  server's answer corrects the cache; a run posts against its token at its end, or in part from a tab going away, and
 *  what could not be posted waits for the next chance. The balance the server holds is the one that counts. */
export class ApiStore implements PlaygroundStore {
  readonly local = false;
  private cache = new LocalStore();
  private current: { token: string | null; asking: boolean } | null = null;
  private waiting: { run: { token: string | null; asking: boolean }; input: Omit<PlaygroundRunInput, 'token'> }[] = [];
  private posting = false;
  constructor() { void this.sync(); }

  async sync(): Promise<void> { try { this.adopt(await api.pgMe()); } catch { /* offline, or no backend yet: the cache stands until it answers */ } }
  private adopt(m: PlaygroundMe) {
    const best = (b: PlaygroundMe['best'] | undefined): BestRun | null => (b ? { score: b.score, gear: b.gear, at: b.at, stars: 0, comboMax: 1, seconds: 0, reason: 'gate', bonus: 0 } : null);
    this.cache.adopt({ stars: m.stars, unlocks: m.unlocks, gear: m.gear, best: best(m.best), best2: best(m.best2) });
  }
  onChange(fn: () => void): () => void { return this.cache.onChange(fn); }
  get(): PlaygroundState { return this.cache.get(); }
  addStars(n: number) { this.cache.addStars(n); }
  spend(what: Unlock, price: number): boolean {
    if (!this.cache.spend(what, price)) return false;
    void api.pgUnlock(what).then((m) => this.adopt(m)).catch(() => this.sync()); // refused (short, by the server's count): the cache takes the server's word
    return true;
  }
  /** The kit chosen, here and on the server, so the next visit wears it too. */
  choose(gear: Gear) { if (this.cache.get().gear === gear) return; this.cache.choose(gear); void api.pgGear(gear).catch(() => {}); }
  chooseOrbit(orbit: Orbit) { this.cache.chooseOrbit(orbit); }
  refresh() { void this.sync(); }
  beginRun() {
    const run = { token: null as string | null, asking: false }; this.current = run; this.ask(run);
  }
  private ask(run: { token: string | null; asking: boolean }) {
    if (run.token || run.asking) return; run.asking = true;
    api.pgStart().then((t) => { run.token = t.token; run.asking = false; this.post(); }).catch(() => { run.asking = false; setTimeout(() => this.post(), 5000); });
  }
  record(s: RunSummary, gear: Gear, orbit: Orbit = 1, seed?: number): boolean {
    const best = this.cache.record(s, gear, orbit), run = this.current ?? { token: null, asking: false }; this.current = null;
    this.waiting.push({ run, input: { gear, score: s.score, stars: s.stars, comboMax: s.comboMax, seconds: s.seconds, finished: s.reason === 'gate', ...orbitOf(orbit, seed) } });
    this.post(); return best;
  }
  flush(s: RunSummary, gear: Gear, orbit: Orbit = 1, seed?: number) {
    const token = this.current?.token; if (!token || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const body: PlaygroundRunInput = { token, gear, score: s.score, stars: s.stars, comboMax: s.comboMax, seconds: s.seconds, finished: false, partial: true, ...orbitOf(orbit, seed) };
    try { navigator.sendBeacon('/api/playground/run', new Blob([JSON.stringify(body)], { type: 'application/json' })); } catch { /* not this browser */ }
  }
  /** The oldest waiting run goes out once it has a token; a refusal that is not the network drops it, the network keeps it. */
  private post() {
    if (this.posting || !this.waiting.length) return;
    const head = this.waiting[0]!; if (!head.run.token) { this.ask(head.run); return; }
    this.posting = true;
    api.pgRun({ ...head.input, token: head.run.token }).then((m) => { this.waiting.shift(); this.adopt(m); })
      .catch((e: unknown) => { if (!(e instanceof ApiError) || e.code !== 'offline') this.waiting.shift(); })
      .finally(() => { this.posting = false; if (this.waiting.length) setTimeout(() => this.post(), 3000); });
  }
  boards(range: BoardRange, _name: string, orbit: Orbit = 1): Promise<BoardRow[]> {
    return api.pgBoard(range, orbit).then((rows) => { const c = this.cache.get(), best = (orbit === 2 ? c.best2 : c.best)?.score ?? -1; return rows.map((r) => ({ rank: r.rank, name: r.name, gear: r.gear, score: r.score, at: r.at, you: r.you === true, best: r.you === true && r.score === best })); });
  }
}

/** What a run says of its orbit to the server: nothing for Orbit 1 (as every run said before Orbit 2). */
const orbitOf = (orbit: Orbit, seed?: number): Pick<PlaygroundRunInput, 'orbit' | 'seed'> => (orbit === 2 ? { orbit, ...(seed != null ? { seed } : {}) } : {});
