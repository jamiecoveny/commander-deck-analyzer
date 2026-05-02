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

describe("runGameWithSeed — prerequisite gating", () => {
  function buildSacDeck(): CardProfile[] {
    // 100-card deck whose only non-land spells are a Culling-the-Weak
    // analogue (sac-creature cost) and Plains. The bug we're guarding
    // against: Culling getting cast turn 1 with no creatures on board.
    const commander = p({
      name: "Test Commander",
      cmc: 4,
      typeLine: "Legendary Creature",
      power: 4,
      toughness: 4,
      isCommander: true,
    });
    const culling = p({
      name: "Culling the Weak",
      cmc: 1,
      typeLine: "Instant",
      oracleText:
        "As an additional cost to cast this spell, sacrifice a creature.\nAdd {B}{B}{B}{B}.",
      categories: [],
    });
    const specs: Array<{ profile: CardProfile; quantity: number }> = [
      { profile: p({ name: "Land", typeLine: "Basic Land — Forest" }), quantity: 36 },
      { profile: culling, quantity: 4 },
      {
        profile: p({
          name: "Mid Threat",
          cmc: 4,
          typeLine: "Creature — Beast",
          power: 4,
          toughness: 4,
        }),
        quantity: 30,
      },
      {
        profile: p({
          name: "Vanilla",
          cmc: 2,
          typeLine: "Creature — Beast",
          power: 2,
          toughness: 2,
        }),
        quantity: 29,
      },
    ];
    return [commander, ...expandProfiles(specs)];
  }

  it("never casts Culling the Weak before any creature is on the board", () => {
    // Run several seeds; Culling has the right mana cost from turn 1
    // but should be blocked because the player has no creature to sac.
    for (let seed = 0; seed < 5; seed += 1) {
      const r = runGameWithSeed({
        userDeck: buildSacDeck(),
        opponents: [bracket3Midrange(), bracket3Midrange(), bracket3Midrange()],
        seed,
        maxTurns: 8,
      });
      // For every Culling cast, there must be at least one creature
      // on P1's board at the moment of cast (preceded by a creature
      // entering during the same turn or earlier).
      const userEvents = r.log.filter((e) => e.playerId === "P1");
      let hasCreatureBeforeCulling = false;
      let earliestCullingTurn: number | null = null;
      for (const e of userEvents) {
        if (/Cast (Mid Threat|Vanilla|Test Commander)/.test(e.text)) {
          hasCreatureBeforeCulling = true;
        }
        if (/Cast Culling the Weak/.test(e.text)) {
          if (earliestCullingTurn == null) earliestCullingTurn = e.turn;
          expect(hasCreatureBeforeCulling).toBe(true);
        }
      }
      // Optional sanity: if we ever cast it, it was no earlier than T2.
      if (earliestCullingTurn != null) {
        expect(earliestCullingTurn).toBeGreaterThanOrEqual(2);
      }
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
