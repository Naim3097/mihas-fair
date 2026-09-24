// What the Playground's interface reads: the run as it goes, the pad, the summary. Written by the engine, a few
// times a second at most, never per frame.
import { signal } from '@preact/signals';
import type { Gear } from './course';
import type { RunSummary } from './run';
import type { PlaygroundStore } from './store';

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
/** Orbit 1's best score, and Orbit 2's. */
export const pgBest = signal<number | null>(null);
export const pgBest2 = signal<number | null>(null);
/** The orbit in play: 1, the course as it was; 2, its tiles moving by a new seed each run. */
export const pgOrbit = signal<1 | 2>(1);
/** `opened`: this run opened Orbit 2 (the first time through the gate). */
export const pgSummary = signal<(RunSummary & { gear: Gear; newBest: boolean; balance: number; orbit: 1 | 2; opened: boolean }) | null>(null);
/** A short dark fade while a fall puts the body back at the ring. */
export const pgFade = signal(false);
/** The first run's hint, until the first jump lands. */
export const pgHint = signal(false);
/** What a stand said as the body stepped on it: the gear it gave, or what it still costs. */
export const pgStandNote = signal<string | null>(null);
/** Standing on the portal: the chip that leaves for the fair. */
export const pgNearPortal = signal(false);
/** The store behind the boards and the balance, once the engine has one. */
export const pgStore = signal<PlaygroundStore | null>(null);
/** What the interface can ask the engine for. */
export interface PgControls { jump(): void; hold(on: boolean): void; again(): void; /** back to the pad, the run under way given up */ restart(): void; leave(): void; /** down to the fair: the run under way ends, the camera rises, the fair takes the stage */ down(): void; /** the orbit to play, from the pad (Orbit 2 only once it is open) */ orbit(o: 1 | 2): void }
export const pgControls = signal<PgControls | null>(null);
