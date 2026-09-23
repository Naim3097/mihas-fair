// MITEC as a box world. The organiser's floor plan (public/data/floor.json, three levels side by side in one plan
// space) becomes what the body collides with: floor slabs, the partitions between stands (the fronts are open, so a
// booth is somewhere you walk into), the counters, the low walls, the furniture of the named places, and the glass
// that keeps everyone inside each level. The same boxes are what the world draws, so what you see is what you can
// stand on. Plan metres (x east, y north) map to world (x, −z) as Mission X does, with one correction below.
import type { Booth, LevelData, Rect } from '../../shared/types';
import { buildPlaces, type Place } from '../game/places';
import type { LevelDef } from '../ceritera/game/level';
import { box, type Box } from '../ceritera/game/physics';
import { v3, type V3 } from '../ceritera/game/v3';
import { CELL, DIR, LEVEL2_ROW_M, WALL_H, planLevel, planStands, standFurniture, type StandInfo } from '../../shared/stands';

export const CX = 95, CY = 72;

/** Page 2 of the floor plan (level 2) is drawn 8.3 % taller than its own dimensions: its 3 m cells sit 3.25 m
 * apart down the columns and 3.0 m across, the café is 12 m deep where the plan says 11. The fair draws that deck
 * at true scale, compressing plan y about the deck's centre; the plan space itself stays as it is, so presence,
 * stamps and Mission X all keep the same numbers. */
const FIX = { y0: 20, y1: 117, s: CELL / LEVEL2_ROW_M } as const;
const FIX_C = (FIX.y0 + FIX.y1) / 2;
export const fixY = (y: number): number => (y > FIX.y0 && y < FIX.y1 ? FIX_C + (y - FIX_C) * FIX.s : y);
export const unfixY = (y: number): number => (y > FIX_C + (FIX.y0 - FIX_C) * FIX.s && y < FIX_C + (FIX.y1 - FIX_C) * FIX.s ? FIX_C + (y - FIX_C) / FIX.s : y);
/** How many world metres one plan metre of y is, at this plan y. */
export const yScaleAt = (y: number): number => (y > FIX.y0 && y < FIX.y1 ? FIX.s : 1);

export const toWorld = (x: number, y: number, h = 0): V3 => v3(x - CX, h, -(fixY(y) - CY));
export const toPlan = (p: { x: number; z: number }): { x: number; y: number } => ({ x: p.x + CX, y: unfixY(CY - p.z) });

/** A plan rectangle between two heights, as a world box. */
export const rectBox = (r: Rect, y0: number, y1: number, tag?: string): Box => box(r.x0 - CX, y0, -(fixY(r.y1) - CY), r.x1 - CX, y1, -(fixY(r.y0) - CY), tag);

export const GLASS_H = 9;
export const DECK_MARGIN = 3;
/** The shell scheme: 3 m modules, 2.5 m partitions. */
export { CELL, WALL_H };
export const WALL_T = 0.08;

/** The plan as the fair reads it: the standard 3 m × 3 m module on every deck (the file's 2.82 was measured off
 * the drawing's line work; the plan says 3 m x 3 m), with level 2's cells 3.25 m apart in plan y because of the
 * stretch described above. Everything else is the file's. */
export function fairLevelData(level: LevelData): LevelData {
  // the Hall 8 entrance spawn sits on the line of a booth column in the file; the fair drops you in the middle of the aisle beside it
  const spawns = { ...level.spawns, short: { ...level.spawns.short, x: 36.4 } };
  return { ...planLevel(level), spawns };
}

export interface FairLevel {
  def: LevelDef;
  places: Place[];
  stands: StandInfo[];
  /** The containment: one pane per side of each level, drawn as glass, collided with as walls. */
  glass: { box: Box; deck: number }[];
  boothBox: (b: Booth) => Box;
}

