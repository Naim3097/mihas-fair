// A stand is what an exhibitor booked: one shell-scheme cell, or several joined into a block. The floor plan draws
// the hall as 3 m cells in back-to-back column pairs with aisles between; a company that books many cells has its
// name written across them and the walls between them taken out. This reads that off the plan: which cells form a
// stand, which of each cell's four sides face a neighbour (a wall goes there), which face an aisle (open, with the
// fascia board), and what kind of stand it makes: a shell-scheme cell, a corner with two open sides, a block, or an
// island the aisles run all the way round. Pure plan geometry, no rendering: the level builds its collision from it
// and the world dresses it.
import type { Booth, LevelData, Rect } from '../../shared/types';
import { buildStands } from '../game/stands';

export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];
/** Unit step on the plan for each side (x east, y north). */
export const DIR: Record<Side, readonly [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
export const OPPOSITE: Record<Side, Side> = { N: 'S', E: 'W', S: 'N', W: 'E' };
export type Archetype = 'shell' | 'corner' | 'block' | 'island';

export interface Cell {
  i: number;
  b: Booth;
  /** sides where the next cell belongs to the same stand: no wall, no fascia */
  inner: Set<Side>;
  /** sides with another stand behind them, or the hall's own wall: a partition goes there */
  walled: Set<Side>;
  /** sides that face an aisle: open, with the fascia board over them */
  open: Set<Side>;
}

export interface StandInfo {
  id: string;
  name: string;
  deck: number;
  cells: Cell[];
  kind: Archetype;
  /** the side most of the stand's open edges face: the fascia name and the counter go there */
  front: Side;
  /** the plan rectangle round the whole stand */
  rect: Rect;
  /** the cell module on this deck, plan metres */
  w: number;
  d: number;
  /** where the name reads best: the centre of the longest run of cells along the front, and its length */
  label: { x: number; y: number; len: number };
}

const inside = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** Every stand on every deck, with each cell's sides classified. */
export function planStands(level: LevelData): StandInfo[] {
  const booths = level.booths, W = level.booth.w, depth = new Map(level.decks.map((k) => [k.level, k.boothD]));
  const D = (b: Booth) => depth.get(b.deck) ?? level.booth.d;
  // a 1 m hash so a cell's neighbour is found in a few lookups
  const hash = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;
  booths.forEach((b, i) => { const k = key(b.x, b.y); (hash.get(k) ?? hash.set(k, []).get(k)!).push(i); });
  const at = (x: number, y: number, deck: number): number => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of hash.get(key(x + dx, y + dy)) ?? []) {
      const c = booths[i]!; if (c.deck === deck && Math.abs(c.x - x) < 0.45 && Math.abs(c.y - y) < 0.45) return i;
    }
    return -1;
  };
  // stands: the named groups first (cells of one exhibitor side by side), then every other cell on its own
  const standOf = new Int32Array(booths.length).fill(-1);
  const groups: { name: string; deck: number; cells: number[] }[] = [];
  for (const s of buildStands(level)) { groups.push({ name: s.name, deck: s.deck, cells: s.booths }); }
  const heroIdx = booths.findIndex((b) => b.id === level.hero.id);
  if (heroIdx >= 0) groups.push({ name: booths[heroIdx]!.name, deck: booths[heroIdx]!.deck, cells: [heroIdx] });
  groups.forEach((g, gi) => { for (const i of g.cells) standOf[i] = gi; });
  booths.forEach((b, i) => { if ((standOf[i] ?? -1) < 0) { standOf[i] = groups.length; groups.push({ name: b.name, deck: b.deck, cells: [i] }); } });
  const pads = level.areas.filter((a) => a.kind === 'pad');
  const aisleAt = (x: number, y: number) => level.walkable.some((r) => inside(r, x, y)) && !level.walls.some((r) => inside({ x0: r.x0 - 0.3, y0: r.y0 - 0.3, x1: r.x1 + 0.3, y1: r.y1 + 0.3 }, x, y)) && !pads.some((a) => inside(a, x, y));

  return groups.map((g, gi) => {
    const cells: Cell[] = g.cells.map((i) => {
      const b = booths[i]!, d = D(b), inner = new Set<Side>(), walled = new Set<Side>(), open = new Set<Side>();
      for (const s of SIDES) {
        const [dx, dy] = DIR[s], n = at(b.x + dx * W, b.y + dy * d, b.deck);
        if (n >= 0) { (standOf[n] === gi ? inner : walled).add(s); continue; }
        // nothing booked there: an aisle, or the hall's wall behind a row that backs onto it
        const px = b.x + dx * (W / 2 + 0.9), py = b.y + dy * (d / 2 + 0.9);
        (aisleAt(px, py) ? open : walled).add(s);
      }
      return { i, b, inner, walled, open };
    });
    const d = D(booths[g.cells[0]!]!);
    const openCount: Record<Side, number> = { N: 0, E: 0, S: 0, W: 0 };
    let anyWalled = false;
    for (const c of cells) { for (const s of c.open) openCount[s]++; if (c.walled.size) anyWalled = true; }
    const front = (['S', 'N', 'W', 'E'] as Side[]).reduce((a, s) => (openCount[s] > openCount[a] ? s : a));
    const kind: Archetype = !anyWalled ? 'island' : cells.length >= 3 ? 'block' : cells.length === 1 && cells[0]!.open.size >= 2 ? 'corner' : 'shell';
    const xs = cells.map((c) => c.b.x), ys = cells.map((c) => c.b.y);
    const rect = { x0: Math.min(...xs) - W / 2, y0: Math.min(...ys) - d / 2, x1: Math.max(...xs) + W / 2, y1: Math.max(...ys) + d / 2 };
    // the longest run of front-facing cells along the front: where one name reads across the stand
    const facing = cells.filter((c) => c.open.has(front));
    const along = front === 'N' || front === 'S' ? 'x' : 'y', across = along === 'x' ? 'y' : 'x', pitch = along === 'x' ? W : d;
    let best: Cell[] = [];
    const lines = new Map<number, Cell[]>();
    for (const c of facing) { const k = Math.round(c.b[across] * 4); (lines.get(k) ?? lines.set(k, []).get(k)!).push(c); }
    for (const line of lines.values()) {
      line.sort((p, q) => p.b[along] - q.b[along]);
      let run = [line[0]!];
      for (let n = 1; n <= line.length; n++) {
        if (n < line.length && line[n]!.b[along] - line[n - 1]!.b[along] <= pitch + 0.45) { run.push(line[n]!); continue; }
        if (run.length > best.length) best = run;
        run = n < line.length ? [line[n]!] : [];
      }
    }
    if (!best.length) best = [cells[0]!];
    const label = { x: best.reduce((s, c) => s + c.b.x, 0) / best.length, y: best.reduce((s, c) => s + c.b.y, 0) / best.length, len: best.length * pitch };
    return { id: booths[g.cells[0]!]!.id, name: g.name, deck: g.deck, cells, kind, front, rect, w: W, d, label };
  });
}

