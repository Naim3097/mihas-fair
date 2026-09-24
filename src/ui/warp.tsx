// Warp's button, beside the way of walking there: shown only where it can be used (Warp owned, its switch on, the booth
// on Mission X or the X itself, a real walk away, no ride under way), counting down its minute's charge after a ride.
import type { EngineApi as Engine } from '../game/engine-api';
import type { Booth } from '../../shared/types';
import { WARP_MIN_M } from '../../shared/playground';
import { pgUnlocks } from '../playground/state';
import { level, riding, stationMap, switches, warpNextAt } from '../state';
import { useCountdown } from './common';

/** Can this booth be warped to at all: on Mission X (a booth online or set up by the crew), or the X at Booth 7E17? */
export const onMissionX = (b: Booth): boolean => b.id === level.value?.hero.id || stationMap.value.has(b.id);

/** `primary`: the booth sheet's own call; otherwise a quiet button beside the way of walking there. */
export function WarpButton({ booth, engine, primary }: { booth: Booth | null; engine: () => Engine | null; primary?: boolean }) {
  const left = useCountdown(warpNextAt.value), eng = engine();
  if (!booth || !eng || riding.value || !switches.value.warp || !pgUnlocks.value.includes('warp') || !onMissionX(booth)) return null;
  const p = eng.position; if (Math.hypot(booth.x - p.x, booth.y - p.y) < WARP_MIN_M) return null; // nearer: walk
  return (
    <button class={'btn' + (primary ? ' primary big' : '')} disabled={left > 0} title="Warp: a ride through the sky to this booth" onClick={(e) => { e.stopPropagation(); void eng.warp(booth); }}>
      {left > 0 ? `Warp · ${left} s` : 'Warp'}
    </button>
  );
}

/** The booth a guided trail leads to: the checkpoint next, a booth picked on the map or in its sheet, or the X. */
export function trailBooth(goal: { x: number; y: number } | null, nextStation: string | null, toX: boolean): Booth | null {
  const lv = level.value; if (!lv) return null;
  if (goal) return lv.booths.find((b) => b.x === goal.x && b.y === goal.y) ?? (goal.x === lv.hero.dock.x && goal.y === lv.hero.dock.y ? lv.booths.find((b) => b.id === lv.hero.id) ?? null : null);
  if (nextStation) return lv.booths.find((b) => b.id === nextStation) ?? null;
  return toX ? lv.booths.find((b) => b.id === lv.hero.id) ?? null : null;
}
