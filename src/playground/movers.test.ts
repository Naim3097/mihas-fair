// Orbit 2 in the real physics: the fair's own body and controller on a course whose tiles move. A body standing on a
// moving tile goes where it goes and stays on its feet; a tile coming up under a falling body catches it and never
// swallows it; a tile away from home is still under every ray the camera and the landing marker cast; every gap by a
// moving tile on the Boots line is made with the air jump, from the edge and from half a metre early, whenever the
// run-up starts, seed after seed; the Jetpack's sky line is flown and the Skates line skated over a course awake; a
// change of plan keeps the course fair through all of it; and asleep, the course is Orbit 1 to the last digit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classByKey, type MovementDef } from '../../content';
import { emptyIntent, type Intent } from '../ceritera/game/controller';
import { newBody, raycast, type Box } from '../ceritera/game/physics';
import { Sim, STEP } from '../ceritera/game/sim';
import { v3 } from '../ceritera/game/v3';
import { PickupIndex, buildCourse, courseBoxes, laneTopAt, platformUnder, type Course, type Platform } from './course';
import { BOOTS, JETPACK, SKATES, jumpReach } from './gear';
import { Movers, SLEEP_S, WAKE_S } from './movers';
import { CLEAR, planOrbit, slotsFor, type OrbitPlan, type Slot } from './orbit';
import { rng } from './rng';

/** The course as built, never moved: where every platform belongs. */
const home = buildCourse();
/** A body parked far below, for moving the tiles when no one is on them. */
const far = newBody(v3(0, -500, 0), 0.3, 1.7);

/** A course of its own, a plan playing on it (fully awake), and a fresh body put on it at a moment of that plan. */
class Rig {
  readonly course: Course = buildCourse();
  readonly boxes: Box[] = courseBoxes(this.course);
  readonly slots: Slot[] = slotsFor(this.course);
  readonly movers = new Movers(this.course, this.slots, this.boxes);
  readonly plan: OrbitPlan | null;
  sim!: Sim; t = 0;
  constructor(seed: number | null) { this.plan = seed == null ? null : planOrbit(this.slots, seed); this.movers.set(this.plan, -1e4); }
  /** A fresh body (not yet placed), and the tiles where the plan has them at `t`. */
  at(t: number, M: MovementDef = BOOTS): Sim {
    const c = this.course;
    this.sim = new Sim('pengembara', classByKey('pengembara')!.base, { size: 200, boxes: this.boxes, props: [], spawn: { pos: v3(c.spawn.x, c.spawn.y, c.spawn.z), yaw: c.spawn.yaw }, enemies: [], lanterns: [] }, 1, M);
    this.movers.gridFor(this.sim.world); this.t = t; this.movers.step(t, this.sim.world, far);
    return this.sim;
  }
  put(x: number, y: number, z: number, yaw: number) { const p = this.sim.player, b = p.body; b.pos.x = x; b.pos.y = y; b.pos.z = z; b.vel = v3(); b.grounded = false; p.yaw = yaw; p.peak = y; this.sim.camYaw = yaw; }
  /** One step as the engine takes it: the tiles (and whoever rides one), then the body. */
  step(it: Intent) { this.t += STEP; this.movers.step(this.t, this.sim.world, this.sim.player.body); this.sim.step(it, STEP); }
}

const idle = emptyIntent();
const onTop = (b: { pos: { x: number; z: number } }, p: Platform, slack = 0.3) => b.pos.x >= p.x0 - slack && b.pos.x <= p.x1 + slack && b.pos.z >= p.z0 - slack && b.pos.z <= p.z1 + slack;

