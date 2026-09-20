import type { EnemyDef } from './types.js';

/**
 * What there is to fight in the hall before the story brings its own: bayang, shadows that borrow the avatars'
 * own shapes, and the wooden training posts near the spawn. Shadows are the sparring partners of the M1 arena;
 * their numbers are tuned so a level-1 avatar wins one-on-one and has to move against three.
 */
export const ENEMIES: EnemyDef[] = [
  { key: 'patung-latihan', name: { bm: 'Patung Latihan', en: 'Training Post' }, model: 'dummy', health: 400, damage: 0, speed: 0, aggro: 0, reach: 0, windup: 0, recovery: 0, cooldown: 0, xp: 0, training: true },
  { key: 'bayang-pendekar', name: { bm: 'Bayang Pendekar', en: 'Shadow Pendekar' }, model: 'pendekar', health: 120, damage: 12, speed: 3.8, aggro: 12, reach: 1.9, windup: 0.45, recovery: 0.6, cooldown: 1.4, xp: 40 },
  { key: 'bayang-pengembara', name: { bm: 'Bayang Pengembara', en: 'Shadow Pengembara' }, model: 'pengembara', health: 90, damage: 9, speed: 4.6, aggro: 14, reach: 2.0, windup: 0.35, recovery: 0.5, cooldown: 1.1, xp: 35 },
  { key: 'bayang-ilmuwan', name: { bm: 'Bayang Ilmuwan', en: 'Shadow Ilmuwan' }, model: 'ilmuwan', health: 80, damage: 10, speed: 3.4, aggro: 13, reach: 1.8, windup: 0.4, recovery: 0.6, cooldown: 1.3, xp: 30 },
  { key: 'bayang-ahli-falak', name: { bm: 'Bayang Ahli Falak', en: 'Shadow Ahli Falak' }, model: 'ahli-falak', health: 85, damage: 11, speed: 3.5, aggro: 15, reach: 1.8, windup: 0.4, recovery: 0.6, cooldown: 1.3, xp: 32 },
];

export const enemyByKey = (key: string): EnemyDef | undefined => ENEMIES.find((e) => e.key === key);
