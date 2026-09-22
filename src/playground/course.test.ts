// The course, walked by the real physics: every gap on the Boots line is jumped by a scripted body (a single jump
// where one is enough, the air jump where it is not, the jump pad where it is there), every pickup is somewhere a
// body can be, every ring and the gate are caught at top speed, every platform is in a section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classByKey } from '../../content';
import { emptyIntent, type Intent } from '../ceritera/game/controller';
import { Sim, STEP } from '../ceritera/game/sim';
import { v3 } from '../ceritera/game/v3';
import { JUMP_PAD, PICKUP_R, PickupIndex, SLAB, buildCourse, courseBoxes, crossed, platformUnder, sectionAt, type Platform } from './course';
import type { MovementDef } from '../../content';
import { BOOTS, SKATES, boostBody, jumpReach } from './gear';

const course = buildCourse(), boxes = courseBoxes(course);
const newSim = (M: MovementDef = BOOTS) => new Sim('pengembara', classByKey('pengembara')!.base, { size: 200, boxes, props: [], spawn: { pos: v3(course.spawn.x, course.spawn.y, course.spawn.z), yaw: course.spawn.yaw }, enemies: [], lanterns: [] }, 1, M);
const centre = (p: Platform) => ({ x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2 });

/** The Boots line as the platforms come, in the order they are jumped. */
function bootsLine(): Platform[] {
  const P = course.platforms, at = (x: number, z: number) => P.find((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1)!;
  const line: Platform[] = [];
  for (const x of [12, 22, 32, 42, 53, 66, 78, 88, 98, 106, 117, 127, 141]) line.push(at(x, 0)); // the pad's line east: boardwalk and stairs
  line.push(at(146, 20)); // the turn
  for (const x of [135, 123, 110, 98, 86, 73, 61, 48, 36, 18]) line.push(at(x, 20)); // the return lane west
  return line;
}

/** Run toward the gap (from `runUp` metres before it, or the platform's start) and jump at the edge (or `early` metres before it); once more
 *  in the air at the apex if asked; a boost pad on the way pushes if `boost`. True if the body stands on `to`. */
function jumpAcross(from: Platform, to: Platform, dir: 1 | -1, airJump: boolean, sprint: boolean, early = 0, M: MovementDef = BOOTS, runUp = 6, boost = false): boolean {
  const sim = newSim(M), p = sim.player, b = p.body, z = Math.max(from.z0 + 0.5, Math.min(from.z1 - 0.5, centre(to).z)); // in the lane the next platform is in
  const edge = dir > 0 ? from.x1 : from.x0, startX = Math.max(from.x0 + 0.5, Math.min(from.x1 - 0.5, edge - dir * runUp));
  b.pos.x = startX; b.pos.y = from.y + 0.05; b.pos.z = z; p.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; p.peak = b.pos.y;
  sim.camYaw = p.yaw; // forward on the stick is along the course
  const run: Intent = { ...emptyIntent(), move: { x: 0, y: 1 }, sprint };
  let jumped = false, doubled = false, boosted = false;
  for (let t = 0; t < 4; t += STEP) {
    const it = { ...run, jump: false };
    if (b.groundTag === 'jump' && !jumped) { b.vel.y = JUMP_PAD; b.grounded = false; jumped = true; } // the engine's pads
    if (boost && !boosted && b.groundTag?.startsWith('boost:')) { boosted = true; boostBody(p, dir, 0); }
    if (!jumped && (b.pos.x - edge) * dir > -0.05 - early) { it.jump = true; jumped = true; }
    else if (jumped && airJump && !doubled && !b.grounded && b.vel.y < 0.5) { it.jump = true; doubled = true; }
    sim.step(it, STEP);
    if (jumped && b.grounded && b.pos.x >= to.x0 - 0.3 && b.pos.x <= to.x1 + 0.3 && Math.abs(b.pos.y - to.y) < 0.1) return true;
    if (b.pos.y < Math.min(from.y, to.y) - 2) return false;
  }
  return false;
}

test('every gap on the Boots line is jumped: a single jump on the boardwalk, the air jump on the stairs and the return lane', () => {
  const line = bootsLine(); let single = 0, doubled = 0;
  for (let i = 1; i < line.length; i++) {
    const from = line[i - 1]!, to = line[i]!;
    if (from.x1 <= to.x0 - 0.1 || to.x1 <= from.x0 - 0.1) { // a gap along x
      const dir: 1 | -1 = to.x0 >= from.x1 ? 1 : -1;
      // forgiving: a thumb that jumps half a metre early still makes it, with the same jump the gap asks for
      if (jumpAcross(from, to, dir, false, false)) { single++; assert.ok(jumpAcross(from, to, dir, false, false, 0.5), `gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1}: a single jump half a metre early falls short`); }
      else { assert.ok(jumpAcross(from, to, dir, true, false), `gap ${from.x0}–${from.x1} (y ${from.y}) → ${to.x0}–${to.x1} (y ${to.y}) needs more than the air jump`); assert.ok(jumpAcross(from, to, dir, true, false, 0.5), `gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1}: the air jump half a metre early falls short`); doubled++; }
    }
  }
  assert.ok(single >= 6, `${single} single jumps`); assert.ok(doubled >= 6, `${doubled} air jumps`);
});

test('the jump maths: a running jump carries about 2.8 m, the air jump takes it to 4.5, top speed to 6', () => {
  assert.ok(Math.abs(jumpReach(BOOTS, BOOTS.run) - 2.8) < 0.3, `single ${jumpReach(BOOTS, BOOTS.run).toFixed(2)}`);
  assert.ok(Math.abs(jumpReach(BOOTS, BOOTS.run, 0, true) - 4.5) < 0.3, `double ${jumpReach(BOOTS, BOOTS.run, 0, true).toFixed(2)}`);
  assert.ok(Math.abs(jumpReach(BOOTS, BOOTS.sprint, 0, true) - 6.1) < 0.4, `top-speed double ${jumpReach(BOOTS, BOOTS.sprint, 0, true).toFixed(2)}`);
  assert.ok(jumpReach(BOOTS, BOOTS.run, 1, true) > 3.2, 'a metre up with the air jump still clears three');
});

test('every pickup sits over floor a body can reach and inside no slab; the diamond takes a double jump', () => {
  for (const k of course.pickups) {
    if (k.line !== 'boots') continue;
    const under = platformUnder(course, k.x, k.y, k.z), near = course.platforms.filter((p) => k.x >= p.x0 - 2.2 && k.x <= p.x1 + 2.2 && k.z >= p.z0 - 0.6 && k.z <= p.z1 + 0.6 && p.y <= k.y);
    assert.ok(near.length, `${k.kind} at ${k.x},${k.y},${k.z} floats over nothing`);
    const top = Math.max(...near.map((p) => p.y));
    // a jump lifts the chest 1.24 m, the air jump 0.93 more: what a hand can reach from the nearest floor
    assert.ok(k.y - top <= (k.kind === 'diamond' ? 3.4 : 2.6), `${k.kind} at ${k.x},${k.y},${k.z} is ${(k.y - top).toFixed(2)} m over the floor`);
    if (under) assert.ok(k.y - PICKUP_R[k.kind] > under.y - SLAB, `${k.kind} at ${k.x},${k.y},${k.z} is inside a slab`);
    assert.ok(k.y - PICKUP_R[k.kind] >= top - SLAB, 'not inside a slab');
  }
  assert.ok(course.pickups.filter((k) => k.kind === 'star').length >= 100, 'a hundred stars at least');
  assert.equal(course.pickups.filter((k) => k.kind === 'bubble').length, 20);
});

test('rings and the gate are caught at top speed, and only in the course direction; nothing is missed at 9.5 m/s', () => {
  const fast = 9.5 * STEP;
  for (const r of [...course.rings, course.gate]) {
    const z = (r.z0 + r.z1) / 2, y = r.y + 0.05;
    let hit = false;
    for (let x = r.x - r.dir * 3; Math.abs(x - r.x) <= 3; x += r.dir * fast) { if (crossed(r, { x: x - r.dir * fast, y, z }, { x, y, z })) hit = true; }
    assert.ok(hit, `ring at ${r.x} missed at top speed`);
    assert.ok(!crossed(r, { x: r.x + r.dir * 0.1, y, z }, { x: r.x - r.dir * 0.1, y, z }), 'not backwards');
    assert.ok(!crossed(r, { x: r.x - r.dir * 0.1, y, z: r.z1 + 1 }, { x: r.x + r.dir * 0.1, y, z: r.z1 + 1 }), 'not beside it');
  }
  assert.ok(crossed(course.start, { x: 7.9, y: 0.05, z: 0 }, { x: 8.1, y: 0.05, z: 0 }));
  // orders rise along the course on every lane, so a fall goes back to the last ring passed whichever lane it was on
  for (const z of [0, 20, 30]) { const R = course.rings.filter((r) => r.at.z === z).sort((a, b) => (a.x - b.x) * a.dir); assert.ok(R.length >= 2); for (let i = 1; i < R.length; i++) assert.ok(R[i]!.order > R[i - 1]!.order, `ring order at z ${z}`); }
  assert.ok(Math.min(...course.rings.filter((r) => r.dir < 0).map((r) => r.order)) > Math.max(...course.rings.filter((r) => r.dir > 0).map((r) => r.order)), 'the way back comes after the way out');
});

test('every platform has a section to face, and the pickup index finds what is near', () => {
  for (const p of course.platforms) { const c = centre(p); assert.ok(sectionAt(course, c.x, c.z), `platform ${p.x0}–${p.x1} at z ${p.z0}–${p.z1} is in no section`); }
  const ix = new PickupIndex(course.pickups), out: number[] = new Array(64).fill(0), k = course.pickups[0]!;
  const n = ix.near(k.x, k.y, k.z, 0.3, out);
  assert.ok(n >= 1 && out.slice(0, n).includes(0));
  assert.equal(ix.near(-100, 0, -100, 0.3, out), 0);
});

/** The Skates line as the platforms come, from the turn to home. */
function skatesLine(): Platform[] {
  const P = course.platforms, at = (x: number) => P.find((p) => x >= p.x0 && x <= p.x1 && 30 >= p.z0 && 30 <= p.z1)!;
  return [146, 133, 117, 102, 86, 71, 55, 40, 18].map(at);
}

test('the Skates line: every gap is made by a single jump at the tuck and by the air jump at the cruise, half a metre early too, and none on Boots', () => {
  const line = skatesLine(); let n = 0;
  for (let i = 1; i < line.length; i++) {
    const from = line[i - 1]!, to = line[i]!;
    assert.ok(to.x1 <= from.x0 - 0.1, 'the line runs west with a gap');
    assert.ok(jumpAcross(from, to, -1, true, true, 0, SKATES, 14), `skates gap ${from.x0}–${from.x1} (y ${from.y}) → ${to.x0}–${to.x1} (y ${to.y}) at the tuck with the air jump`);
    assert.ok(jumpAcross(from, to, -1, true, true, 0.5, SKATES, 14), `skates gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1}: half a metre early falls short`);
    assert.ok(jumpAcross(from, to, -1, true, false, 0, SKATES, 14), `skates gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1} at the cruise with the air jump`);
    assert.ok(jumpAcross(from, to, -1, true, false, 0.5, SKATES, 14), `skates gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1} at the cruise with the air jump, half a metre early`);
    assert.ok(jumpAcross(from, to, -1, false, true, 0, SKATES, 14), `skates gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1}: a single jump at the tuck falls short`);
    assert.ok(jumpAcross(from, to, -1, false, true, 0.5, SKATES, 14), `skates gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1}: a single jump at the tuck half a metre early falls short`);
    assert.ok(!jumpAcross(from, to, -1, false, false, 0, BOOTS, 6), `gap ${from.x0}–${from.x1} → ${to.x0}–${to.x1} is within a running jump on Boots: it is the Skates' line`);
    n++;
  }
  assert.equal(n, 8);
});

test('a boost pad on the Skates line carries a plain cruising jump over the gap after it, and the tuck with the air jump does not overshoot', () => {
  const line = skatesLine(); let n = 0;
  for (const pad of course.pads.filter((p) => p.kind === 'boost' && p.z === 30)) {
    const from = line.find((p) => pad.x >= p.x0 && pad.x <= p.x1)!, to = line[line.indexOf(from) + 1]!;
    assert.ok(jumpAcross(from, to, -1, false, false, 0, SKATES, 14, true), `the boost at ${pad.x} does not carry a plain jump over ${from.x0} → ${to.x1}`);
    assert.ok(jumpAcross(from, to, -1, true, true, 0, SKATES, 14, true), `the boost at ${pad.x} with the tuck and the air jump overshoots ${to.x0}–${to.x1}`);
    n++;
  }
  assert.equal(n, 3);
});

test('on skates a cruising jump at the edge carries about 4.3 m, the tuck with the air jump over 9', () => {
  assert.ok(Math.abs(jumpReach(SKATES, SKATES.run) - 4.3) < 0.4, `skates single ${jumpReach(SKATES, SKATES.run).toFixed(2)}`);
  assert.ok(jumpReach(SKATES, SKATES.sprint, 0, true) > 9, `skates tuck double ${jumpReach(SKATES, SKATES.sprint, 0, true).toFixed(2)}`);
});

test('the Skates line\'s stars and diamond sit within a glide of a lane platform; its rings and pads are on one', () => {
  const lane = course.platforms.filter((p) => p.z0 <= 30 && p.z1 >= 30);
  for (const k of course.pickups.filter((p) => p.line === 'skates')) {
    const near = lane.filter((p) => k.x >= p.x0 - 4.2 && k.x <= p.x1 + 4.2 && p.y <= k.y);
    assert.ok(near.length, `${k.kind} at ${k.x},${k.y},${k.z} floats over nothing`);
    assert.ok(k.y - Math.max(...near.map((p) => p.y)) <= 2.6, `${k.kind} at ${k.x} is too high over the lane`);
    assert.equal(k.z, 30);
  }
  for (const p of course.pads.filter((p) => p.z === 30)) assert.ok(lane.find((q) => p.x - p.w / 2 >= q.x0 && p.x + p.w / 2 <= q.x1 && p.y === q.y), `pad at ${p.x} is not on a lane platform`);
  for (const r of course.rings.filter((r) => r.at.z === 30)) assert.ok(lane.find((q) => r.x >= q.x0 && r.x <= q.x1 && r.y === q.y), `ring at ${r.x} is not on a lane platform`);
  assert.ok(sectionAt(course, 146, 20, 'skates')!.yaw === 0 && sectionAt(course, 146, 20, 'boots')!.yaw < 0, 'on skates the turn faces north for longer');
});
