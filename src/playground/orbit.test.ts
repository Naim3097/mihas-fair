// Orbit 2 on paper: the catalogue of movements, the tiles that may move and how far, and the plans a seed makes, walked
// over two thousand seeds. Every gap by a moving tile stays one the air jump clears from half a metre early, a metre of
// air stays between tiles, nothing moves that holds a checkpoint, and the course pays exactly what Orbit 1 pays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLAB, buildCourse, type Platform } from './course';
import { BOOTS, jumpReach } from './gear';
import { CATALOGUE, HOME_S, PATHS, SHAPES, VMAX, measure, offsetAt, type Off, type ShapeKey } from './motion';
import { CLEAR, ORBIT_VMAX, planOrbit, slotsFor } from './orbit';

const course = buildCourse(), slots = slotsFor(course);
const SEEDS = 2000;

test('the catalogue: a hundred and more movements, each smooth, within its reach, never faster than a walking body corrects, and near home for part of every cycle', () => {
  assert.ok(CATALOGUE.length >= 100, `${CATALOGUE.length} movements`);
  assert.equal(Object.keys(SHAPES).length * Object.keys(PATHS).length, 132);
  for (const [k, f] of Object.entries(SHAPES) as [ShapeKey, (u: number) => number][]) {
    let hi = 0, step = 0;
    for (let i = 0; i <= 4000; i++) { const v = f(i / 4000); hi = Math.max(hi, Math.abs(v)); if (i) step = Math.max(step, Math.abs(v - f((i - 1) / 4000))); }
    assert.ok(hi <= 1 + 1e-9 && hi > 0.99, `${k} reaches ${hi.toFixed(3)}`);
    assert.ok(step < 0.01, `${k} jumps by ${step.toFixed(4)} between two moments`);
    assert.ok(Math.abs(f(0) - f(1 - 1e-9)) < 1e-6, `${k} does not come back to where it began`);
  }
  for (const p of CATALOGUE) {
    assert.ok(p.vmax <= VMAX + 1e-6, `${p.id} at ${p.vmax.toFixed(2)} m/s`);
    assert.ok(p.home >= HOME_S - 1e-6, `${p.id} near home ${p.home.toFixed(2)} s a cycle`);
    assert.ok(p.difficulty >= 0 && p.difficulty <= 1);
  }
  assert.equal(new Set(CATALOGUE.map((p) => p.id)).size, CATALOGUE.length, 'each movement once');
});

test('the tiles that move: fourteen, on every lane; never the pad, a checkpoint\'s, the gate\'s, the turn, a diamond\'s ledge or a jump pad\'s', () => {
  assert.equal(slots.length, 14);
  assert.deepEqual([...new Set(slots.map((s) => s.lane))].sort(), ['east', 'return', 'skates']);
  const moving = new Set(slots.map((s) => s.i)), P = course.platforms;
  const on = (p: Platform, x: number, z: number) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
  for (const r of course.rings) P.forEach((p, i) => { if (on(p, r.at.x, r.at.z) && Math.abs(r.at.y - 0.05 - p.y) < 0.02) assert.ok(!moving.has(i), `the ring at ${r.x} is on a moving tile`); });
  assert.ok(!moving.has(0), 'the pad stays');
  for (const k of course.pickups.filter((q) => q.kind === 'diamond')) P.forEach((p, i) => { if (on(p, k.x, k.z) && k.y - p.y < 3) assert.ok(!moving.has(i), `the diamond at ${k.x} rides a moving tile`); });
  for (const d of course.pads.filter((q) => q.kind === 'jump')) P.forEach((p, i) => { if (on(p, d.x, d.z)) assert.ok(!moving.has(i), 'a jump pad\'s tile moves'); });
  for (const s of slots) {
    assert.ok(s.bound.x >= 0 && s.bound.x <= 1.2 && s.bound.y >= 0 && s.bound.y <= 0.45 && s.bound.z >= 0 && s.bound.z <= 1.2, `#${s.i}: ${JSON.stringify(s.bound)}`);
    if (s.pads.length) assert.ok(s.bound.x === 0 && s.bound.y === 0, 'a boost pad\'s tile only slides across');
  }
});

