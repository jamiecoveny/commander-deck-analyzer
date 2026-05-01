import { describe, expect, it } from "vitest";

import { simulate } from "./aggregate";
import { runGameWithSeed } from "./engine";
import { bracket3Midrange } from "./opponents";
import { expandProfiles, type ProfileInput } from "./profiles";
import { buildProfile } from "./profiles";
import type { CardProfile } from "./types";

function p(over: Partial<ProfileInput>): CardProfile {
  return buildProfile({
    oracleId: "x",
    name: "Test",
    cmc: 0,
    manaCost: null,
    typeLine: "",
    oracleText: "",
    power: 0,
    toughness: 0,
    categories: [],
    isCommander: false,
    ...over,
  });
}

function buildBalancedDeck(): CardProfile[] {
  // 100-card balanced deck: commander + 36 lands + 10 ramp + 10 draw
  // + 8 interaction + 35 threats.
  const commander = p({
    name: "Commander",
    cmc: 4,
    typeLine: "Legendary Creature",
    power: 4,
    toughness: 4,
    isCommander: true,
  });
  const specs: Array<{ profile: CardProfile; quantity: number }> = [
    { profile: p({ name: "Land", typeLine: "Basic Land — Forest" }), quantity: 36 },
    {
      profile: p({
        name: "Sol Ring",
        cmc: 1,
        typeLine: "Artifact",
        oracleText: "{T}: Add {C}{C}.",
        categories: ["ramp"],
      }),
      quantity: 1,
    },
    {
      profile: p({
        name: "Mana Rock",
        cmc: 2,
        typeLine: "Artifact",
        oracleText: "{T}: Add {C}.",
        categories: ["ramp"],
      }),
      quantity: 4,
    },
    {
      profile: p({
        name: "Cultivate",
        cmc: 3,
        typeLine: "Sorcery",
        oracleText: "Search your library for up to two basic land cards.",
        categories: ["ramp"],
      }),
      quantity: 5,
    },
    {
      profile: p({
        name: "Divination",
        cmc: 3,
        typeLine: "Sorcery",
        oracleText: "Draw two cards.",
        categories: ["draw"],
      }),
      quantity: 10,
    },
    {
      profile: p({
        name: "Doom Blade",
        cmc: 2,
        typeLine: "Instant",
        oracleText: "Destroy target nonblack creature.",
        categories: ["removal"],
      }),
      quantity: 6,
    },
    {
      profile: p({
        name: "Wrath of God",
        cmc: 4,
        typeLine: "Sorcery",
        oracleText: "Destroy all creatures.",
        categories: ["wipe"],
      }),
      quantity: 2,
    },
    {
      profile: p({
        name: "Mid Threat",
        cmc: 4,
        typeLine: "Creature — Beast",
        power: 4,
        toughness: 4,
      }),
      quantity: 20,
    },
    {
      profile: p({
        name: "Big Threat",
        cmc: 6,
        typeLine: "Creature — Beast",
        power: 6,
        toughness: 6,
      }),
      quantity: 15,
    },
  ];
  return [commander, ...expandProfiles(specs)];
}

describe("runGameWithSeed", () => {
  it("returns a result with bounded turns and a non-empty log", () => {
    const userDeck = buildBalancedDeck();
    const r = runGameWithSeed({
      userDeck,
      opponents: [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()],
      seed: 1,
      maxTurns: 15,
    });
    expect(r.turns).toBeGreaterThan(0);
    expect(r.turns).toBeLessThanOrEqual(15);
    expect(r.log.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    const userDeck = buildBalancedDeck();
    const opps = [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()];
    const a = runGameWithSeed({ userDeck, opponents: opps, seed: 7 });
    const b = runGameWithSeed({ userDeck: buildBalancedDeck(), opponents: opps, seed: 7 });
    expect(a.winner).toBe(b.winner);
    expect(a.turns).toBe(b.turns);
  });

  it("reports the user's commander turn when the user wins", () => {
    const userDeck = buildBalancedDeck();
    const r = runGameWithSeed({
      userDeck,
      opponents: [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()],
      seed: 3,
    });
    if (r.winner === "P1") {
      expect(r.userCommanderTurn).not.toBeNull();
    }
  });
});

describe("simulate (aggregate)", () => {
  it("aggregates win rate, turns, mulligans across N games", () => {
    const userDeck = buildBalancedDeck();
    const result = simulate({
      userDeck,
      opponents: [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()],
      games: 5,
      seed: 100,
    });
    expect(result.games).toHaveLength(5);
    expect(result.aggregate.games).toBe(5);
    expect(result.aggregate.winRate).toBeGreaterThanOrEqual(0);
    expect(result.aggregate.winRate).toBeLessThanOrEqual(1);
    expect(result.aggregate.avgTurns).toBeGreaterThan(0);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("buckets winners across players in winsByArchetype", () => {
    const userDeck = buildBalancedDeck();
    const result = simulate({
      userDeck,
      opponents: [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()],
      games: 5,
      seed: 100,
    });
    const total = Object.values(result.aggregate.winsByArchetype).reduce(
      (a, b) => a + b,
      0,
    );
    // Either someone won every game (total = 5), or some games stalemated.
    expect(total).toBeLessThanOrEqual(5);
  });
});