export function buildFairLevel(level: LevelData): FairLevel {
  const boxes: Box[] = [];
  const depth = new Map(level.decks.map((d) => [d.level, d.boothD]));
  const boothBox = (b: Booth): Box => {
    const w = level.booth.w / 2, d = (depth.get(b.deck) ?? level.booth.d) / 2;
    return rectBox({ x0: b.x - w, y0: b.y - d, x1: b.x + w, y1: b.y + d }, 0, level.booth.h, 'booth');
  };
  const glass: FairLevel['glass'] = [];
  for (const d of level.decks) {
    const r = { x0: d.x0 - DECK_MARGIN, y0: d.y0 - DECK_MARGIN, x1: d.x1 + DECK_MARGIN, y1: d.y1 + DECK_MARGIN };
    boxes.push(rectBox(r, -1, 0, 'floor'));
    const t = 0.3;
    for (const side of [
      { x0: r.x0 - t, y0: r.y0 - t, x1: r.x1 + t, y1: r.y0 },
      { x0: r.x0 - t, y0: r.y1, x1: r.x1 + t, y1: r.y1 + t },
      { x0: r.x0 - t, y0: r.y0, x1: r.x0, y1: r.y1 },
      { x0: r.x1, y0: r.y0, x1: r.x1 + t, y1: r.y1 },
    ]) { const g = rectBox(side, 0, GLASS_H, 'glass'); boxes.push(g); glass.push({ box: g, deck: d.level }); }
  }
  // the stands: a partition on every walled side (one per shared edge), a counter or a tower inside
  const stands = planStands(level);
  const seen = new Set<string>();
  for (const st of stands) {
    for (const c of st.cells) for (const s of c.walled) {
      const k = wallKey(c.b, s), r = wallRect(c.b, s, st.w, st.d);
      if (seen.has(k)) continue; seen.add(k);
      boxes.push(rectBox(r, 0, WALL_H, 'wall'));
    }
    for (const f of standFurniture(st, level.hero.id)) boxes.push(rectBox(f.rect, st.kind === 'island' ? 0.1 : 0, f.h, 'furniture'));
    if (st.kind === 'island') boxes.push(rectBox(st.rect, 0, 0.1, 'platform'));
  }
  for (const w of level.walls) boxes.push(rectBox({ x0: w.x0, y0: w.y0, x1: Math.max(w.x1, w.x0 + 0.4), y1: Math.max(w.y1, w.y0 + 0.4) }, 0, 0.8, 'wall'));
  const places = buildPlaces(level);
  for (const p of places) {
    for (const r of p.blocked) boxes.push(rectBox(r, 0, 1.0, 'furniture'));
    // anything taller than a counter (a stage backdrop, a studio wall) keeps its height, so the camera stays out of it too
    for (const s of p.solids) if (s.z + s.h > 1.0) boxes.push(rectBox({ x0: s.x - s.w / 2, y0: s.y - s.d / 2, x1: s.x + s.w / 2, y1: s.y + s.d / 2 }, Math.max(0, s.z), s.z + s.h, 'furniture'));
  }

  const s = level.spawns.short;
  return {
    def: { size: 120, boxes, props: [], spawn: { pos: toWorld(s.x, s.y), yaw: Math.PI }, enemies: [], lanterns: [] },
    places,
    stands,
    glass,
    boothBox,
  };
}

/** The plan rectangle of the partition on one side of a cell: along the cell's edge, WALL_T thick, centred on the
 * line two cells share, so the wall between back-to-back booths is one wall. */
export function wallRect(b: Booth, side: 'N' | 'E' | 'S' | 'W', w: number, d: number): Rect {
  const [dx, dy] = DIR[side], hw = w / 2, hd = d / 2, t = WALL_T / 2;
  if (dx === 0) { const y = b.y + dy * hd; return { x0: b.x - hw, y0: y - t, x1: b.x + hw, y1: y + t }; }
  const x = b.x + dx * hw; return { x0: x - t, y0: b.y - hd, x1: x + t, y1: b.y + hd };
}

/** One key per edge line, the same from either side of it. */
export function wallKey(b: Booth, side: 'N' | 'E' | 'S' | 'W'): string {
  const [dx, dy] = DIR[side];
  return `${b.deck}|${(b.x + dx * 1.5).toFixed(1)}|${(b.y + dy * 1.6).toFixed(1)}|${dx === 0 ? 'h' : 'v'}`;
}