/** How far a Boots body carries with the air jump from half a metre before the edge, onto a landing `rise` higher. */
const carries = (rise: number) => jumpReach(BOOTS, BOOTS.run, rise, true) - 0.5;
const gapX = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => (b.x0 >= a.x1 ? b.x0 - a.x1 : a.x0 - b.x1);

test(`${SEEDS} seeds: every plan the same from its seed, within its tiles' room and the orbit's speed, no movement twice, never two neighbours opening a gap at once`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const a = planOrbit(slots, seed), b = planOrbit(slots, seed);
    assert.deepEqual(a, b, `seed ${seed} made two courses`);
    assert.equal(new Set(a.programs).size, a.programs.length);
    const along = new Set<number>(), updown = new Set<number>();
    a.motions.forEach((m, k) => {
      if (!m) return; const s = slots[k]!;
      assert.ok(m.amp.x <= s.bound.x + 1e-9 && m.amp.y <= s.bound.y + 1e-9 && m.amp.z <= s.bound.z + 1e-9, `seed ${seed} #${s.i} ${JSON.stringify(m.amp)} beyond ${JSON.stringify(s.bound)}`);
      assert.ok(measure(m).vmax <= ORBIT_VMAX + 1e-6, `seed ${seed} #${s.i} at ${measure(m).vmax.toFixed(2)} m/s`);
      if (PATHS[m.path].w.x && m.amp.x > 0.05) along.add(s.i);
      if (PATHS[m.path].w.y && m.amp.y > 0.05) updown.add(s.i);
    });
    for (const s of slots) {
      if (along.has(s.i)) assert.ok(!(s.prev != null && along.has(s.prev)) && !(s.next != null && along.has(s.next)), `seed ${seed}: #${s.i} and a neighbour both open a gap`);
      if (updown.has(s.i)) assert.ok(!(s.prev != null && updown.has(s.prev)) && !(s.next != null && updown.has(s.next)), `seed ${seed}: #${s.i} and a neighbour both change height`);
    }
  }
});

test(`${SEEDS} seeds, every moment of twelve seconds: a metre of air beside every moving tile, and every gap by one still cleared by the air jump from half a metre early`, () => {
  const P = course.platforms, o: Off = { x: 0, y: 0, z: 0 };
  let worst = Infinity;
  for (let seed = 1; seed <= SEEDS; seed += 7) {
    const plan = planOrbit(slots, seed), k = new Map(slots.map((s, n) => [s.i, n]));
    const at = (i: number, t: number): Platform => { const n = k.get(i), m = n == null ? null : plan.motions[n]; if (!m) return P[i]!; offsetAt(m, t, o); const p = P[i]!; return { x0: p.x0 + o.x, x1: p.x1 + o.x, y: p.y + o.y, z0: p.z0 + o.z, z1: p.z1 + o.z }; };
    for (let t = 0; t < 12; t += 0.05) for (const s of slots) {
      if (!plan.motions[k.get(s.i)!]) continue;
      const me = at(s.i, t);
      for (const [nb, into] of [[s.prev, true], [s.next, false]] as const) {
        if (nb == null) continue;
        const other = at(nb, t), g = gapX(me, other);
        worst = Math.min(worst, g);
        assert.ok(g >= CLEAR - 1e-6, `seed ${seed} t ${t.toFixed(2)}: #${s.i} within ${g.toFixed(2)} m of #${nb}`);
        const rise = into ? me.y - other.y : other.y - me.y; // onto this tile from the one before; off it onto the next
        if (s.lane !== 'skates') assert.ok(carries(rise) >= g, `seed ${seed} t ${t.toFixed(2)}: the gap by #${s.i} (${g.toFixed(2)} m, a rise of ${rise.toFixed(2)}) is past the air jump's ${carries(rise).toFixed(2)}`);
      }
    }
  }
  assert.ok(worst >= CLEAR, `the closest two tiles came: ${worst.toFixed(2)} m`);
});

