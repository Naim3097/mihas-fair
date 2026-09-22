// The kits on the fair's floor: under the server's speed cap, gripping in the aisles, flying under the glass, and
// switched only among what is owned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SPEED_MPS } from '../../shared/rules';
import { FAIR_KITS, FLY_CEILING, KIT_TOP_SPEED, nextKit } from './kits';
import { GLASS_H, WALL_H } from './level';
import { FAIR_MOVEMENT } from './movement';

test('no kit outruns the server: every floor speed and the flight speed stay under the cap, with a margin for a ping across a corner', () => {
  assert.ok(KIT_TOP_SPEED <= MAX_SPEED_MPS * 0.75, `${KIT_TOP_SPEED} m/s against a cap of ${MAX_SPEED_MPS}`);
  assert.equal(FAIR_KITS.boots, FAIR_MOVEMENT, 'Boots are the fair\'s own body');
  assert.ok(FAIR_KITS.skates.sprintMax > FAIR_MOVEMENT.sprintMax * 1.8, 'Skates are worth having');
  assert.ok(FAIR_KITS.skates.accel >= 16 && FAIR_KITS.skates.decel >= 16, 'and grip like feet in an aisle');
  assert.ok(FAIR_KITS.jetpack.thrust && !FAIR_KITS.boots.thrust && !FAIR_KITS.skates.thrust, 'only the Jetpack thrusts');
  assert.equal(FAIR_KITS.jetpack.airJumps, 0);
});

test('the jetpack\'s ceiling clears every partition and stays under the glass that keeps a level in', () => {
  assert.ok(FLY_CEILING > WALL_H + 2 && FLY_CEILING < GLASS_H - 1.5);
});

test('the next kit goes round what is owned', () => {
  assert.equal(nextKit(['boots'], 'boots'), 'boots');
  assert.equal(nextKit(['boots', 'skates'], 'boots'), 'skates'); assert.equal(nextKit(['boots', 'skates'], 'skates'), 'boots');
  assert.equal(nextKit(['boots', 'jetpack'], 'boots'), 'jetpack'); assert.equal(nextKit(['boots', 'skates', 'jetpack'], 'skates'), 'jetpack'); assert.equal(nextKit(['boots', 'skates', 'jetpack'], 'jetpack'), 'boots');
  assert.equal(nextKit(['boots'], 'jetpack'), 'boots', 'a kit no longer owned falls back to Boots');
});
