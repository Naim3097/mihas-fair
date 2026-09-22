// "You are here" spots: posters at aisle crossings whose QR pins a player's position exactly. GPS indoors is off by
// ~25 m; a scan is off by a step. Spots are laid out from the plan (a few per hall, at the most open crossing near each
// point of a grid), numbered in a fixed order, and the crew can move one to the booth it actually ended up next to.
import type { LevelData } from '../../shared/types';
import type { NavGrid, P2 } from './nav';

export interface Spot { id: string; hall: number; deck: number; x: number; y: number; /** where the poster goes, in booth numbers */ where: string; /** the crew moved it next to this booth */ movedTo?: string }

/** Roughly this far apart, so no one is more than ~15 m from a poster. */
const SPACING_M = 24;
const SEARCH_M = 7, MIN_APART_M = 12, ARM_M = 8;

/** How far you can see down the aisles from here: the shorter of the two axes, so a crossing beats a long corridor. */
function openness(nav: NavGrid, x: number, y: number): number {
  const run = (dx: number, dy: number) => { let d = 0; while (d < ARM_M && nav.walkable(x + dx * (d + 0.5), y + dy * (d + 0.5))) d += 0.5; return d; };
  return Math.min(run(1, 0) + run(-1, 0), run(0, 1) + run(0, -1));
}

function nearestBooths(level: LevelData, deck: number, p: P2, n: number): string[] {
  return level.booths.filter((b) => b.deck === deck).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, n).map((b) => b.id);
}

/** The spots as the plan lays them out. Deterministic: the same plan always gives the same ids in the same places. */
export function planSpots(level: LevelData, nav: NavGrid): Spot[] {
  const out: Spot[] = [];
  const halls = [...level.halls].sort((a, b) => b.id - a.id || a.x0 - b.x0); // Hall 8 (the entrance end) first
  for (const h of halls) {
    const nx = Math.max(1, Math.round((h.x1 - h.x0) / SPACING_M)), ny = Math.max(1, Math.round((h.y1 - h.y0) / SPACING_M));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cx = h.x0 + ((i + 0.5) * (h.x1 - h.x0)) / nx, cy = h.y0 + ((j + 0.5) * (h.y1 - h.y0)) / ny;
      let best: { x: number; y: number; s: number } | null = null;
      for (let dy = -SEARCH_M; dy <= SEARCH_M; dy += 0.5) for (let dx = -SEARCH_M; dx <= SEARCH_M; dx += 0.5) {
        const x = cx + dx, y = cy + dy;
        if (x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1 || !nav.walkable(x, y)) continue;
        const s = openness(nav, x, y) - 0.15 * Math.hypot(dx, dy);
        if (!best || s > best.s) best = { x, y, s };
      }
      if (!best || out.some((o) => Math.hypot(o.x - best!.x, o.y - best!.y) < MIN_APART_M)) continue;
      const p = { x: +best.x.toFixed(1), y: +best.y.toFixed(1) };
      out.push({ id: '', hall: h.id, deck: h.deck, ...p, where: `Hall ${h.id} · aisle crossing by ${nearestBooths(level, h.deck, p, 2).join(' / ')}` });
    }
  }
  return out.map((s, i) => ({ ...s, id: `Y${String(i + 1).padStart(2, '0')}` }));
}

/** The plan's spots with the crew's corrections applied: a moved spot stands in the aisle next to its booth. */
export function resolveSpots(level: LevelData, nav: NavGrid, base: Spot[], moved: Record<string, string>): Spot[] {
  return base.map((s) => {
    const b = moved[s.id] ? level.booths.find((x) => x.id === moved[s.id]) : undefined;
    const p = b && nav.nearestWalkable(b.x, b.y, 6);
    return b && p ? { ...s, deck: b.deck, x: +p.x.toFixed(1), y: +p.y.toFixed(1), where: `Hall ${b.hall} · next to booth ${b.id}`, movedTo: b.id } : s;
  });
}

export const SPOT_ID = /^Y\d{2}$/;
export const spotUrl = (origin: string, id: string) => `${origin}/?w=${id}`;
