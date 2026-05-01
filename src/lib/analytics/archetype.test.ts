import { describe, expect, it } from "vitest";

import { guessArchetype, type ArchetypeInput } from "./archetype";
import type { CategoryBreakdown } from "./types";

const cats = (over: Partial<CategoryBreakdown>): CategoryBreakdown => ({
  ramp: 10,
  draw: 10,
  removal: 8,
  wipe: 2,
  counterspell: 0,
  tutor: 0,
  recursion: 0,
  wincon: 0,
  stax: 0,
  utility: 30,
  ...over,
});

const base = (over: Partial<ArchetypeInput>): ArchetypeInput => ({
  commanderName: "X",
  commanderTypeLine: "Legendary Creature — Human",
  commanderOracleText: "",
  averageCmc: 3,
  totalCards: 100,
  categoryCounts: cats({}),
  ...over,
});

describe("guessArchetype", () => {
  it("returns midrange for a balanced deck", () => {
    const r = guessArchetype(base({}));
    expect(r.archetype).toMatch(/Midrange/);
  });

  it("flags stax when stax count is high", () => {
    const r = guessArchetype(base({ categoryCounts: cats({ stax: 7 }) }));
    expect(r.archetype).toMatch(/Stax/);
  });

  it("flags combo/control when counters + tutors are high", () => {
    const r = guessArchetype(
      base({ categoryCounts: cats({ counterspell: 5, tutor: 4 }) }),
    );
    expect(r.archetype).toMatch(/Combo/);
  });

  it("flags big mana ramp when ramp + avg CMC are high", () => {
    const r = guessArchetype(
      base({ categoryCounts: cats({ ramp: 14 }), averageCmc: 4.5 }),
    );
    expect(r.archetype).toMatch(/Big mana/);
  });

  it("flags voltron via commander text", () => {
    const r = guessArchetype(
      base({
        commanderTypeLine: "Legendary Creature — Human Warrior",
        commanderOracleText: "Double strike. Whenever this deals combat damage...",
        // Damp other signals.
        categoryCounts: cats({}),
      }),
    );
    expect(r.archetype).toMatch(/Voltron/);
  });
});
