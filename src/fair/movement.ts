// How a body moves at the fair: Ceritera's tuning with the superhuman parts taken out. A fair is walked, jogged
// when late, never sprinted at 34 km/h; one jump, no second one in the air. The sim takes this instead of MOVEMENT,
// so Ceritera's hall keeps its own numbers.
import { MOVEMENT, type MovementDef } from '../../content';

export const FAIR_MOVEMENT: MovementDef = {
  ...MOVEMENT,
  walk: 1.3,
  run: 2.7,
  sprint: 4.2,
  sprintMax: 4.2,
  sprintRamp: 0.5,
  airJumps: 0,
};
