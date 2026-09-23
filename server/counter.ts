// Where an exhibitor stands when their dashboard is open: just behind their counter, facing the aisle. The stand
// geometry is the fair's own (shared/stands.ts, pure plan maths), read at the same 3 m module the world draws, so
// the spot lands where the counter is on every phone. Plan metres, like presence and stamps.
import type { LevelData } from '../shared/types.js';
import { DIR, counterOf, planLevel, planStands } from '../shared/stands.js';

export interface CounterSpot { x: number; y: number; /** yaw as the world reads it: facing plan (dx, dy) is atan2(dx, -dy) */ h: number }
const BEHIND_M = 0.9;

export function counterSpots(level: LevelData): Map<string, CounterSpot> {
  const out = new Map<string, CounterSpot>();
  for (const st of planStands(planLevel(level))) {
    const c = counterOf(st), [dx, dy] = DIR[st.front];
    const at = c ? { x: c.x - dx * BEHIND_M, y: c.y - dy * BEHIND_M } : { x: (st.rect.x0 + st.rect.x1) / 2, y: (st.rect.y0 + st.rect.y1) / 2 };
    const spot = { x: +at.x.toFixed(2), y: +at.y.toFixed(2), h: +Math.atan2(dx, -dy).toFixed(3) };
    for (const cell of st.cells) out.set(cell.b.id, spot);
  }
  return out;
}
