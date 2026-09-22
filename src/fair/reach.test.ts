// Being at a booth is standing in front of its open side, not within a circle of its centre: behind its wall you are
// not there, a sideways step in the aisle does not hand you to the neighbour, and all of it fits the server's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Booth, LevelData } from '../../shared/types';
import { STAMP_RADIUS_M } from '../../shared/rules';
import { NavGrid } from '../game/nav';
import { buildFairLevel, fairLevelData } from './level';
import { DIR, OPPOSITE } from './stands';
import { AT_M, Reach, SLACK_AT, SLACK_STAY, STAY_M } from './reach';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/data/floor.json'), 'utf8')) as LevelData;
const level = fairLevelData(raw), fair = buildFairLevel(level), nav = new NavGrid(level), reach = new Reach(level, fair.stands);
const booths = level.booths.filter((b) => b.id !== level.hero.id);
const hd = (b: Booth) => level.decks.find((d) => d.level === b.deck)!.boothD / 2, hw = level.booth.w / 2;
const near = (b: Booth) => booths.filter((x) => Math.hypot(x.x - b.x, x.y - b.y) < 12);

test('every booth has somewhere to stand: on the floor, in front of an open side, inside the stamp radius', () => {
  let n = 0;
  for (const b of booths) {
    const p = reach.approach(b, { x: b.x, y: b.y - 10 }, nav);
    assert.ok(p, `${b.id} has a spot`); assert.ok(nav.walkable(p.x, p.y), `${b.id}: on the floor`);
    assert.ok(reach.frontDist(b, p, SLACK_AT) <= AT_M, `${b.id}: the spot counts as being there`);
    assert.ok(Math.hypot(p.x - b.x, p.y - b.y) < STAMP_RADIUS_M, `${b.id}: the server agrees`);
    assert.equal(reach.atBooth(near(b), p, null), b, `${b.id}: standing there, it is the booth you are at`);
    n++;
  }
  assert.equal(n, booths.length); assert.ok(n > 300);
});

/** Points out from a booth's single open side: `k` metres out, `side` metres along the front. */
const outFrom = (b: Booth) => { const open = reach.openSides(b)[0]!, [ox, oy] = DIR[open]; return (k: number, side = 0) => ({ x: b.x + ox * (hw + k) + oy * side, y: b.y + oy * (hd(b) + k) + ox * side }); };

test('behind a wall you are not at the booth; across the aisle the chip changes hands only past the middle, and a step along the front keeps it', () => {
  const b = booths.find((x) => reach.openSides(x).length === 1)!, out = outFrom(b), open = reach.openSides(b)[0]!, [bx, by] = DIR[OPPOSITE[open]];
  assert.equal(reach.atBooth(near(b), out(1.0), null), b, 'a metre out from the open side');
  assert.equal(reach.atBooth(near(b), { x: b.x, y: b.y }, null), b, 'inside the cell');
  const behind = { x: b.x + bx * (hw + 1.0), y: b.y + by * (hd(b) + 1.0) };
  assert.notEqual(reach.atBooth(near(b), behind, null), b, 'a metre behind its back wall is not it');
  assert.equal(reach.frontDist(b, behind, SLACK_STAY), Infinity);
  // the booth across the aisle, and how wide the aisle is
  const c = near(b).find((x) => x !== b && reach.frontDist(x, out(2.0), SLACK_AT) < Infinity)!;
  assert.ok(c, 'something faces this booth across the aisle');
  const aisle = reach.frontDist(c, out(0), SLACK_AT), mid = aisle / 2;
  assert.ok(aisle > 2 && aisle < 3.5, `a ${aisle.toFixed(1)} m aisle`);
  assert.equal(reach.atBooth(near(b), out(mid + 0.2), null), c, 'just past the middle, the nearer one, arriving');
  assert.equal(reach.atBooth(near(b), out(mid + 0.2), b), b, 'but having been at this one, still at it');
  assert.equal(reach.atBooth(near(b), out(mid + 0.5), b), c, 'half a metre past the middle, the other is plainly nearer');
  assert.equal(reach.atBooth(near(b), out(1.0, hd(b) + 0.3), b), b, 'a step along the front past its edge keeps it');
});

test('a booth facing open floor: at it within 1.6 m, still at it out to 2.2 m once there, gone past that', () => {
  const b = booths.find((x) => reach.openSides(x).length === 1 && !near(x).some((c) => c !== x && reach.frontDist(c, outFrom(x)(2.0), SLACK_AT) < Infinity))!;
  assert.ok(b, 'one exists on this plan'); const out = outFrom(b);
  assert.equal(reach.atBooth(near(b), out(1.5), null), b);
  assert.equal(reach.atBooth(near(b), out(2.0), null), null, 'two metres out is not yet at it');
  assert.equal(reach.atBooth(near(b), out(2.0), b), b, 'but having been there, still there');
  assert.equal(reach.atBooth(near(b), out(2.4), b), null, 'and gone past 2.2');
  assert.equal(reach.atBooth(near(b), out(1.0, hw + 0.4), null), b, 'a little past the edge sideways still counts');
  assert.notEqual(reach.atBooth(near(b), out(1.0, hw + 0.7), null), b, 'more is the neighbour, or nothing');
  assert.equal(reach.atBooth(near(b), out(1.0, hw + 0.7), b), b, 'unless already there');
});

test('the one you were sent to wins while it is within reach', () => {
  const b = booths.find((x) => reach.openSides(x).length === 1 && x.deck === 2)!, cands = near(b);
  const p = reach.approach(b, { x: b.x, y: b.y - 10 }, nav)!;
  assert.equal(reach.atBooth(cands, p, null, b), b);
  const far = { x: b.x + 9, y: b.y + 9 };
  assert.notEqual(reach.atBooth(cands, far, null, b), b, 'not from nine metres off');
});

test('the worst case of every rule here is inside the server\'s stamp radius', () => {
  const maxHd = Math.max(...level.decks.map((d) => d.boothD / 2));
  assert.ok(Math.hypot(maxHd + AT_M, hw + SLACK_AT) < STAMP_RADIUS_M, 'arriving');
  assert.ok(Math.hypot(maxHd + STAY_M, hw + SLACK_STAY) < STAMP_RADIUS_M, 'staying');
  assert.ok(Math.hypot(hw + STAY_M, maxHd + SLACK_STAY) < STAMP_RADIUS_M, 'staying, at a side that opens east or west');
});
