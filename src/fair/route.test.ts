// Walking somewhere on its own, on the real floor plan and the real physics, with no screen: a route is followed
// to its end at a jog, the body stops there, and a body pressed against something plans its way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelData } from '../../shared/types';
import { classByKey } from '../../content';
import { emptyIntent } from '../ceritera/game/controller';
import { Sim, STEP } from '../ceritera/game/sim';
import { lenXZ } from '../ceritera/game/v3';
import { NavGrid, pathLength, type P2 } from '../game/nav';
import { buildFairLevel, fairLevelData, toPlan, toWorld } from './level';
import { DIR } from './stands';
import { FAIR_MOVEMENT } from './movement';
import { Reach } from './reach';
import { RouteFollower, type Step } from './route';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/data/floor.json'), 'utf8')) as LevelData;
const level = fairLevelData(raw), fair = buildFairLevel(level), nav = new NavGrid(level), reach = new Reach(level, fair.stands);
const newSim = () => { const s = new Sim('pengembara', classByKey('pengembara')!.base, fair.def, 1, FAIR_MOVEMENT); s.player.body.pos.y = 0.05; return s; };
const deckOf = (p: P2) => (level.decks.find((d) => p.y >= d.y0 - 15 && p.y <= d.y1 + 15) ?? level.decks[0]!).level;
const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Frames until the follower says it is done, with a camera that never turns: the follower has to steer relative to it. */
function walk(sim: Sim, f: RouteFollower, camYaw: number, maxS: number) {
  let t = 0, sprinted = false, res: Step = 'idle';
  while (t < maxS) {
    const it = emptyIntent();
    res = f.step(it, toPlan(sim.player.body.pos), camYaw, lenXZ(sim.player.body.vel), STEP);
    if (res === 'arrived' || res === 'lost') break;
    sim.camYaw = camYaw; sim.step(it, STEP); t += STEP;
    if (sim.player.gait === 'sprint') sprinted = true;
  }
  return { t, sprinted, res };
}

/** A booth on the spawn's level with a route of 20–40 m to the front of it. */
function targetBooth(from: P2) {
  const deck = deckOf(from);
  for (const b of level.booths.filter((x) => x.deck === deck && x.id !== level.hero.id).sort((p, q) => dist(p, from) - dist(q, from))) {
    const to = reach.approach(b, from, nav), path = to && nav.path(from, to);
    if (to && path && pathLength(path) > 20 && pathLength(path) < 40) return { b, to, path };
  }
  throw new Error('no booth 20–40 m from the spawn');
}

test('a route to a booth is walked to the spot in front of it at a jog, never a sprint, and the body stops there', () => {
  const sim = newSim(), f = new RouteFollower(nav), from = toPlan(sim.player.body.pos), { to, path } = targetBooth(from);
  assert.ok(f.set(path)); assert.ok(f.active); assert.deepEqual(f.goal, to);
  const L = pathLength(path), { t, sprinted, res } = walk(sim, f, 1.1, 60);
  assert.equal(res, 'arrived');
  assert.ok(!sprinted, 'a jog, not a sprint');
  assert.ok(t < L / FAIR_MOVEMENT.run + 4, `${L.toFixed(1)} m took ${t.toFixed(1)} s`);
  assert.ok(dist(toPlan(sim.player.body.pos), to) < 0.6, 'ends on the spot');
  assert.ok(!f.active && f.goal === null);
  for (let i = 0; i < 60; i++) sim.step(emptyIntent(), STEP);
  assert.ok(lenXZ(sim.player.body.vel) < 0.05, 'and stands still');
});

test('the same route from a camera turned the other way: the push is relative to the camera, the walk is the same', () => {
  const sim = newSim(), f = new RouteFollower(nav), from = toPlan(sim.player.body.pos), { to, path } = targetBooth(from);
  f.set(path);
  const { res } = walk(sim, f, -2.4, 60);
  assert.equal(res, 'arrived'); assert.ok(dist(toPlan(sim.player.body.pos), to) < 0.6);
});

test('sent through a booth (a route the grid never made), the body is stopped by its wall, plans again, and gets round', () => {
  const sim = newSim(), f = new RouteFollower(nav), from = toPlan(sim.player.body.pos), deck = deckOf(from);
  // a booth open on one side only, near the spawn: the point just behind its back wall is the goal, and the straight line there goes through the cell
  const b = level.booths.filter((x) => x.deck === deck && x.id !== level.hero.id && reach.openSides(x).length === 1).sort((p, q) => dist(p, from) - dist(q, from))[0]!;
  const [ox, oy] = DIR[reach.openSides(b)[0]!], front = reach.approach(b, from, nav)!, hd = level.decks.find((d) => d.level === b.deck)!.boothD / 2;
  const behind = { x: b.x - ox * (level.booth.w / 2 + 0.6), y: b.y - oy * (hd + 0.6) };
  f.set([front, behind]);
  const w = toWorld(front.x, front.y); sim.player.body.pos.x = w.x; sim.player.body.pos.z = w.z;
  assert.ok(dist(toPlan(sim.player.body.pos), front) < 0.05, 'placed at the front');
  const { res, t } = walk(sim, f, Math.PI, 90);
  assert.equal(res, 'arrived', `after ${t.toFixed(1)} s`);
  const end = nav.nearestWalkable(behind.x, behind.y)!;
  assert.ok(dist(toPlan(sim.player.body.pos), end) < 0.8, 'at the nearest floor to the point behind the wall');
});

test('no path, no route', () => {
  const f = new RouteFollower(nav);
  assert.equal(f.set(null), false); assert.equal(f.set([{ x: 0, y: 0 }]), false); assert.ok(!f.active);
  assert.equal(f.step(emptyIntent(), { x: 0, y: 0 }, 0, 0, STEP), 'idle');
});
