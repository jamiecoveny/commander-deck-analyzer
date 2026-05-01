import { describe, expect, it } from "vitest";

import { makeRng, rngInt, shuffle } from "./rng";

describe("makeRng", () => {
  it("produces a deterministic stream for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("produces different streams for different seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differAt: number | null = null;
    for (let i = 0; i < 10 && differAt === null; i += 1) {
      const x = a();
      const y = b();
      if (x !== y) differAt = i;
    }
    expect(differAt).not.toBeNull();
  });

  it("rngInt returns values in [0, n)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i += 1) {
      const v = rngInt(r, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });
});

describe("shuffle", () => {
  it("permutes an array deterministically with a fixed seed", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = [...a];
    shuffle(a, makeRng(99));
    shuffle(b, makeRng(99));
    expect(a).toEqual(b);
    expect(a.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