/** The furniture a stand comes with, as plan rectangles the body cannot walk through, with heights: the shell
 * scheme's information counter just inside the front, or an island's tower and plinths. */
export function standFurniture(st: StandInfo, heroId?: string): { rect: Rect; h: number; kind: 'counter' | 'tower' | 'plinth' | 'sign' }[] {
  const out: { rect: Rect; h: number; kind: 'counter' | 'tower' | 'plinth' | 'sign' }[] = [];
  if (st.kind === 'island') {
    const cx = (st.rect.x0 + st.rect.x1) / 2, cy = (st.rect.y0 + st.rect.y1) / 2;
    out.push({ rect: { x0: cx - 0.8, y0: cy - 0.8, x1: cx + 0.8, y1: cy + 0.8 }, h: 3.6, kind: 'tower' });
    const rx = (st.rect.x1 - st.rect.x0) / 2 - 1.2, ry = (st.rect.y1 - st.rect.y0) / 2 - 1.2;
    if (rx > 1.5 && ry > 1.5) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) out.push({ rect: { x0: cx + sx * rx - 0.3, y0: cy + sy * ry - 0.3, x1: cx + sx * rx + 0.3, y1: cy + sy * ry + 0.3 }, h: 0.9, kind: 'plinth' });
    return out;
  }
  const c = counterOf(st);
  if (c) out.push({ rect: c.rect, h: 1.0, kind: 'counter' });
  const sign = heroId ? signOf(st, heroId) : null;
  if (sign) out.push({ rect: sign, h: 1.0, kind: 'sign' });
  return out;
}

/** Where the information counter stands: 0.7 m inside the front edge of the front run's first cell, toward the
 * left as seen from the aisle. Returns its plan rectangle and which way it faces. */
export function counterOf(st: StandInfo): { rect: Rect; face: Side; x: number; y: number } | null {
  const front = st.front, facing = st.cells.filter((c) => c.open.has(front));
  if (!facing.length) return null;
  // the cell nearest the label centre along the front
  const along = front === 'N' || front === 'S' ? 'x' : 'y';
  const cell = facing.reduce((a, c) => (Math.abs(c.b[along] - st.label[along]) < Math.abs(a.b[along] - st.label[along]) ? c : a));
  const [dx, dy] = DIR[front], half = front === 'N' || front === 'S' ? st.d / 2 : st.w / 2;
  // 0.95 m in from the open edge, shifted 0.7 m along the edge to the aisle's left (the aisle's right stays clear to walk in)
  const leftOf: Record<Side, readonly [number, number]> = { N: [1, 0], S: [-1, 0], E: [0, -1], W: [0, 1] };
  const [lx, ly] = leftOf[front];
  const x = cell.b.x + dx * (half - 0.95) + lx * 0.7, y = cell.b.y + dy * (half - 0.95) + ly * 0.7;
  const w = along === 'x' ? 1.2 : 0.55, d = along === 'x' ? 0.55 : 1.2;
  return { rect: { x0: x - w / 2, y0: y - d / 2, x1: x + w / 2, y1: y + d / 2 }, face: front, x, y };
}

/** Lean X Digital's A-frame sign: at the aisle edge of its booth, to the right as you come in, angled to the aisle. */
export function signOf(st: StandInfo, heroId: string): Rect | null {
  const cell = st.cells.find((c) => c.b.id === heroId); if (!cell || !cell.open.has(st.front)) return null;
  const [dx, dy] = DIR[st.front], half = st.front === 'N' || st.front === 'S' ? st.d / 2 : st.w / 2;
  const rightOf: Record<Side, readonly [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const [rx, ry] = rightOf[st.front];
  const x = cell.b.x + dx * (half - 0.55) + rx * 0.95, y = cell.b.y + dy * (half - 0.55) + ry * 0.95;
  return { x0: x - 0.32, y0: y - 0.32, x1: x + 0.32, y1: y + 0.32 };
}
