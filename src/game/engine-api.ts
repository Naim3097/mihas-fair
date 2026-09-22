// What the interface needs from an engine: the surface App.tsx, sheets.tsx and world-sheets.tsx call. Two engines
// implement it: the model-on-a-table world of Mission X (engine.ts) and the third-person Nexova fair (src/fair).
import type { Booth, Lift } from '../../shared/types';
import type { P2 } from './nav';

export interface EngineApi {
  /** Drop the player in at a spawn and hand over control. */
  start(spawn: 'short' | 'epic'): void;
  stamp(b: Booth): Promise<void>;
  /** Walk to where the trail leads, on its own. Nothing happens when it leads nowhere. */
  autopilot(): void;
  /** Stop walking there. */
  stop(): void;
  useLift(to: Lift): void;
  /** Where the player stands, in floor-plan metres. */
  readonly position: P2;
  levelOf(p: P2): number;
  emote(pose: 'wave' | 'cheer' | 'dance', ms?: number): void;
  jump(): void;
  /** The next kit owned (Boots, Skates, Jetpack), from the chip in the dock; nothing without a second kit. */
  nextKit(): void;
  /** The Fly button held, or let go: thrust for the Jetpack. */
  hold(on: boolean): void;
  photo(): Promise<void>;
  sit(): void;
  stand(): void;
  /** The one contextual action: what the big button would do. */
  interact(): Promise<void>;
  dispose(): void;
}
