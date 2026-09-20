import type { Stats, StrikeDef } from './types.js';

/**
 * The basic attack: a three-strike chain on one button. Every class throws the same silat-flavoured chain; the
 * numbers scale with the character. Each strike lunges a little so the chain closes distance on its own.
 */
export const STRIKES: StrikeDef[] = [
  { anim: 'attack-1', amount: 12, shape: { kind: 'arc', range: 2.2, angle: 100 }, windup: 0.12, active: 0.12, recovery: 0.22, step: 0.6, stagger: 0.15 },
  { anim: 'attack-2', amount: 14, shape: { kind: 'arc', range: 2.3, angle: 110 }, windup: 0.14, active: 0.12, recovery: 0.24, step: 0.7, stagger: 0.2 },
  { anim: 'attack-3', amount: 22, shape: { kind: 'arc', range: 2.6, angle: 120 }, windup: 0.2, active: 0.15, recovery: 0.4, step: 1.2, knockback: 5, up: 3, stagger: 0.5 },
];

/** How long after the last strike the chain resets to the first. */
export const CHAIN_RESET = 0.9;

export interface Vitals {
  /** Nyawa. */
  health: number;
  /** Tenaga: sprinting, jumping, dodging. */
  stamina: number;
  /** Semangat: Q, W and E. */
  spirit: number;
  spiritRegen: number;
  /** How fast the Ilham bar (the ultimate) fills, as a multiplier on what fights give. */
  ilhamRate: number;
  /** Multipliers on what strikes and skills deal. */
  strikeMult: number;
  skillMult: number;
  /** How far away a target can be locked; the chance a hit lands as a critical. */
  lockRange: number;
  crit: number;
}

/** What the four stats mean in a fight. Pure, so the sheet, the web tier and Unreal show the same numbers. */
export function vitals(s: Stats): Vitals {
  return {
    health: 100 + s.endurance * 12,
    stamina: 100 + s.endurance * 10,
    spirit: 100 + s.knowledge * 10,
    spiritRegen: 6 + s.knowledge * 1.5,
    ilhamRate: 1 + s.curiosity * 0.15,
    strikeMult: 1 + s.endurance * 0.03,
    skillMult: 1 + s.knowledge * 0.04,
    lockRange: 10 + s.observation * 2,
    crit: Math.min(0.5, s.observation * 0.03),
  };
}

/** Ilham gained from damage: dealt fills faster than taken. 100 is a full bar. */
export const ILHAM = { perDamageDealt: 0.35, perDamageTaken: 0.5, perKill: 8 };
