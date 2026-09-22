// The Playground's kits on the fair's floor. Walking a hall on foot takes time; the gear a run pays for is the
// reward that shortens it. Boots are the fair's own body. Skates keep their speed but grip like feet: an aisle is no
// place to drift, and "Take me there" steers them. The Jetpack is the fair's body with the thrust, flying over every
// partition and under the glass. Every speed stays under the server's cap, so a kit never reads as a teleport.
import type { MovementDef } from '../../content';
import type { Gear } from '../playground/course';
import { GEAR } from '../playground/gear';
import { FAIR_MOVEMENT } from './movement';

export const FAIR_KITS: Record<Gear, MovementDef> = {
  boots: FAIR_MOVEMENT,
  skates: { ...FAIR_MOVEMENT, walk: 2.2, run: 6, sprint: 8.5, sprintMax: 8.5, sprintRamp: 0.6, accel: 18, decel: 20, turn: 540 },
  jetpack: { ...FAIR_MOVEMENT, airControl: 14, thrust: { ...GEAR.jetpack.movement.thrust! } },
};

/** How high a jetpack flies in the halls: over every partition (2.5 m), under the glass that keeps each level in. */
export const FLY_CEILING = 6.5;
/** The fastest any kit moves along the floor, for the tests against the server's cap. */
export const KIT_TOP_SPEED = Math.max(...Object.values(FAIR_KITS).map((m) => Math.max(m.sprintMax, m.run, m.thrust?.airSpeed ?? 0)));

const ORDER: Gear[] = ['boots', 'skates', 'jetpack'];
/** The next kit this player owns after the one on: Boots, Skates, Jetpack, round again, skipping what is not owned. */
export function nextKit(owned: readonly Gear[], current: Gear): Gear {
  const i = ORDER.indexOf(current);
  for (let k = 1; k <= ORDER.length; k++) { const g = ORDER[(i + k) % ORDER.length]!; if (owned.includes(g)) return g; }
  return 'boots';
}
