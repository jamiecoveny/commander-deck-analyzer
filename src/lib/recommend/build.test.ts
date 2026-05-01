import { describe, expect, it } from "vitest";

import type { ValidatedDeck } from "@/lib/decklist/types";
import type { EdhrecData } from "@/lib/edhrec";
import type { DetectedCombo } from "@/lib/spellbook";

import { buildRecommendations } from "./build";

function deck(cards: string[]): ValidatedDeck {
  return {
    commander: "Atraxa, Praetors' Voice",
    commanders: ["Atraxa, Praetors' Voice"],
    colorIdentity: "WUBG",
    cards: cards.map((name, i) => ({
      name,
      oracleId: `oid-${i}`,
      quantity: 1,
      isCommander: name === "Atraxa, Praetors' Voice",
    })),
    totalCards: cards.length,
  };
}

function edhrec(
  cards: Array<[string, number]>,
): EdhrecData {
  return {
    numDecks: 40000,
    averageTypeCounts: {
      creature: 24,
      instant: 9,
      sorcery: 8,
      artifact: 9,
      enchantment: 7,
      planeswalker: 6,
      land: 36,
      basic: 13,
      nonbasic: 23,
    },
    topCards: cards.map(([name, pct]) => ({
      name,
      inclusionPct: pct,
      numDecks: Math.round(pct * 40000),
      potentialDecks: 40000,
      synergy: 0,
      section: "Top Cards",
    })),
    similarCommanders: [],
  };
}

const combo = (
  cards: string[],
  missing: string[],
): DetectedCombo => ({
  spellbookId: "x-y",
  cards,
  missing,
  results: ["Win the game"],
  notablePrerequisites: null,
  popularity: 100,
  manaValueNeeded: 0,
  bracket: null,
  completeness: missing.length > 0 ? "almost_in_deck" : "in_deck",
});

describe("buildRecommendations", () => {
  it("emits Tier 2 'Add' recs for high-inclusion EDHrec cards not in deck", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice", "Forest"]),
      edhrec: edhrec([
        ["Sol Ring", 0.85],
        ["Arcane Signet", 0.65],
        ["Mind Stone", 0.15], // below NICE_THRESHOLD; skipped
      ]),
      combos: [],
    });
    const tier2 = recs.filter((r) => r.tier === 2);
    expect(tier2.map((r) => r.addCard)).toEqual(["Sol Ring", "Arcane Signet"]);
    const sol = tier2.find((r) => r.addCard === "Sol Ring");
    expect(sol?.reason).toMatch(/85% of/);
    expect(sol?.source).toBe("edhrec");
  });

  it("skips cards already in the deck", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice", "Sol Ring"]),
      edhrec: edhrec([["Sol Ring", 0.85]]),
      combos: [],
    });
    expect(recs.find((r) => r.addCard === "Sol Ring")).toBeUndefined();
  });

  it("buckets moderate-inclusion cards to Tier 3", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice"]),
      edhrec: edhrec([["Some Card", 0.3]]),
      combos: [],
    });
    expect(recs.find((r) => r.addCard === "Some Card")?.tier).toBe(3);
  });

  it("emits Tier 2 'Add' rec for almost-in-deck Spellbook combos", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice"]),
      edhrec: null,
      combos: [combo(["Hullbreaker Horror"], ["Sol Ring"])],
    });
    const c = recs.find((r) => r.source === "spellbook");
    expect(c).toBeDefined();
    expect(c?.tier).toBe(2);
    expect(c?.addCard).toBe("Sol Ring");
  });

  it("orders Tier 2 with Spellbook completions before EDHrec adds", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice"]),
      edhrec: edhrec([["Sol Ring", 0.85]]),
      combos: [combo(["X"], ["Some Missing Card"])],
    });
    const tier2 = recs.filter((r) => r.tier === 2);
    expect(tier2[0]?.source).toBe("spellbook");
    expect(tier2[1]?.source).toBe("edhrec");
  });

  it("surfaces validation errors as Tier 1 recs", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice"]),
      validationErrors: [
        {
          error: "color_identity_violation",
          card: "Lightning Bolt",
          cardColors: "R",
          commanderColors: "WUBG",
        },
        { error: "banned_card", card: "Time Vault" },
      ],
      edhrec: null,
      combos: [],
    });
    const tier1 = recs.filter((r) => r.tier === 1);
    expect(tier1).toHaveLength(2);
    expect(tier1[0]?.title).toMatch(/Lightning Bolt/);
    expect(tier1[1]?.title).toMatch(/Time Vault/);
  });

  it("returns an empty array when there's nothing to recommend", () => {
    const recs = buildRecommendations({
      deck: deck(["Atraxa, Praetors' Voice"]),
      edhrec: null,
      combos: [],
    });
    expect(recs).toEqual([]);
  });
});
