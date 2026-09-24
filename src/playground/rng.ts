// Seeded randomness for the Playground: one 32-bit seed makes one Orbit 2 course, so a run can be told again (the same
// seed, the same tiles, the same moves) and a test can walk thousands of them. mulberry32, the sim's own generator.
export type Rng = () => number;

export function rng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a run, from the browser's randomness where there is some. */
export function newSeed(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]! || 1; } catch { return (Math.random() * 0xffffffff) >>> 0 || 1; }
}

/** A weighted pick: each item as likely as its weight. */
export function pickWeighted<T>(r: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0; for (const t of items) total += weight(t);
  let k = r() * total;
  for (const t of items) { k -= weight(t); if (k <= 0) return t; }
  return items[items.length - 1]!;
}
