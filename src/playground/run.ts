// The run's rules, as a state machine on simulation time: oxygen down, stars and their combo up, the rings that
// set where a fall returns you, the gate that ends it with a bonus, oxygen at zero that ends it where you stand.
// No screen, no world: the engine feeds it what happened and reads what it says. The numbers are the rules.
export const O2_START = 40, O2_CAP = 60, O2_BUBBLE = 6, O2_FALL = 4;
export const STAR = 10, COMBO_WINDOW = 1.2, COMBO_MAX = 4, DIAMOND = 300, DIAMOND_STARS = 25, GATE_BONUS_PER_S = 10;

export type EndReason = 'gate' | 'o2' | 'left';
export type RunEvent =
  | { kind: 'star'; score: number; combo: number }
  | { kind: 'combo'; combo: number }
  | { kind: 'bubble' } | { kind: 'cell' }
  | { kind: 'diamond'; score: number }
  | { kind: 'ring'; ring: number }
  | { kind: 'fall' }
  | { kind: 'end'; reason: EndReason; bonus: number };

export interface RunSummary { score: number; stars: number; comboMax: number; seconds: number; reason: EndReason; bonus: number }

export class Run {
  o2 = O2_START; score = 0; stars = 0; combo = 1; comboMax = 1; comboLeft = 0; ring = 0; time = 0;
  /** what happened since the engine last read it */
  events: RunEvent[] = [];
  ended: RunSummary | null = null;

  /** One step of simulation time: oxygen down, the combo's window closing, and the end when the air is gone. */
  tick(dt: number) {
    if (this.ended) return;
    this.time += dt;
    this.o2 = Math.max(0, this.o2 - dt);
    if (this.comboLeft > 0) { this.comboLeft -= dt; if (this.comboLeft <= 0) { this.comboLeft = 0; if (this.combo > 1) { this.combo = 1; this.events.push({ kind: 'combo', combo: 1 }); } } }
    if (this.o2 <= 0) this.end('o2', 0);
  }

  /** A star: the multiplier climbs while the window is open, the star's score is ten times it. */
  star() {
    if (this.ended) return;
    if (this.comboLeft > 0) { if (this.combo < COMBO_MAX) { this.combo++; this.events.push({ kind: 'combo', combo: this.combo }); } } else this.combo = 1;
    this.comboLeft = COMBO_WINDOW; this.comboMax = Math.max(this.comboMax, this.combo);
    const score = STAR * this.combo; this.score += score; this.stars++;
    this.events.push({ kind: 'star', score, combo: this.combo });
  }
  bubble() { if (this.ended) return; this.o2 = Math.min(O2_CAP, this.o2 + O2_BUBBLE); this.events.push({ kind: 'bubble' }); }
  cell() { if (this.ended) return; this.events.push({ kind: 'cell' }); }
  diamond() { if (this.ended) return; this.score += DIAMOND; this.stars += DIAMOND_STARS; this.events.push({ kind: 'diamond', score: DIAMOND }); }
  /** A ring passed: only ever forward, so walking back never loses a checkpoint. */
  ringAt(i: number) { if (this.ended || i <= this.ring) return; this.ring = i; this.events.push({ kind: 'ring', ring: i }); }
  /** Off the course: air lost, the combo gone; the engine puts the body back at the ring. */
  fall() { if (this.ended) return; this.o2 = Math.max(0, this.o2 - O2_FALL); this.combo = 1; this.comboLeft = 0; this.events.push({ kind: 'fall' }); if (this.o2 <= 0) this.end('o2', 0); }
  /** Through the gate: what is left of the air pays. */
  gate() { if (this.ended) return; this.end('gate', Math.round(this.o2 * GATE_BONUS_PER_S)); }
  /** Back to the fair from the menu: the run ends as if the air had run out. */
  leave() { if (!this.ended) this.end('left', 0); }
  /** The run so far, for a tab going away in the middle of it. */
  snapshot(): RunSummary { return { score: this.score, stars: this.stars, comboMax: this.comboMax, seconds: Math.round(this.time), reason: 'left', bonus: 0 }; }

  private end(reason: EndReason, bonus: number) {
    this.score += bonus; this.combo = 1; this.comboLeft = 0;
    this.ended = { score: this.score, stars: this.stars, comboMax: this.comboMax, seconds: Math.round(this.time), reason, bonus };
    this.events.push({ kind: 'end', reason, bonus });
  }

  /** Take the events, leaving none. */
  drain(): RunEvent[] { const e = this.events; this.events = []; return e; }
}
