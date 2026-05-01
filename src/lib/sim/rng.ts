// Seedable PRNG (mulberry32). Tiny, deterministic, plenty random for
// playtest sims. Deliberately not crypto-secure.

export interface Rng {
  /** Returns a float in [0, 1). */
  (): number;
}

export function makeRng(seed: number | undefined): Rng {
  // If no seed, use a time-derived value but still go through mulberry32
  // so identical seeds in tests give identical streams.
  const start = seed === undefined ? (Date.now() & 0xffffffff) : seed >>> 0;
  let s = start;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an integer in [0, n). */
export function rngInt(rng: Rng, n: number): number {
  if (n <= 0) return 0;
  return Math.floor(rng() * n);
}

/** In-place shuffle via Fisher–Yates. Returns the same array for chaining. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rngInt(rng, i + 1);
    const a = arr[i];
    const b = arr[j];
    if (a !== undefined && b !== undefined) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
}
