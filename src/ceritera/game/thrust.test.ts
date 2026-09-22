// Thrust in the shared controller: nothing without a thrust block in the tuning (the RPG and the fair fly nothing),
// and with one, a climb capped at the tuning's rate on a tank that drains in the air and refills on the floor,
// stopped by the ceiling, and a soft landing under thrust that is no fall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT, classByKey, type MovementDef } from '../../../content';
import { emptyIntent } from './controller';
import { box } from './physics';
import { Sim, STEP } from './sim';
import { v3 } from './v3';
import { JETPACK } from '../../playground/gear';

const level = { size: 60, boxes: [box(-20, -1, -20, 20, 0, 20, 'floor'), box(-20, 18, -20, 20, 19, 20, 'ceiling')], props: [], spawn: { pos: v3(0, 0.05, 0), yaw: 0 }, enemies: [], lanterns: [] };
const newSim = (M: MovementDef = MOVEMENT) => new Sim('pengembara', classByKey('pengembara')!.base, level, 1, M);
const T = JETPACK.thrust!;

/** Jump, then hold the button for `hold` seconds, then nothing; the feet's height every step. */
function arc(M: MovementDef, hold: number, seconds = 3): { ys: number[]; sim: Sim } {
  const sim = newSim(M), ys: number[] = [];
  for (let t = 0; t < seconds; t += STEP) { sim.step({ ...emptyIntent(), jump: t === 0, thrust: t < hold }, STEP); ys.push(sim.player.body.pos.y); }
  return { ys, sim };
}

test('without a thrust block the button does nothing: the same arc, no fuel, never firing', () => {
  const held = arc(MOVEMENT, 1), free = arc(MOVEMENT, 0);
  assert.deepEqual(held.ys, free.ys);
  assert.equal(held.sim.player.fuel, 0); assert.equal(held.sim.player.thrusting, false);
});

test('with one, the body climbs at up to the cap, burns the tank at its rate, stops under the ceiling, and refills on the floor', () => {
  const sim = newSim(JETPACK), p = sim.player, b = p.body;
  assert.equal(p.fuel, T.fuel);
  let top = 0, climbMax = 0, fired = 0;
  for (let t = 0; t < 5; t += STEP) {
    sim.step({ ...emptyIntent(), jump: t === 0, thrust: true }, STEP);
    if (t > 0.4) climbMax = Math.max(climbMax, b.vel.y);
    if (p.thrusting) fired += STEP;
    top = Math.max(top, b.pos.y);
  }
  assert.ok(climbMax <= T.climb + 1e-6 && climbMax > T.climb - 0.2, `the climb is capped at ${T.climb}: ${climbMax.toFixed(2)}`);
  assert.ok(top > 15 && top + JETPACK.height <= 18.01, `stopped under the ceiling at ${top.toFixed(2)}`);
  assert.ok(Math.abs(fired - T.fuel / T.drain) < 0.05, `the tank lasts ${(T.fuel / T.drain).toFixed(2)} s of thrust: ${fired.toFixed(2)}`);
  assert.equal(p.fuel, 0);
  // dry: it falls; on the floor the tank fills at its rate
  for (let t = 0; t < 3; t += STEP) sim.step({ ...emptyIntent(), thrust: true }, STEP);
  assert.ok(b.grounded, 'down and landed');
  p.fuel = 0; const before = p.fuel;
  for (let t = 0; t < 1; t += STEP) sim.step(emptyIntent(), STEP);
  assert.ok(Math.abs(p.fuel - before - T.refill) < 1, `refilled ${T.refill} in a second: ${(p.fuel - before).toFixed(1)}`);
  for (let t = 0; t < 4; t += STEP) sim.step(emptyIntent(), STEP);
  assert.equal(p.fuel, T.fuel);
});

test('in the air the stick takes a jetpack to its air speed and no further; a boots body stays at its run', () => {
  for (const [M, want] of [[JETPACK, T.airSpeed], [MOVEMENT, MOVEMENT.run]] as const) {
    const sim = newSim(M), b = sim.player.body; b.pos.y = 12; b.grounded = false; sim.player.peak = 12;
    let fastest = 0;
    for (let t = 0; t < 1.2; t += STEP) { sim.step({ ...emptyIntent(), move: { x: 0, y: 1 }, thrust: true }, STEP); fastest = Math.max(fastest, Math.hypot(b.vel.x, b.vel.z)); }
    assert.ok(Math.abs(fastest - want) < 0.05, `${M === JETPACK ? 'jetpack' : 'boots'} reaches ${want} in the air: ${fastest.toFixed(2)}`);
  }
});

test('a hover down from eight metres is no fall: no stagger under thrust, a stagger in free fall', () => {
  for (const soft of [false, true]) {
    const sim = newSim(JETPACK), p = sim.player, b = p.body; b.pos.y = 8; b.grounded = false; p.peak = 8;
    for (let t = 0; t < 4 && !b.grounded; t += STEP) sim.step({ ...emptyIntent(), thrust: soft && b.vel.y < -5 }, STEP);
    assert.ok(b.grounded, 'landed');
    if (soft) assert.equal(p.status.stagger, 0, 'a soft landing');
    else assert.ok(p.status.stagger > 0, 'a hard one');
  }
});
