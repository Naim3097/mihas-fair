// The store on this device: stars bank, gear is bought once, finished runs make the boards (today's and all-time,
// best first, the best marked), the history stays bounded, and a private window that refuses storage still plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, dayStart, rankRuns, type BoardRun } from './store';

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
