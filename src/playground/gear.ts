// How each gear moves, as a tuning the shared controller runs on, and how the camera sits for it. Boots are the
// fair's body with a real jump and one more in the air; Skates and the Jetpack come in their own phases.
import { MOVEMENT, type MovementDef } from '../../content';
import { BOOST, type Gear } from './course';
import { ITEM_NAME, ITEM_PRICE, KIT_NAME, KIT_PRICE } from '../../shared/playground';

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

/** Skates: speed is a state, not an input. A slow build to a cruise, a long glide when the stick is let go, wide
 *  arcs when turned at speed; the rim hold is the tuck, the top speed. A shorter jump than Boots, carried further. */
export const SKATES: MovementDef = {
  ...BOOTS,
  walk: 3, run: 7.5, sprint: 9.5, sprintMax: 9.5, sprintRamp: 0.8,
  accel: 7, decel: 5, airControl: 6, turn: 260,
  jump: 6.8, airJump: 6.4,
};

/** The Jetpack: Boots on the ground, and in the air a thrust that cancels gravity and climbs at 6.5 m/s while the
 *  button is held and the tank lasts (about four seconds of climb), no second jump, a stronger hand in the air. */
export const JETPACK: MovementDef = {
  ...BOOTS,
  airJumps: 0, airControl: 14,
  thrust: { accel: 34, climb: 6.5, airSpeed: 7, fuel: 100, drain: 24, refill: 30 },
};

export const GEAR: Record<Gear, GearDef> = {
  boots: { name: KIT_NAME.boots, movement: BOOTS, camera: { dist: 4.8, pitch: 0.32, kick: 0 }, magnet: 0, price: KIT_PRICE.boots },
  skates: { name: KIT_NAME.skates, movement: SKATES, camera: { dist: 5.6, pitch: 0.24, kick: 6 }, magnet: 0.3, price: KIT_PRICE.skates },
  jetpack: { name: KIT_NAME.jetpack, movement: JETPACK, camera: { dist: 6.2, pitch: 0.3, kick: 4 }, magnet: 0.3, price: KIT_PRICE.jetpack },
};

/** A kit's name and price, or Warp's: what the stands, the pad card and the summary say. */
export const unlockName = (u: Gear | 'warp'): string => (u === 'warp' ? ITEM_NAME.warp : GEAR[u].name);
export const unlockPrice = (u: Gear | 'warp'): number => (u === 'warp' ? ITEM_PRICE.warp : GEAR[u].price);

/** The gears that can be stood on today; the others say when they come. */
export const GEAR_READY: Record<Gear, boolean> = { boots: true, skates: true, jetpack: true };

/** A boost pad's push: a kick along the pad, which the controller then eases back to the gait's speed (in a quarter
 *  of a second on Boots, most of a second on Skates). The same on every gear; the course's tests use it too. */
export function boostBody(p: { body: { vel: { x: number; z: number } } }, dx: number, dz: number): void { p.body.vel.x += dx * BOOST; p.body.vel.z += dz * BOOST; }

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
