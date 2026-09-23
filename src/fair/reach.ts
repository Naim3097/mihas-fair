// What is within reach of the body, read off the stand plan rather than a circle round a booth's centre: the booth
// you are at is the one whose open side you stand in front of (or whose cell you have walked into), and the place to
// stand for a booth is just outside its open side. The server's own rule is a circle round the centre
// (STAMP_RADIUS_M in shared/rules.ts); everything here fits inside it, so what the interface offers the server accepts.
import type { Booth, LevelData } from '../../shared/types';
import type { NavGrid, P2 } from '../game/nav';
import { DIR, SIDES, planStands, type Cell, type Side, type StandInfo } from '../../shared/stands';

/** How far out from an open side counts as being at the booth (m); once there, how far before it stops counting. */
export const AT_M = 1.6, STAY_M = 2.2;
/** Sideways slack past the cell's edge, arriving and staying. */
export const SLACK_AT = 0.5, SLACK_STAY = 0.9;
/** Where to stand for a booth: this far out from its open side. */
export const STAND_OUT_M = 1.1;

export class Reach {
  private cells = new Map<string, Cell>();
  private front = new Map<string, Side>();
  private hw: number; private hd = new Map<number, number>();

  constructor(level: LevelData, stands: StandInfo[] = planStands(level)) {
    this.hw = level.booth.w / 2;
    for (const d of level.decks) this.hd.set(d.level, d.boothD / 2);
    for (const s of stands) for (const c of s.cells) { this.cells.set(c.b.id, c); this.front.set(c.b.id, s.front); }
  }

  private halfDepth(b: Booth): number { return this.hd.get(b.deck) ?? 1.5; }

  /** The open sides of a booth's cell, the stand's front first. A cell boxed in on every side keeps all four, so it can still be reached. */
  openSides(b: Booth): Side[] {
    const c = this.cells.get(b.id), open = c ? [...c.open] : [], front = this.front.get(b.id);
    if (!open.length) return [...SIDES];
    return front && open.includes(front) ? [front, ...open.filter((s) => s !== front)] : open;
  }

  /** Where to stand for a booth: STAND_OUT_M out from the open side nearest `from`, on walkable floor. */
  approach(b: Booth, from: P2, nav: NavGrid): P2 | null {
    const hd = this.halfDepth(b);
    const spots = this.openSides(b).map((s) => { const [dx, dy] = DIR[s]; return { x: b.x + dx * (this.hw + STAND_OUT_M), y: b.y + dy * (hd + STAND_OUT_M) }; }).filter((p) => nav.walkable(p.x, p.y));
    if (!spots.length) return nav.nearestWalkable(b.x, b.y, 10);
    const d = (p: P2) => Math.hypot(p.x - from.x, p.y - from.y);
    return spots.sort((p, q) => d(p) - d(q))[0]!;
  }

  /** How far `pos` stands out in front of one of the booth's open sides: 0 inside the cell, the distance from the
   *  edge when in front of an open side (no more than `slack` past the edge sideways), Infinity anywhere else,
   *  behind a partition included. */
  frontDist(b: Booth, pos: P2, slack: number): number {
    const hd = this.halfDepth(b), ex = Math.abs(pos.x - b.x) - this.hw, ey = Math.abs(pos.y - b.y) - hd; // past the cell's edge on each axis
    if (ex <= 0 && ey <= 0) return 0;
    let best = Infinity;
    for (const s of this.openSides(b)) {
      const [dx, dy] = DIR[s];
      const out = dx ? (pos.x - b.x) * dx - this.hw : (pos.y - b.y) * dy - hd, side = dx ? ey : ex;
      if (out > 0 && side <= slack) best = Math.min(best, out);
    }
    return best;
  }

  /** The booth the body is at: `prefer` (the one it was sent to) if within reach, else the nearest open side within
   *  AT_M, or the cell it is standing in. The one it was at keeps its place within STAY_M unless another is plainly
   *  nearer, so a sideways step in an aisle does not flip the chip. */
  atBooth(candidates: Booth[], pos: P2, current: Booth | null, prefer: Booth | null = null): Booth | null {
    if (prefer && this.frontDist(prefer, pos, SLACK_AT) <= AT_M) return prefer;
    let best: Booth | null = null, bd = AT_M;
    for (const b of candidates) { const d = this.frontDist(b, pos, SLACK_AT); if (d < bd) { bd = d; best = b; } }
    if (current && current.id !== best?.id) {
      const dc = this.frontDist(current, pos, SLACK_STAY);
      if (dc <= STAY_M && (!best || bd > dc - 0.6)) return current;
    }
    return best;
  }
}
