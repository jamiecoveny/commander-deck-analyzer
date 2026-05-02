import { describe, expect, it } from "vitest";

import {
  attackerPower,
  canLethal,
  chooseRemovalTargets,
  comboRiskScore,
  estimateCombatDamage,
  removalTargetScore,
  reservedReactiveMana,
  threatScore,
} from "./threats";
import type { CardProfile, PlayerState, TriggerProfile } from "./types";
import { NO_PREREQUISITES } from "./types";

const c = (over: Partial<CardProfile> = {}): CardProfile => ({
  oracleId: "x",
  name: "T",
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

const trig = (t: TriggerProfile): CardProfile => c({ triggers: t, isPermanent: true });

const player = (over: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: "P1",
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
  }) as PlayerState;

describe("threatScore", () => {
  it("scores a wincon on board very high", () => {
    const wincon = c({ name: "Thoracle", isAltWincon: true, isPermanent: true });
    const p = player({ permanents: [wincon] });
    expect(threatScore(p)).toBeGreaterThanOrEqual(50);
  });

  it("scores combat clock + mana base", () => {
    const fatty = c({ isCreature: true, power: 6, toughness: 6 });
    const p = player({
      permanents: [fatty],
      lands: [c({ isLand: true })],
    });
    // 6 power × 2 + 1 land = 13.
    expect(threatScore(p)).toBeGreaterThanOrEqual(13);
  });
});

describe("comboRiskScore", () => {
  it("flags 2+ on aristocrats board", () => {
    const altar = trig({ sacForMana: 1 });
    const blood = trig({ onAnyCreatureDiesDrain: 1 });
    const p = player({ permanents: [altar, blood] });
    expect(comboRiskScore(p)).toBeGreaterThanOrEqual(2);
  });

  it("returns 0 on a vanilla board", () => {
    const fatty = c({ isCreature: true, power: 6, toughness: 6, isPermanent: true });
    expect(comboRiskScore(player({ permanents: [fatty] }))).toBe(0);
  });
});

describe("removalTargetScore", () => {
  it("ranks wincon > commander > sac outlet > vanilla", () => {
    const wincon = c({ isAltWincon: true });
    const sacOutlet = trig({ sacForMana: 1 });
    const vanilla = c({ isCreature: true, power: 5 });
    expect(removalTargetScore(wincon, false)).toBeGreaterThan(
      removalTargetScore(vanilla, true), // even commander < wincon
    );
    expect(removalTargetScore(sacOutlet, false)).toBeGreaterThan(
      removalTargetScore(vanilla, false),
    );
  });
});

describe("chooseRemovalTargets", () => {
  it("targets wincon-creature first, then high-priority utility creatures over fatties", () => {
    // Removal can only hit creatures (matches engine's spot-removal model).
    const wincon = c({ name: "Wincon", isAltWincon: true, isCreature: true, isPermanent: true });
    const fatty = c({ name: "Fatty", isCreature: true, power: 8, toughness: 8, isPermanent: true });
    const seer = c({
      name: "Seer",
      isCreature: true,
      power: 1,
      toughness: 1,
      isPermanent: true,
      triggers: { sacForDraw: 1 },
    });
    const op1 = player({ id: "P2", permanents: [fatty] });
    const op2 = player({ id: "P3", permanents: [wincon, seer] });

    const targets = chooseRemovalTargets([op1, op2], 2);
    const names = targets.map((t) => t.card.name);
    expect(names[0]).toBe("Wincon");
    expect(names).toContain("Seer"); // small but high priority — beats raw fatty
  });
});

describe("combat math", () => {
  const me = player({
    id: "P1",
    permanents: [
      c({ isCreature: true, power: 8, toughness: 8 }),
      c({ isCreature: true, power: 4, toughness: 4 }),
    ],
  });

  it("attackerPower sums creatures", () => {
    expect(attackerPower(me)).toBe(12);
  });

  it("estimateCombatDamage is positive when attacker > defender", () => {
    const target = player({ id: "P2", life: 5 });
    expect(estimateCombatDamage(me, target)).toBe(12);
  });

  it("canLethal flags when damage >= life", () => {
    const target = player({ id: "P2", life: 10 });
    expect(canLethal(me, target)).toBe(true);
  });
});

describe("reservedReactiveMana", () => {
  const counter = c({ isCounter: true, cmc: 2 });

  it("returns 0 at B1-B2", () => {
    const p = player({ hand: [counter], bracket: 2 });
    const opp = player({ id: "P2", permanents: [c({ isCreature: true, power: 6, toughness: 6 })] });
    expect(reservedReactiveMana(p, [opp], 2)).toBe(0);
  });

  it("returns 0 when there's no scary opponent", () => {
    const p = player({ hand: [counter], bracket: 4 });
    const opp = player({ id: "P2" });
    expect(reservedReactiveMana(p, [opp], 4)).toBe(0);
  });

  it("reserves the cheapest counter cost when an opponent shows combo risk", () => {
    const p = player({ hand: [counter], bracket: 3 });
    const opp = player({
      id: "P2",
      permanents: [
        c({ isAltWincon: true, isPermanent: true }),
        trig({ sacForMana: 1 }),
      ],
    });
    expect(reservedReactiveMana(p, [opp], 3)).toBe(2);
  });

  it("cEDH (B5) always reserves with any threat", () => {
    const p = player({ hand: [counter], bracket: 5 });
    const opp = player({
      id: "P2",
      permanents: [c({ isCreature: true, power: 7, toughness: 7 })],
    });
    expect(reservedReactiveMana(p, [opp], 5)).toBe(2);
  });
});
