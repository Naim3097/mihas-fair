import type { MovementDef } from './types.js';

/**
 * How an avatar moves. The first block is a fit human (a jog at 4.4 m/s, a 1.1 m jump); the second is what the
 * library allows once you know it: a sprint that keeps building to 9.5 m/s, a second jump in the air, a dash that
 * ignores gravity, a wall kick, and a drop from height that lands as a blow. Gravity is stronger than Earth's
 * because a game jump has to read as a jump, not a float. Both runtimes read these numbers.
 */
export const MOVEMENT: MovementDef = {
  walk: 1.7,
  run: 4.4,
  sprint: 7.0,
  sprintMax: 9.5,
  sprintRamp: 2.5,
  accel: 26,
  decel: 30,
  airControl: 8,
  turn: 900,
  gravity: 24,
  fallMult: 1.35,
  terminal: 40,
  jump: 7.2,
  airJump: 6.6,
  airJumps: 1,
  coyote: 0.12,
  buffer: 0.16,
  wallJump: { up: 7.4, out: 5.5 },
  dodge: { distance: 4.2, duration: 0.32, iframes: 0.28, cooldown: 0.45, stamina: 18 },
  airDash: { speed: 24, duration: 0.16, stamina: 22 },
  slam: { speed: 32, radius: 3.5, amount: 30, knockback: 8, up: 4 },
  stepHeight: 0.5,
  radius: 0.36,
  height: 1.75,
  stamina: { max: 100, regen: 24, regenDelay: 0.6, sprintDrain: 9, jump: 8 },
};
