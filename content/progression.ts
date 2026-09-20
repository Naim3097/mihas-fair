import type { ClassDef, Progression, StatKey, Stats } from './types.js';
import { STAT_KEYS } from './types.js';

/**
 * Levels. The character board shows "Level 3 · 420 / 1,000": the bar is the XP earned inside the current level over
 * the XP that level needs. Level 3 needs 1,000, so the curve is 300, 600, 1,000, … up to level 10.
 */
export const PROGRESSION: Progression = {
  maxLevel: 10,
  xpToNext: [300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500],
};

/** Total XP at which each level starts: level 1 at 0, level 2 at 300, level 3 at 900, … */
export function levelStarts(p: Progression = PROGRESSION): number[] {
  const starts = [0];
  for (const step of p.xpToNext) starts.push(starts[starts.length - 1]! + step);
  return starts;
}

export function levelFor(xp: number, p: Progression = PROGRESSION): number {
  const starts = levelStarts(p);
  let level = 1;
  for (let i = 1; i < starts.length && i < p.maxLevel; i++) if (xp >= starts[i]!) level = i + 1;
  return level;
}

/** Where the bar sits: XP earned inside the level, and what the level needs. At max level the bar is full. */
export function xpBar(xp: number, p: Progression = PROGRESSION): { level: number; into: number; toNext: number } {
  const level = levelFor(xp, p), starts = levelStarts(p);
  if (level >= p.maxLevel) return { level, into: p.xpToNext[p.maxLevel - 2]!, toNext: p.xpToNext[p.maxLevel - 2]! };
  return { level, into: xp - starts[level - 1]!, toNext: p.xpToNext[level - 1]! };
}

/** Stats at a level: the class base plus one growth pattern per level-up. Pure, so both runtimes agree. */
export function statsAt(cls: ClassDef, level: number): Stats {
  const stats: Stats = { ...cls.base };
  for (let l = 2; l <= level; l++) for (const k of cls.growth[(l - 2) % cls.growth.length]!) stats[k]++;
  return stats;
}

/** What a level-up added, for the "+2" labels on the character board. */
export function statGains(cls: ClassDef, level: number): Stats {
  const at = statsAt(cls, level), gains = {} as Stats;
  for (const k of STAT_KEYS as readonly StatKey[]) gains[k] = at[k] - cls.base[k];
  return gains;
}
