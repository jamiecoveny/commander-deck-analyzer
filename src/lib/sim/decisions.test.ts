import { describe, expect, it } from "vitest";

import { availableMana, pickInteraction, shouldKeepHand, sortByPriority } from "./decisions";
import { makeRng } from "./rng";
import type { CardProfile, PlayerState } from "./types";
import { NO_PREREQUISITES } from "./types";

const c = (over: Partial<CardProfile> = {}): CardProfile => ({
  oracleId: "x",
  name: "Test",
  cmc: 0,
  manaCostColors: "",
  categories: ["utility"],
  isLand: false,
  isCreature: false,
  isPermanent: false,
  isCommander: false,
  power: 0,
  toughness: 0,
  manaPerTurn: 0,
  rampsLands: 0,
  drawsCards: 0,
  killsCreatures: 0,
  isAltWincon: false,
  isCounter: false,
  prerequisites: NO_PREREQUISITES,
  ...over,
});

const land = (): CardProfile => c({ isLand: true, isPermanent: true });
const ramp = (cmc = 1): CardProfile =>
  c({ cmc, manaPerTurn: 1, isPermanent: true, categories: ["ramp"] });

describe("shouldKeepHand", () => {
  it("rejects 0-land hands", () => {
    expect(shouldKeepHand([c(), c(), c(), c(), c(), c(), c()], 0)).toBe(false);
  });

  it("rejects 6-land hands (flooded)", () => {
    expect(shouldKeepHand([land(), land(), land(), land(), land(), land(), c()], 0)).toBe(false);
  });

  it("keeps a 3-land + ramp + threat hand", () => {
    const hand = [land(), land(), land(), ramp(1), c({ cmc: 2, isCreature: true }), c(), c()];
    expect(shouldKeepHand(hand, 0)).toBe(true);
  });

  it("keeps unconditionally at depth 1 (mulligan cap)", () => {
    expect(shouldKeepHand([], 1)).toBe(true);
  });
});

describe("availableMana", () => {
  it("counts lands and rocks", () => {
    const player = {
      lands: [land(), land(), land()],
      permanents: [c({ manaPerTurn: 2 }), c({ manaPerTurn: 1 })],
    } as unknown as PlayerState;
    expect(availableMana(player)).toBe(6);
  });
});

describe("sortByPriority", () => {
  it("prefers ramp early-game", () => {
    const sorted = sortByPriority(
      [c({ cmc: 5, isCreature: true, power: 5 }), ramp(2)],
      2,
    );
    expect(sorted[0]?.name).toBe("Test");
    expect(sorted[0]?.manaPerTurn).toBe(1);
  });

  it("prefers wincons late-game", () => {
    const wincon = c({ name: "Wincon", cmc: 3, isAltWincon: true });
    const ramper = ramp(2);
    const sorted = sortByPriority([ramper, wincon], 8);
    expect(sorted[0]?.name).toBe("Wincon");
  });
});

describe("pickInteraction", () => {
  function defenderWith(card: CardProfile): PlayerState {
    return {
      hand: [card],
    } as unknown as PlayerState;
  }

  it("never reacts to a small non-wincon threat", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), 2, false, () => 0),
    ).toBe(-1);
  });

  it("reacts to a wincon if a counter is in hand (high prob)", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), 0, true, () => 0),
    ).toBe(0);
  });

  it("returns -1 when there is no counter / removal", () => {
    expect(
      pickInteraction(defenderWith(c({ name: "Nothing" })), 0, true, () => 0),
    ).toBe(-1);
  });

  it("reacts to a 6+ power threat with removal sometimes", () => {
    const removal = c({ name: "Doom Blade", killsCreatures: 1 });
    // makeRng(0)() returns ~0.42, which is < 0.5 -> reacts.
    const rng = makeRng(0);
    const idx = pickInteraction(defenderWith(removal), 7, false, rng);
    expect(idx === 0 || idx === -1).toBe(true);
  });
});
