import { describe, expect, it } from "vitest";

import type { DetectedCombo } from "@/lib/spellbook";

import { buildGamePlan, type GamePlanInput } from "./gameplan";
import type { CategoryBreakdown } from "./types";

const cats = (over: Partial<CategoryBreakdown>): CategoryBreakdown => ({
  ramp: 10,
  draw: 8,
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

const combo = (
  cards: string[],
  completeness: DetectedCombo["completeness"] = "in_deck",
): DetectedCombo => ({
  spellbookId: "x-y",
  cards,
  missing: [],
  results: ["Win the game"],
  notablePrerequisites: null,
  popularity: 1,
  manaValueNeeded: 0,
  bracket: null,
  completeness,
});

const base = (over: Partial<GamePlanInput>): GamePlanInput => ({
  commander: "Krenko, Mob Boss",
  archetype: { archetype: "Midrange / good stuff", reasons: ["balanced"] },
  categoryCounts: cats({}),
  combos: [],
  averageCmc: 3,
  landCount: 36,
  totalCards: 100,
  ...over,
});

describe("buildGamePlan", () => {
  it("produces a non-empty summary for every known archetype", () => {
    const archetypes = [
      "Combo / control",
      "Control",
      "Big mana ramp",
      "Reanimator / recursion",
      "Voltron / combat damage",
      "Combo wincon",
      "Stax / lock",
      "Midrange / good stuff",
    ];
    for (const a of archetypes) {
      const plan = buildGamePlan(
        base({
          archetype: { archetype: a, reasons: [] },
        }),
      );
      expect(plan.length).toBeGreaterThan(20);
      expect(plan).not.toContain("undefined");
    }
  });

  it("falls back to midrange template for unknown archetype", () => {
    const plan = buildGamePlan(
      base({ archetype: { archetype: "Made-up archetype", reasons: [] } }),
    );
    expect(plan).toMatch(/efficient threats/);
  });

  it("mentions a combo example when an in-deck combo is present", () => {
    const plan = buildGamePlan(
      base({
        archetype: { archetype: "Combo / control", reasons: [] },
        categoryCounts: cats({ tutor: 6, counterspell: 5 }),
        combos: [combo(["Thassa's Oracle", "Demonic Consultation"])],
      }),
    );
    expect(plan).toMatch(/Thassa's Oracle/);
  });

  it("does not mention combos that are only almost-in-deck", () => {
    const plan = buildGamePlan(
      base({
        archetype: { archetype: "Combo / control", reasons: [] },
        categoryCounts: cats({ tutor: 6, counterspell: 5 }),
        combos: [
          combo(["Hullbreaker Horror", "Sol Ring"], "almost_in_deck"),
        ],
      }),
    );
    expect(plan).not.toMatch(/Hullbreaker Horror/);
  });

  it("includes the commander name in every template", () => {
    const plan = buildGamePlan(
      base({ commander: "Atraxa, Praetors' Voice" }),
    );
    expect(plan).toContain("Atraxa, Praetors' Voice");
  });
});
