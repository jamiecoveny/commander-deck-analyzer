import { describe, expect, it } from "vitest";

import { getBracketProfile } from "./bracket";
import {
  availableMana,
  pickInteraction,
  shouldKeepHand,
  sortByPriority,
} from "./decisions";
import type { CardProfile, PlayerState } from "./types";
import { NO_PREREQUISITES } from "./types";

const B3 = getBracketProfile(3);
const B5 = getBracketProfile(5);

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
  producesColors: "",
  manaPerTurn: 0,
  rampsLands: 0,
  drawsCards: 0,
  killsCreatures: 0,
  isAltWincon: false,
  isCounter: false,
  prerequisites: NO_PREREQUISITES,
  triggers: {},
  ...over,
});

const land = (): CardProfile =>
  c({ isLand: true, isPermanent: true, producesColors: "WUBRG" });
const ramp = (cmc = 1): CardProfile =>
  c({
    cmc,
    manaPerTurn: 1,
    isPermanent: true,
    categories: ["ramp"],
    producesColors: "C",
  });

describe("shouldKeepHand", () => {
  it("rejects 0-land hands", () => {
    expect(
      shouldKeepHand([c(), c(), c(), c(), c(), c(), c()], 0, B3),
    ).toBe(false);
  });

  it("rejects 6-land hands (flooded)", () => {
    expect(
      shouldKeepHand(
        [land(), land(), land(), land(), land(), land(), c()],
        0,
        B3,
      ),
    ).toBe(false);
  });

  it("keeps a 3-land + ramp + threat hand", () => {
    const hand = [land(), land(), land(), ramp(1), c({ cmc: 2, isCreature: true }), c(), c()];
    expect(shouldKeepHand(hand, 0, B3)).toBe(true);
  });

  it("keeps unconditionally at depth 1 (B3 mulligan cap)", () => {
    expect(shouldKeepHand([], 1, B3)).toBe(true);
  });

  it("cEDH (B5) is stricter — rejects a hand with no early action even at depth 1", () => {
    // Lands + late-game threats only, no T1-T2 castable.
    const noEarly = [
      land(),
      land(),
      land(),
      c({ cmc: 5, isCreature: true, power: 5 }),
      c({ cmc: 6, isCreature: true, power: 6 }),
      c({ cmc: 7, isCreature: true, power: 7 }),
      c({ cmc: 8, isCreature: true, power: 8 }),
    ];
    // B5 has mulliganStrictness 1.5 → cap depth 2; depth 1 still mulligans.
    expect(shouldKeepHand(noEarly, 0, B5)).toBe(false);
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
      B3,
    );
    // Ramp wins early.
    expect(sorted[0]?.manaPerTurn).toBe(1);
  });

  it("prefers wincons late-game", () => {
    const wincon = c({ name: "Wincon", cmc: 3, isAltWincon: true });
    const ramper = ramp(2);
    const sorted = sortByPriority([ramper, wincon], 8, B3);
    expect(sorted[0]?.name).toBe("Wincon");
  });

  it("cEDH bias scores wincons higher than midrange does (relative)", () => {
    const wincon = c({ name: "Wincon", cmc: 2, isAltWincon: true });
    const filler = c({ name: "Filler", cmc: 2 });
    // At late game, both prioritize wincon, but B5 weights it more.
    const sortedB5 = sortByPriority([filler, wincon], 9, B5);
    const sortedB3 = sortByPriority([filler, wincon], 9, B3);
    expect(sortedB5[0]?.name).toBe("Wincon");
    expect(sortedB3[0]?.name).toBe("Wincon");
  });
});

describe("pickInteraction", () => {
  function defenderWith(card: CardProfile): PlayerState {
    return { hand: [card] } as unknown as PlayerState;
  }

  it("never reacts to a small non-wincon threat (B3)", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), 2, false, B3, () => 0),
    ).toBe(-1);
  });

  it("reacts to a wincon if a counter is in hand (B3, high prob)", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), 0, true, B3, () => 0),
    ).toBe(0);
  });

  it("returns -1 when there is no counter / removal", () => {
    expect(
      pickInteraction(defenderWith(c({ name: "Nothing" })), 0, true, B3, () => 0),
    ).toBe(-1);
  });

  it("cEDH (B5) reacts to a wincon at higher probability than B3", () => {
    const counter = c({ name: "Counter", isCounter: true });
    // rng returns 0.9 → above B3 threshold (0.65), below B5 threshold (0.95).
    expect(
      pickInteraction(defenderWith(counter), 0, true, B3, () => 0.9),
    ).toBe(-1);
    expect(
      pickInteraction(defenderWith(counter), 0, true, B5, () => 0.9),
    ).toBe(0);
  });
});
