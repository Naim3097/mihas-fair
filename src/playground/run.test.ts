// The run's rules on their own: the air, the combo's window and cap, the diamond, the rings that only go forward,
// the fall, the gate's bonus, the end at zero air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_MAX, COMBO_WINDOW, DIAMOND, DIAMOND_STARS, O2_BUBBLE, O2_CAP, O2_FALL, O2_START, Run, STAR } from './run';

const kinds = (r: Run) => r.drain().map((e) => e.kind);

test('stars in quick succession climb the combo to its cap; a pause drops it back to one', () => {
  const r = new Run();
  r.star(); assert.equal(r.combo, 1); assert.equal(r.score, STAR);
  r.tick(0.5); r.star(); assert.equal(r.combo, 2); assert.equal(r.score, STAR * 3);
  r.tick(0.5); r.star(); r.tick(0.5); r.star(); r.tick(0.5); r.star();
  assert.equal(r.combo, COMBO_MAX); assert.equal(r.comboMax, COMBO_MAX); assert.equal(r.stars, 5);
  assert.deepEqual(kinds(r), ['star', 'combo', 'star', 'combo', 'star', 'combo', 'star', 'star']);
  r.tick(COMBO_WINDOW + 0.01);
  assert.equal(r.combo, 1); assert.deepEqual(kinds(r), ['combo']);
  r.star(); assert.equal(r.combo, 1, 'the first star after a pause is a plain star');
});

test('air: down with time, up by a bubble to the cap, down by a fall; at zero the run ends where it is', () => {
  const r = new Run();
  r.tick(10); assert.ok(Math.abs(r.o2 - (O2_START - 10)) < 1e-9);
  for (let i = 0; i < 10; i++) r.bubble(); assert.equal(r.o2, O2_CAP, 'capped');
  r.fall(); assert.equal(r.o2, O2_CAP - O2_FALL); assert.equal(r.combo, 1);
  r.tick(O2_CAP); assert.equal(r.o2, 0); assert.equal(r.ended?.reason, 'o2'); assert.equal(r.ended?.bonus, 0);
  const before = r.score; r.star(); r.bubble(); assert.equal(r.score, before, 'nothing counts after the end');
  assert.equal(r.ended?.seconds, Math.round(10 + O2_CAP));
});

test('the gate pays ten a second of air left; the diamond pays score and stars; rings only ever go forward', () => {
  const r = new Run();
  r.diamond(); assert.equal(r.score, DIAMOND); assert.equal(r.stars, DIAMOND_STARS);
  r.ringAt(2); r.ringAt(1); assert.equal(r.ring, 2, 'walking back past a ring keeps the later one');
  r.tick(4); r.gate();
  assert.equal(r.ended?.reason, 'gate'); assert.equal(r.ended?.bonus, Math.round((O2_START - 4) * 10)); assert.equal(r.score, DIAMOND + r.ended!.bonus);
  assert.equal(r.ended?.stars, DIAMOND_STARS);
});

test('a fall with little air left ends the run; leaving ends it without a bonus', () => {
  const a = new Run(); a.tick(O2_START - 2); a.fall(); assert.equal(a.ended?.reason, 'o2');
  const b = new Run(); b.star(); b.leave(); assert.equal(b.ended?.reason, 'left'); assert.equal(b.ended?.bonus, 0); assert.equal(b.ended?.score, STAR);
  assert.equal(O2_BUBBLE, 6);
});
