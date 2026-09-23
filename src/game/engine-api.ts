// What the interface needs from an engine: the surface App.tsx, sheets.tsx and world-sheets.tsx call. Two engines
// implement it: the model-on-a-table world of Mission X (engine.ts) and the third-person Nexova fair (src/fair).
import type { Booth, Lift } from '../../shared/types';
import type { P2 } from './nav';

export interface EngineApi {
  /** Drop the player in at an entrance (a gate id from the plan) and hand over control. */
  start(gate: string): void;
  stamp(b: Booth): Promise<void>;
  /** Walk to the current goal on its own, at a pace the eye can follow; pause keeps the route, stop drops it. */
  autopilot(): void;
  pauseWalk(): void;
  resumeWalk(): void;
  stopWalk(): void;
  useLift(to: Lift): void;
  /** Where the player stands, in floor-plan metres. */
  readonly position: P2;
  levelOf(p: P2): number;
  emote(pose: 'wave' | 'cheer' | 'dance', ms?: number): void;
  jump(): void;
  photo(): Promise<void>;
  sit(): void;
  stand(): void;
  /** The one contextual action: what the big button would do. */
  interact(): Promise<void>;
  dispose(): void;
}