test('a body standing on a moving tile goes where it goes: on its feet every step, its place on the tile kept to a centimetre, on every tile that moves, seed after seed', () => {
  let rides = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = new Rig(seed);
    r.slots.forEach((s, k) => {
      if (!r.plan!.motions[k]) return;
      r.at(3.7 * seed + k); const P = r.course.platforms[s.i]!, b = r.sim.player.body, o = r.movers.now[k]!;
      r.put((P.x0 + P.x1) / 2, P.y + 1, (P.z0 + P.z1) / 2, 0);
      for (let i = 0; i < 120 && !b.grounded; i++) r.step(idle);
      assert.ok(b.grounded && r.movers.under(b) === k, `seed ${seed}: a body dropped on #${s.i} did not land on it`);
      const rel = { x: b.pos.x - o.x, y: b.pos.y - P.y, z: b.pos.z - o.z };
      let off = 0, drift = 0;
      for (let i = 0; i < 12 * 60; i++) {
        r.step(idle);
        if (!b.grounded || r.movers.under(b) !== k) off++;
        drift = Math.max(drift, Math.abs(b.pos.x - o.x - rel.x), Math.abs(b.pos.y - P.y - rel.y), Math.abs(b.pos.z - o.z - rel.z));
      }
      assert.ok(off <= 7, `seed ${seed}: on #${s.i} the body was off its feet ${off} steps in 720`);
      assert.ok(drift <= 0.01, `seed ${seed}: on #${s.i} the body slid ${drift.toFixed(3)} m over the tile`);
      rides++;
    });
  }
  assert.ok(rides >= 250, `${rides} rides`);
});

test('a tile away from home is still under every ray: the landing marker and the camera find it wherever its movement has it', () => {
  for (let seed = 1; seed <= 16; seed++) {
    const r = new Rig(seed), n = r.course.platforms.length; r.at(0);
    for (let t = 0; t < 12; t += 0.2) {
      r.movers.step(t, r.sim.world, far);
      r.slots.forEach((s) => {
        const P = r.course.platforms[s.i]!, mine = new Set([r.boxes[s.i], ...s.pads.map((j) => r.boxes[n + j])]);
        for (const [x, z] of [[P.x0 + 0.05, P.z0 + 0.05], [P.x1 - 0.05, P.z0 + 0.05], [P.x0 + 0.05, P.z1 - 0.05], [P.x1 - 0.05, P.z1 - 0.05], [(P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2]] as const) {
          const hit = raycast(r.sim.world, v3(x, P.y + 3, z), v3(0, -1, 0), 10);
          assert.ok(hit && mine.has(hit.box), `seed ${seed} t ${t.toFixed(1)}: the ray down at ${x.toFixed(2)},${z.toFixed(2)} misses #${s.i}`);
        }
        assert.equal(platformUnder(r.course, (P.x0 + P.x1) / 2, P.y + 1, (P.z0 + P.z1) / 2), P, 'the course\'s own lookup sees the tile where it is');
      });
    }
  }
});

test('a tile coming up under a body catches it: set on its top, never inside it', () => {
  // the moment itself: feet a centimetre over a tile that rises two and a half in the next step
  const r = new Rig(null), k = r.slots.findIndex((s) => s.bound.y > 0), s = r.slots[k]!;
  const plan: OrbitPlan = { seed: 0, programs: [], motions: r.slots.map((_, j) => (j === k ? { shape: 'sine', path: 'y', amp: { x: 0, y: 0.45, z: 0 }, period: 2, phase: 0 } : null)) };
  r.movers.set(plan, -1e4); r.at(0);
  const P = r.course.platforms[s.i]!, b = r.sim.player.body;
  r.put((P.x0 + P.x1) / 2, P.y + 0.01, (P.z0 + P.z1) / 2, 0);
  r.movers.step(STEP, r.sim.world, b);
  assert.ok(P.y > b.pos.y - 1e-3 && b.grounded && Math.abs(b.pos.y - P.y) < 1e-3, `the rising tile left the feet at ${(b.pos.y - P.y).toFixed(3)} from its top`);
  // and dropped on every tile that moves up and down, at any moment: always a landing on the top
  let drops = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const q = new Rig(seed);
    q.slots.forEach((t, j) => {
      const m = q.plan!.motions[j]; if (!m || !m.amp.y) return;
      q.at(rng(seed * 97 + j)() * 30); const T = q.course.platforms[t.i]!, c = q.sim.player.body;
      q.put((T.x0 + T.x1) / 2, T.y + 1.2, (T.z0 + T.z1) / 2, 0); c.vel.y = -2;
      for (let i = 0; i < 120 && !(c.grounded && q.movers.under(c) === j); i++) {
        q.step(idle);
        const inside = c.pos.x + c.radius > T.x0 && c.pos.x - c.radius < T.x1 && c.pos.z + c.radius > T.z0 && c.pos.z - c.radius < T.z1 && c.pos.y < T.y - 0.02 && c.pos.y + c.height > T.y - 0.6;
        assert.ok(!inside, `seed ${seed}: the body is ${(T.y - c.pos.y).toFixed(3)} m inside #${t.i}`);
      }
      assert.ok(c.grounded && q.movers.under(c) === j, `seed ${seed}: dropped on #${t.i}, it never landed`);
      drops++;
    });
  }
  assert.ok(drops >= 60, `${drops} drops`);
});

