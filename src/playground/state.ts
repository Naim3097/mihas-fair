// What the Playground's interface reads: the run as it goes, the pad, the summary. Written by the engine, a few
// times a second at most, never per frame.
import { signal } from '@preact/signals';
import type { Gear } from './course';
import type { RunSummary } from './run';

export type PgMode = 'pad' | 'run' | 'summary';
export const pgMode = signal<PgMode>('pad');
export const pgO2 = signal(40);
export const pgScore = signal(0);
export const pgRunStars = signal(0);
export const pgCombo = signal(1);
export const pgFuel = signal(100);
export const pgGear = signal<Gear>('boots');
export const pgBalance = signal(0);
export const pgUnlocks = signal<Gear[]>(['boots']);
export const pgBest = signal<number | null>(null);
export const pgSummary = signal<(RunSummary & { gear: Gear; newBest: boolean; balance: number }) | null>(null);
/** A short dark fade while a fall puts the body back at the ring. */
export const pgFade = signal(false);
/** The first run's hint, until the first jump lands. */
export const pgHint = signal(false);
/** What a stand said as the body stepped on it: the gear it gave, or what it still costs. */
export const pgStandNote = signal<string | null>(null);
/** Standing on the portal: the chip that leaves for the fair. */
export const pgNearPortal = signal(false);
/** What the interface can ask the engine for. */
export interface PgControls { jump(): void; hold(on: boolean): void; again(): void; leave(): void }
export const pgControls = signal<PgControls | null>(null);
