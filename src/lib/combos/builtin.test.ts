import { describe, expect, it } from "vitest";

import type { DetectedCombo } from "@/lib/spellbook";

import { detectBuiltinCombos, mergeCombos } from "./builtin";

describe("detectBuiltinCombos", () => {
  it("detects Mike/Trike when both pieces are in deck", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Mikaeus, the Unhallowed", "Triskelion"],
      commanderNames: ["Atraxa, Praetors' Voice"],
    });
    const mikeTrike = combos.find((c) => c.spellbookId === "builtin:mike-trike");
    expect(mikeTrike).toBeDefined();
    expect(mikeTrike?.completeness).toBe("in_deck");
    expect(mikeTrike?.cards).toContain("Mikaeus, the Unhallowed");
    expect(mikeTrike?.cards).toContain("Triskelion");
  });

  it("detects Thoracle + Consult", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Thassa's Oracle", "Demonic Consultation"],
      commanderNames: ["Anything"],
    });
    const c = combos.find((x) => x.spellbookId === "builtin:thoracle-consult");
    expect(c).toBeDefined();
    expect(c?.completeness).toBe("in_deck");
  });

  it("detects Meren + Altar + Skeleton (3-card combo)", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Phyrexian Altar", "Reassembling Skeleton"],
      commanderNames: ["Meren of Clan Nel Toth"],
    });
    const meren = combos.find((c) => c.spellbookId === "builtin:meren-altar-skeleton");
    expect(meren).toBeDefined();
    expect(meren?.completeness).toBe("in_deck");
  });

  it("returns almost_in_deck for half-assembled Meren combo", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Phyrexian Altar"],
      commanderNames: ["Meren of Clan Nel Toth"],
    });
    const meren = combos.find((c) => c.spellbookId === "builtin:meren-altar-skeleton");
    expect(meren).toBeDefined();
    expect(meren?.completeness).toBe("almost_in_deck");
    expect(meren?.missing).toContain("Reassembling Skeleton");
  });

  it("respects commanderRequired gating", () => {
    // Krark/Sakashima requires Krark as the commander (recast from
    // command zone after each sac).
    const krarkAsCmdr = detectBuiltinCombos({
      deckCardNames: ["Sakashima of a Thousand Faces"],
      commanderNames: ["Krark, the Thumbless"],
    });
    const differentCmdr = detectBuiltinCombos({
      deckCardNames: ["Sakashima of a Thousand Faces", "Krark, the Thumbless"],
      commanderNames: ["Different Commander"],
    });
    expect(krarkAsCmdr.some((c) => c.spellbookId.includes("krark"))).toBe(true);
    expect(differentCmdr.some((c) => c.spellbookId.includes("krark"))).toBe(false);
  });

  it("yields almost_in_deck for Phyrexian Altar + persist (no persist creature)", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Phyrexian Altar"],
      commanderNames: ["Korvold, Fae-Cursed King"],
    });
    const altarPersist = combos.find(
      (c) => c.spellbookId === "builtin:phyrexian-altar-persist",
    );
    expect(altarPersist).toBeDefined();
    expect(altarPersist?.completeness).toBe("almost_in_deck");
    expect(altarPersist?.missing.length).toBeGreaterThan(0);
  });

  it("yields in_deck for Phyrexian Altar + a persist creature", () => {
    const combos = detectBuiltinCombos({
      deckCardNames: ["Phyrexian Altar", "Reassembling Skeleton"],
      commanderNames: ["Korvold, Fae-Cursed King"],
    });
    const altarPersist = combos.find(
      (c) => c.spellbookId === "builtin:phyrexian-altar-persist",
    );
    expect(altarPersist).toBeDefined();
    expect(altarPersist?.completeness).toBe("in_deck");
    expect(altarPersist?.cards).toContain("Reassembling Skeleton");
  });
});

describe("mergeCombos", () => {
  const sample = (id: string, cards: string[]): DetectedCombo => ({
    spellbookId: id,
    cards,
    missing: [],
    results: ["Win the game"],
    notablePrerequisites: null,
    popularity: 1000,
    manaValueNeeded: 0,
    bracket: null,
    completeness: "in_deck",
  });

  it("dedupes by sorted card-set + completeness, keeping first occurrence", () => {
    const a = sample("123", ["Thassa's Oracle", "Demonic Consultation"]);
    const b = sample("builtin:thoracle-consult", [
      "Demonic Consultation",
      "Thassa's Oracle",
    ]);
    const merged = mergeCombos([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.spellbookId).toBe("123"); // Spellbook (first) wins
  });

  it("keeps distinct combos", () => {
    const a = sample("a", ["X", "Y"]);
    const b = sample("b", ["P", "Q"]);
    expect(mergeCombos([a], [b])).toHaveLength(2);
  });

  it("orders in_deck before almost_in_deck", () => {
    const a: DetectedCombo = { ...sample("a", ["X"]), completeness: "almost_in_deck" };
    const b = sample("b", ["Y"]);
    const merged = mergeCombos([], [a, b]);
    expect(merged[0]?.completeness).toBe("in_deck");
    expect(merged[1]?.completeness).toBe("almost_in_deck");
  });
});
