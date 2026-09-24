// The store on this device: stars bank, gear is bought once, finished runs make the boards (today's and all-time,
// best first, the best marked; each orbit its own), the history stays bounded, a private window that refuses storage
// still plays, and the movements met on Orbit 2 are remembered so the next runs bring others.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, dayStart, isKit, kitsOf, rankRuns, rememberMovements, seenMovements, type BoardRun } from './store';
import { nextKit } from '../fair/kits';

const run = (score: number, reason: 'gate' | 'o2' = 'gate') => ({ score, stars: 10, comboMax: 2, seconds: 30, reason, bonus: 0 });

test('without storage the store still works: stars bank, gear is bought once, a run counts, a finished one can be the best', () => {
  const s = new LocalStore();
  assert.equal(s.get().stars, 0); assert.deepEqual(s.get().unlocks, ['boots']);
  s.addStars(120);
  assert.equal(s.spend('skates', 100), true); assert.equal(s.get().stars, 20); assert.equal(s.spend('skates', 100), true, 'owned: no second charge'); assert.equal(s.get().stars, 20);
  assert.equal(s.spend('jetpack', 250), false); assert.equal(s.get().stars, 20);
  s.choose('skates'); assert.equal(s.get().gear, 'skates'); s.choose('jetpack'); assert.equal(s.get().gear, 'skates', 'not owned: not chosen');
  assert.equal(s.record(run(900, 'o2'), 'boots'), false, 'an unfinished run is no best');
  assert.equal(s.record(run(1200), 'boots'), true); assert.equal(s.record(run(1100), 'skates'), false); assert.equal(s.record(run(1300), 'skates'), true);
  assert.equal(s.get().runs, 4); assert.equal(s.get().history.length, 3, 'finished runs only'); assert.equal(s.get().best?.score, 1300);
});

test('the boards: best first, ten at most, today from midnight, the best marked', async () => {
  const day = dayStart(Date.now()), older = day - 3600_000;
  const runs: BoardRun[] = [];
  for (let i = 0; i < 14; i++) runs.push({ score: 500 + i * 100, gear: 'boots', stars: 20, comboMax: 3, seconds: 40, at: (i % 2 ? day : older) + i });
  const all = rankRuns(runs, 'Test P.'), today = rankRuns(runs, 'Test P.', day);
  assert.equal(all.length, 10); assert.equal(all[0]!.score, 1800); assert.equal(all[0]!.rank, 1); assert.ok(all[0]!.best && !all[1]!.best);
  assert.equal(today.length, 7); assert.ok(today.every((r) => r.at >= day)); assert.equal(today[0]!.score, 1800);
  assert.equal(rankRuns([{ score: 5, gear: 'boots', stars: 0, comboMax: 1, seconds: 21, at: 1 }, { score: 5, gear: 'skates', stars: 0, comboMax: 1, seconds: 21, at: 0 }], 'x')[0]!.gear, 'skates', 'earlier first among equals');
  const s = new LocalStore(); for (let i = 0; i < 60; i++) s.record(run(100 + i), 'boots');
  assert.equal(s.get().history.length, 50, 'the history is bounded'); assert.equal((await s.boards('all', 'me'))[0]!.score, 159);
  assert.equal((await s.boards('today', 'me')).length, 10);
});

test('each orbit its own best and its own boards; the orbit chosen is kept; runs from before Orbit 2 are Orbit 1\'s', async () => {
  const s = new LocalStore();
  assert.equal(s.get().orbit, 1); s.chooseOrbit(2); assert.equal(s.get().orbit, 2);
  assert.equal(s.record(run(900), 'boots'), true, 'Orbit 1 when none is said');
  assert.equal(s.record(run(700), 'boots', 2, 42), true, 'the first through the gate on Orbit 2 is its best');
  assert.equal(s.record(run(800), 'skates', 1), false, 'short of Orbit 1\'s best, whatever Orbit 2\'s is');
  assert.equal(s.record(run(750), 'boots', 2), true);
  assert.equal(s.get().best?.score, 900); assert.equal(s.get().best2?.score, 750);
  assert.deepEqual((await s.boards('all', 'me')).map((r) => r.score), [900, 800]);
  assert.deepEqual((await s.boards('all', 'me', 2)).map((r) => [r.score, r.best]), [[750, true], [700, false]]);
  assert.deepEqual(rankRuns([{ score: 5, gear: 'boots', stars: 0, comboMax: 1, seconds: 21, at: 1 }], 'x', 0, 2), [], 'a run with no orbit is Orbit 1\'s');
});

test('the movements met on Orbit 2 are remembered on this device, newest last, the oldest let go after six runs or so', () => {
  const mem = new Map<string, string>(), g = globalThis as { localStorage?: unknown };
  g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  try {
    assert.equal(seenMovements().size, 0);
    rememberMovements(['a', 'b']); rememberMovements(['b', 'c']); assert.deepEqual([...seenMovements()], ['a', 'b', 'c'], 'b met again: newest');
    rememberMovements(Array.from({ length: 100 }, (_, i) => `m${i}`)); assert.equal(seenMovements().size, 90); assert.ok(!seenMovements().has('a') && seenMovements().has('m99'));
    mem.set('mx_orbit_seen', '{not json'); assert.equal(seenMovements().size, 0, 'something else wrote there: nothing met');
  } finally { delete g.localStorage; }
});

test('Warp is owned beside the kits, never among them: bought once with stars, never worn, never on the kit chip', () => {
  const s = new LocalStore(); s.addStars(500);
  assert.equal(s.spend('warp', 400), true); assert.equal(s.get().stars, 100); assert.equal(s.spend('warp', 400), true, 'owned: no second charge'); assert.equal(s.get().stars, 100);
  assert.deepEqual(s.get().unlocks, ['boots', 'warp']); assert.equal(s.get().gear, 'boots');
  assert.deepEqual(kitsOf(s.get().unlocks), ['boots'], 'one kit: nothing to switch between, no chip');
  s.choose('warp' as never); assert.equal(s.get().gear, 'boots', 'not worn');
  assert.equal(isKit('warp'), false); assert.equal(isKit('jetpack'), true);
  assert.equal(nextKit(kitsOf(['boots', 'warp', 'skates']), 'boots'), 'skates'); assert.equal(nextKit(kitsOf(['boots', 'warp', 'skates']), 'skates'), 'boots');
});
