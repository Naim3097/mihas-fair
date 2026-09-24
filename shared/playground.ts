// The Playground's numbers that the server believes a run by, in the one place both sides read them from: what a star,
// a combo, a diamond and the air left at the gate pay, what the course holds, and what each kit costs. The server
// imports only from server/ and shared/ (with .js), so these live here rather than in src/playground; the client's run
// rules, gear table and course read the same values, and src/playground/course.test.ts fails if the course drifts.

/** Oxygen: the tank at the start, its cap, what a bubble gives back and what a fall costs, in seconds. */
export const O2_START = 40, O2_CAP = 60, O2_BUBBLE = 6, O2_FALL = 4;
/** A star's points, the window that keeps a combo alive (s), the top combo, a diamond's points and stars, and what each
 *  second of air left pays at the gate. */
export const STAR = 10, COMBO_WINDOW = 1.2, COMBO_MAX = 4, DIAMOND = 300, DIAMOND_STARS = 25, GATE_BONUS_PER_S = 10;

/** What the course holds: every star on every line, and the diamonds (src/playground/course.ts builds it). */
export const COURSE_STARS = 217, COURSE_DIAMONDS = 3;

/** Stars for the Playground each time a card is left at an exhibitor's booth (once a booth, while the crew's sky switch
 *  is on): a lead at the fair pays into the world above it. */
export const MET_STARS = 20;

export type Kit = 'boots' | 'skates' | 'jetpack';
/** What each kit costs in stars, and what it is called. */
export const KIT_PRICE: Record<Kit, number> = { boots: 0, skates: 100, jetpack: 250 };
export const KIT_NAME: Record<Kit, string> = { boots: 'Boots', skates: 'Skates', jetpack: 'Jetpack' };

/** What else stars buy, owned beside the kits but never worn: Warp, a ride through the sky to any booth on Mission X. */
export type Item = 'warp';
export const ITEMS: readonly Item[] = ['warp'];
export const ITEM_PRICE: Record<Item, number> = { warp: 400 };
export const ITEM_NAME: Record<Item, string> = { warp: 'Warp' };
/** Warp: the least way it saves (m: nearer, walk), the rest between two (ms), and how long after one a ping sent from
 *  the old place is forgiven, not taken for a jump (ms). The arrival is within the stamping reach of the booth. */
export const WARP_MIN_M = 30, WARP_COOLDOWN_MS = 60_000, WARP_GRACE_MS = 10_000;
