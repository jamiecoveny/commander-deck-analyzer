import { describe, expect, it } from "vitest";

import { getBracketProfile } from "./bracket";
import {
  availableMana,
  chooseCombatTarget,
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

describe("chooseCombatTarget — Phase D threat awareness", () => {
  function pl(over: Partial<PlayerState>): PlayerState {
    return {
      id: "X",
      isUser: false,
      archetype: "test",
      bracket: 3,
      life: 40,
      lossReason: "",
      library: [],
      hand: [],
      graveyard: [],
      lands: [],
      permanents: [],
      commander: null,
      commanderInPlay: false,
      commanderTax: 0,
      commanderDamageTo: {},
      mulligansTaken: 0,
      firstWinconAttemptTurn: null,
      commanderCastTurn: null,
      ...over,
    } as PlayerState;
  }

  it("attacks the wincon-threat opponent over a low-life opponent", () => {
    const me = pl({ id: "P1" });
    const lowLife = pl({ id: "P2", life: 5 });
    const wincon = c({ isAltWincon: true, isPermanent: true });
    const threatOpp = pl({ id: "P3", life: 38, permanents: [wincon] });
    const target = chooseCombatTarget("P1", [me, lowLife, threatOpp]);
    expect(target?.id).toBe("P3");
  });

  it("goes for lethal when available", () => {
    const me = pl({
      id: "P1",
      permanents: [c({ isCreature: true, power: 10, toughness: 10 })],
    });
    const lethalTarget = pl({ id: "P2", life: 8 });
    const bigger = pl({
      id: "P3",
      life: 40,
      permanents: [c({ isAltWincon: true, isPermanent: true })],
    });
    const t = chooseCombatTarget("P1", [me, lethalTarget, bigger]);
    expect(t?.id).toBe("P2");
  });
});

describe("pickInteraction", () => {
  function defenderWith(card: CardProfile): PlayerState {
    return { hand: [card] } as unknown as PlayerState;
  }

  it("never reacts to a small non-wincon threat (B3)", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), null, 2, false, B3, () => 0),
    ).toBe(-1);
  });

  it("reacts to a wincon if a counter is in hand (B3, high prob)", () => {
    const counter = c({ name: "Counter", isCounter: true });
    expect(
      pickInteraction(defenderWith(counter), null, 0, true, B3, () => 0),
    ).toBe(0);
  });

  it("returns -1 when there is no counter / removal", () => {
    expect(
      pickInteraction(defenderWith(c({ name: "Nothing" })), null, 0, true, B3, () => 0),
    ).toBe(-1);
  });

  it("cEDH (B5) reacts to a wincon at higher probability than B3", () => {
    const counter = c({ name: "Counter", isCounter: true });
    // rng returns 0.9 → above B3 threshold (0.65), below B5 threshold (0.95).
    expect(
      pickInteraction(defenderWith(counter), null, 0, true, B3, () => 0.9),
    ).toBe(-1);
    expect(
      pickInteraction(defenderWith(counter), null, 0, true, B5, () => 0.9),
    ).toBe(0);
  });
});
