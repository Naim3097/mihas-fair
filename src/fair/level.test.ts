import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelData } from '../../shared/types';
import { MOVEMENT } from '../../content';
import { newBody, overlapsAny, buildGrid } from '../ceritera/game/physics';
import { v3 } from '../ceritera/game/v3';
import { CELL, WALL_H, buildFairLevel, fairLevelData, toPlan, toWorld, wallKey } from './level';
import { planStands } from './stands';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/data/floor.json'), 'utf8')) as LevelData;
const level = fairLevelData(raw);

test('the plan is read at the standard 3 m module, and level 2 is drawn at true scale', () => {
  assert.equal(level.booth.w, CELL); assert.equal(level.booth.d, CELL); assert.equal(level.booth.h, WALL_H);
  const d2 = level.decks.find((d) => d.level === 2)!, b = level.booths.find((x) => x.deck === 2)!;
  const box = buildFairLevel(level).boothBox(b);
  assert.ok(Math.abs(box.max.x - box.min.x - CELL) < 1e-9, 'a cell is 3 m wide');
  assert.ok(Math.abs(box.max.z - box.min.z - CELL) < 1e-6, `a level-2 cell is ${d2.boothD} m apart on the plan and 3 m deep in the world`);
  const p = toPlan(toWorld(35.1, 30));
  assert.ok(Math.abs(p.x - 35.1) < 1e-9 && Math.abs(p.y - 30) < 1e-9, 'plan and world agree both ways inside the corrected band');
  const q = toPlan(toWorld(60, -80));
  assert.ok(Math.abs(q.y + 80) < 1e-9, 'and outside it');
});

test('stands: every booth is its own stand (no names in the plan to join them), partitions go where a neighbour is, fronts open to the aisle', () => {
  const stands = planStands(level);
  assert.ok(stands.every((s) => s.cells.length === 1), 'booths carry no company names, so none are merged into blocks');
  const hero = stands.find((s) => s.cells.some((c) => c.b.id === level.hero.id))!;
  assert.equal(hero.cells.length, 1);
  assert.deepEqual([...hero.cells[0]!.open].sort(), ['S', 'W'], 'booth 8H18A is a corner: open to the west aisle and the south one, as the plan draws it');
  assert.deepEqual([...hero.cells[0]!.walled].sort(), ['E', 'N']);
  assert.equal(hero.front, 'W');
  const kinds = new Map<string, number>();
  for (const s of stands) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  assert.ok((kinds.get('shell') ?? 0) > 150 && (kinds.get('corner') ?? 0) > 100, JSON.stringify([...kinds]));
  const cells = stands.reduce((n, s) => n + s.cells.length, 0);
  assert.equal(cells, level.booths.length, 'every cell belongs to exactly one stand');
});

test('the box world: one partition per shared edge, a slab per level, twelve panes of glass, counters in the booths', () => {
  const fair = buildFairLevel(level);
  const tags = new Map<string, number>();
  for (const b of fair.def.boxes) tags.set(b.tag ?? '?', (tags.get(b.tag ?? '?') ?? 0) + 1);
  const edges = new Set<string>();
  for (const s of fair.stands) for (const c of s.cells) for (const side of c.walled) edges.add(wallKey(c.b, side));
  assert.equal(tags.get('wall'), edges.size + level.walls.length);
  assert.equal(tags.get('booth'), undefined, 'cells are no longer solid');
  assert.equal(tags.get('floor'), level.decks.length);
  assert.equal(fair.glass.length, level.decks.length * 4);
  assert.ok((tags.get('furniture') ?? 0) > level.booths.length / 4, 'the stands bring counters');
});

test('the spawn stands on a floor with nothing in the way, and the grid answers the same as the full list', () => {
  const fair = buildFairLevel(level), plain = { boxes: fair.def.boxes }, grid = { boxes: fair.def.boxes, grid: buildGrid(fair.def.boxes) };
  const b = newBody(v3(fair.def.spawn.pos.x, 0.01, fair.def.spawn.pos.z), MOVEMENT.radius, MOVEMENT.height);
  assert.ok(!overlapsAny(grid, b), 'the Hall 8 entrance is clear');
  b.pos.y = -0.01;
  assert.ok(overlapsAny(grid, b), 'and has a floor under it');
  // a walk into the hero booth from its open west side, and into its back wall
  const h = level.hero, inside = toWorld(h.x + 0.6, h.y - 0.15), wall = toWorld(h.x + 1.5, h.y);
  const c = newBody(v3(inside.x, 0.01, inside.z), MOVEMENT.radius, MOVEMENT.height);
  assert.ok(!overlapsAny(grid, c) && !overlapsAny(plain, c), 'the booth is somewhere you walk into');
  c.pos.x = wall.x; c.pos.z = wall.z;
  assert.ok(overlapsAny(grid, c) && overlapsAny(plain, c), 'its back partition is solid');
});