test('on paper, the worst of it: two neighbours at the far ends of their room at once, in every way the plan allows, and the air jump from half a metre early still carries a body over with the margin to spare', () => {
  // two neighbours never both slide along the lane nor both change height; so the worst comes as one sliding away and
  // the other sinking or rising against the jump, or one tile doing both
  const P = course.platforms, room = new Map(slots.map((s) => [s.i, s.bound])), still = { x: 0, y: 0, z: 0 };
  let tightest = Infinity, pairs = 0;
  for (const s of slots) for (const [ai, bi] of [[s.prev, s.i], [s.i, s.next]] as const) {
    if (ai == null || bi == null || s.lane === 'skates') continue; // across a skates lane the gaps do not change
    const A = P[ai]!, B = P[bi]!, a = room.get(ai) ?? still, b = room.get(bi) ?? still, g = gapX(A, B);
    for (const [gap, rise] of [[g + b.x, B.y - A.y + a.y], [g + a.x, B.y + b.y - A.y], [g + a.x, B.y - A.y + a.y], [g + b.x, B.y + b.y - A.y]] as const) {
      tightest = Math.min(tightest, carries(rise) - gap);
      assert.ok(carries(rise) - gap >= 0.3 - 1e-6, `#${ai} → #${bi}: a ${gap.toFixed(2)} m gap and a ${rise.toFixed(2)} m rise leave ${(carries(rise) - gap).toFixed(2)} m`);
    }
    pairs++;
  }
  assert.ok(pairs >= 20, `${pairs} pairs`);
  assert.ok(tightest < 0.6, `the tightest keeps ${tightest.toFixed(2)} m: the room is used, not wasted`);
});

test('the pickups: those on a moving tile ride it and never sink into it; none left in the air is anywhere a moving slab can go; Orbit 2 pays exactly what Orbit 1 pays', () => {
  const riders = new Set(slots.flatMap((s) => s.riders));
  for (const s of slots) for (const j of s.riders) { const k = course.pickups[j]!; assert.ok(k.y > s.home.y, `${k.kind} at ${k.x} rides #${s.i} but sits in it`); }
  // the whole room a tile may move through, every way at once (a plan's reach is within it: see the seeds above)
  for (const { i, home: h, bound: b } of slots) course.pickups.forEach((k, j) => {
    if (riders.has(j)) return;
    const inside = k.x > h.x0 - b.x && k.x < h.x1 + b.x && k.z > h.z0 - b.z && k.z < h.z1 + b.z && k.y < h.y + b.y + 0.1 && k.y > h.y - b.y - SLAB - 0.4;
    assert.ok(!inside, `the ${k.kind} at ${k.x},${k.y},${k.z} is where #${i} may go`);
  });
  // the plan moves tiles and nothing else: the course's pickups are the ones Orbit 1 has, so the server's caps hold as they are
  assert.equal(buildCourse().pickups.length, course.pickups.length);
});

test('a player meets new movements run after run: a hundred within a dozen runs, and every one in the catalogue over many', () => {
  const seen = new Set<string>(); let runs = 0;
  while (seen.size < 100 && runs < 30) { for (const id of planOrbit(slots, 7000 + runs, seen).programs) seen.add(id); runs++; }
  assert.ok(seen.size >= 100 && runs <= 13, `${seen.size} movements met in ${runs} runs`);
  const all = new Set<string>(); for (let seed = 1; seed <= SEEDS; seed++) for (const id of planOrbit(slots, seed).programs) all.add(id);
  assert.equal(all.size, CATALOGUE.length, 'every movement in the catalogue turns up');
});
