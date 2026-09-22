// How each gear moves, as a tuning the shared controller runs on, and how the camera sits for it. Boots are the
// fair's body with a real jump and one more in the air; Skates and the Jetpack come in their own phases.
import { MOVEMENT, type MovementDef } from '../../content';
import type { Gear } from './course';

export interface GearDef {
  name: string;
  movement: MovementDef;
  /** the camera: how far back, how far down, the field-of-view kick at speed */
  camera: { dist: number; pitch: number; kick: number };
  /** the pickup radius the gear adds (the magnet) */
  magnet: number;
  price: number;
}

/** A fit human on a floating course: a jog, a top speed on the rim, a 1.24 m jump and a 0.93 m one in the air. */
export const BOOTS: MovementDef = {
  ...MOVEMENT,
  walk: 1.6, run: 4.4, sprint: 6.0, sprintMax: 6.0, sprintRamp: 0.6,
  accel: 22, decel: 24, airControl: 9, turn: 720,
  gravity: 22, fallMult: 1.3, terminal: 30,
  jump: 7.4, airJump: 6.4, airJumps: 1, coyote: 0.14, buffer: 0.18,
  stepHeight: 0.5,
};

export const GEAR: Record<Gear, GearDef> = {
  boots: { name: 'Boots', movement: BOOTS, camera: { dist: 4.8, pitch: 0.32, kick: 0 }, magnet: 0, price: 0 },
  skates: { name: 'Skates', movement: BOOTS, camera: { dist: 5.6, pitch: 0.24, kick: 6 }, magnet: 0.3, price: 100 },
  jetpack: { name: 'Jetpack', movement: BOOTS, camera: { dist: 6.2, pitch: 0.3, kick: 4 }, magnet: 0.3, price: 250 },
};

/** The gears that can be stood on today; the others say when they come. */
export const GEAR_READY: Record<Gear, boolean> = { boots: true, skates: false, jetpack: false };

/** How far a jump carries at a speed (m), for the course's tests: the time in the air from the launch and the fall
 *  under `fallMult`, times the ground speed. `rise` is the landing's height over the take-off. */
export function jumpReach(M: MovementDef, speed: number, rise = 0, airJump = false): number {
  const g = M.gravity, up = M.jump / g, apex = (M.jump * M.jump) / (2 * g);
  let h = apex, t = up;
  if (airJump) { h += (M.airJump * M.airJump) / (2 * g); t += M.airJump / g; }
  const drop = h - rise; if (drop < 0) return 0;
  t += Math.sqrt((2 * drop) / (g * M.fallMult));
  return speed * t;
}
