import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_ORDER, checkpointRank } from './rules.js';

test('the fixed route: UOB, printdaddy, Aura Biocare; anyone approved later comes after, in the order handed out', () => {
  assert.deepEqual([...CHECKPOINT_ORDER], ['8H17B', '6A21', '6A25']);
  const handedOut = ['6A25', '7C17', '8H17B', '6A21'];
  const sorted = handedOut.map((id, i) => ({ id, i })).sort((a, b) => checkpointRank(a.id) - checkpointRank(b.id) || a.i - b.i).map((x) => x.id);
  assert.deepEqual(sorted, ['8H17B', '6A21', '6A25', '7C17']);
});