/** The Boots line's platforms by index, in the order they are run (as course.test.ts walks it). */
function bootsLine(c: Course): number[] {
  const at = (x: number, z: number) => c.platforms.findIndex((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
  return [...[12, 22, 32, 42, 53, 66, 78, 88, 98, 106, 117, 127, 141].map((x) => at(x, 0)), at(146, 20), ...[135, 123, 110, 98, 86, 73, 61, 48, 36, 18].map((x) => at(x, 20))];
}

/** Run at the gap between two platforms from `runUp` metres back (on the tile as it moves), jump at its edge (or
 *  `early` metres before it) and, if asked, once more at the top of the jump. True if the body stands on the far one. */
function cross(r: Rig, from: number, to: number, early: number, airJump = true, runUp = 6, sprint = false): boolean {
  const P = r.course.platforms, A = P[from]!, B = P[to]!, p = r.sim.player, b = p.body;
  const HA = home.platforms[from]!, HB = home.platforms[to]!, z = Math.max(HA.z0 + 0.5, Math.min(HA.z1 - 0.5, (HB.z0 + HB.z1) / 2)); // down the middle of the next lane
  const dir = B.x0 >= A.x1 ? 1 : -1;
  const edge = () => (dir > 0 ? A.x1 : A.x0);
  r.put(Math.max(A.x0 + 0.5, Math.min(A.x1 - 0.5, edge() - dir * runUp)), A.y + 0.05, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  let jumped = false, doubled = false;
  for (let i = 0; i < 6 * 60; i++) {
    const it: Intent = { ...idle, move: { x: 0, y: 1 }, sprint };
    if (!jumped && b.grounded && (b.pos.x - edge()) * dir > -0.05 - early) { it.jump = true; jumped = true; }
    else if (jumped && airJump && !doubled && !b.grounded && b.vel.y < 0.5) { it.jump = true; doubled = true; }
    r.step(it);
    if (jumped && b.grounded && onTop(b, B) && Math.abs(b.pos.y - B.y) < 0.1) return true;
    if (b.pos.y < Math.min(A.y, B.y) - 2) return false;
  }
  return false;
}

test('every gap by a moving tile on the Boots line is made with the air jump, from the edge and from half a metre early, whenever the run-up starts, seed after seed', () => {
  const line = bootsLine(home), moving = new Set(slotsFor(home).map((s) => s.i));
  const pairs = line.slice(1).map((to, n) => [line[n]!, to] as const).filter(([a, b]) => moving.has(a) || moving.has(b));
  assert.ok(pairs.length >= 18, `${pairs.length} gaps by a moving tile`);
  // the pilot is honest: at rest, a stair is not made by a single jump, and is by the air jump half a metre early
  const still = new Rig(null); still.at(0); assert.ok(!cross(still, line[6]!, line[7]!, 0, false), 'a single jump makes a stair');
  still.at(0); assert.ok(cross(still, line[6]!, line[7]!, 0.5), 'the air jump half a metre early does not make a stair');
  let made = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Rig(seed), ix = new Map(r.slots.map((s, k) => [s.i, k])), R = rng(seed * 7919);
    for (const [a, b] of pairs) {
      const ma = r.plan!.motions[ix.get(a) ?? -1], mb = r.plan!.motions[ix.get(b) ?? -1];
      if (!ma && !mb) continue;
      for (let n = 0; n < 3; n++) for (const early of [0, 0.5]) {
        const t0 = R() * 40; r.at(t0);
        assert.ok(cross(r, a, b, early), `seed ${seed}, t ${t0.toFixed(2)}: #${a} → #${b} ${early ? 'half a metre early' : 'from the edge'} falls short (${JSON.stringify(ma)} / ${JSON.stringify(mb)})`);
        made++;
      }
    }
  }
  assert.ok(made >= 4000, `${made} crossings`);
});

test('the Skates line over a course awake: every gap made at the cruise with the air jump, half a metre early too, as its tiles slide across the lane', () => {
  const at = (x: number) => home.platforms.findIndex((p) => x >= p.x0 && x <= p.x1 && 30 >= p.z0 && 30 <= p.z1);
  const line = [146, 133, 117, 102, 86, 71, 55, 40, 18].map(at);
  let made = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const r = new Rig(seed), R = rng(seed * 104729);
    for (let n = 1; n < line.length; n++) for (const early of [0, 0.5]) {
      const t0 = R() * 40; r.at(t0, SKATES);
      assert.ok(cross(r, line[n - 1]!, line[n]!, early, true, 14), `seed ${seed}, t ${t0.toFixed(2)}: skates #${line[n - 1]} → #${line[n]} falls short`);
      made++;
    }
  }
  assert.equal(made, 64);
});

test('the sky line flown over a course awake: hold from the edge to the crest, let go, land, run on; every star, the diamond and both cells taken, the tank never dry', () => {
  const H = home.hills, P0 = home.platforms;
  // a hill lifts from a platform's west edge (the first, from the middle of the one off the turn): which one, so the
  // pilot reads that edge where it is now
  const lift = H.map((h) => P0.findIndex((p) => p.z0 === 17 && Math.abs(p.x0 - h.x0) < 0.01));
  assert.ok(lift.filter((i) => i >= 0).length === H.length - 1);
  for (const seed of [3, 11, 29, 47]) {
    const r = new Rig(seed), P = r.course.platforms, sim = r.at(rng(seed)() * 30, JETPACK), p = sim.player, b = p.body;
    r.put(148, 8.55, 20, -Math.PI / 2);
    const got = new Set<number>(), out: number[] = new Array(64).fill(0), ix = new PickupIndex(r.course.pickups);
    let hi = 0, phase: 'ground' | 'climb' | 'fall' = 'ground', lowest = 99, fuelMin = 100;
    for (let t = 0; t < 45 && b.pos.x > 16; t += STEP) {
      const h = H[hi], L = h && lift[hi]! >= 0 ? P[lift[hi]!]! : null, shift = h && L ? L.x0 - h.x0 : 0; // the hill flown from where its platform is
      if (phase === 'ground' && h && b.pos.x <= h.x0 + shift + 0.05) phase = 'climb';
      else if (phase === 'climb' && h && b.pos.x <= h.xc + shift) phase = 'fall';
      else if (phase === 'fall' && b.grounded && h && b.pos.x < h.xc + shift - 1) { phase = 'ground'; hi++; }
      const thrust = phase === 'climb', under = platformUnder(r.course, b.pos.x, b.pos.y, b.pos.z);
      const hop = phase === 'ground' && b.grounded && !!under && b.pos.x - under.x0 < 0.45 && under !== L;
      r.step({ ...idle, move: { x: 0, y: 1 }, sprint: true, jump: (thrust && b.grounded) || hop, thrust });
      const n = ix.near(b.pos.x, b.pos.y + 0.9, b.pos.z, 0.3 + 0.36, out); for (let k = 0; k < n; k++) got.add(out[k]!);
      lowest = Math.min(lowest, b.pos.y - laneTopAt(P, b.pos.x, 20)); fuelMin = Math.min(fuelMin, p.fuel);
    }
    assert.ok(lowest > -1, `seed ${seed}: fell off the lane (lowest ${lowest.toFixed(2)} at hill ${hi})`);
    assert.ok(b.pos.x <= 16 && hi === H.length, `seed ${seed}: flew to ${b.pos.x.toFixed(1)}, hill ${hi}`);
    assert.ok(fuelMin > 0, `seed ${seed}: the tank ran dry`);
    const sky = home.pickups.map((k, i) => ({ k, i })).filter(({ k }) => k.line === 'jetpack' && k.z === 20);
    assert.deepEqual(sky.filter(({ i }) => !got.has(i)).map(({ k }) => `${k.kind}@${k.x.toFixed(1)}`), [], `seed ${seed}: missed on the sky line`);
  }
});

test('a change of plan (a new seed on Again, Orbit 1 chosen) settles the tiles home and wakes the next: a metre of air and every gap within the air jump at every moment of it', () => {
  const carries = (rise: number) => jumpReach(BOOTS, BOOTS.run, rise, true) - 0.5;
  const gapX = (a: Platform, b: Platform) => (b.x0 >= a.x1 ? b.x0 - a.x1 : a.x0 - b.x1);
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Rig(seed), P = r.course.platforms, R = rng(seed * 31337); r.at(0);
    let t = R() * 20; r.movers.step(t, r.sim.world, far);
    const next = seed % 5 ? planOrbit(r.slots, seed + 1000) : null; // now and then, back to Orbit 1
    r.movers.set(next, t);
    for (const end = t + SLEEP_S + WAKE_S + 1; t < end; t += STEP) {
      r.movers.step(t, r.sim.world, far);
      for (const s of r.slots) for (const [nb, into] of [[s.prev, true], [s.next, false]] as const) {
        if (nb == null) continue;
        const me = P[s.i]!, other = P[nb]!, g = gapX(me, other), rise = into ? me.y - other.y : other.y - me.y;
        assert.ok(g >= CLEAR - 1e-6, `seed ${seed}: #${s.i} within ${g.toFixed(2)} m of #${nb} as the plan changed`);
        if (s.lane !== 'skates') assert.ok(carries(rise) >= g - 1e-9, `seed ${seed}: the gap by #${s.i} (${g.toFixed(2)} m) past the air jump as the plan changed`);
      }
    }
    if (!next) assert.ok(!r.movers.awake, 'Orbit 1 chosen: every tile at rest');
  }
});

test('asleep, the course is Orbit 1 to the last digit: a plan played, then settled, leaves every box and every platform exactly where it began', () => {
  const r = new Rig(9); r.at(0); const b = r.sim.player.body; r.put(home.spawn.x, home.spawn.y, home.spawn.z, home.spawn.yaw);
  for (let i = 0; i < 300; i++) r.step(idle);
  assert.ok(r.movers.awake && r.course.platforms.some((p, i) => p.x0 !== home.platforms[i]!.x0 || p.y !== home.platforms[i]!.y || p.z0 !== home.platforms[i]!.z0), 'the plan moved the tiles');
  r.movers.set(null, r.t);
  for (let i = 0; i < (SLEEP_S + 0.1) * 60; i++) r.step(idle);
  assert.ok(!r.movers.awake);
  assert.deepEqual(r.course.platforms, home.platforms);
  assert.deepEqual(r.boxes, courseBoxes(home));
  assert.ok(b.grounded && Math.abs(b.pos.y - home.spawn.y) < 0.1, 'the body on the pad never noticed');
});
