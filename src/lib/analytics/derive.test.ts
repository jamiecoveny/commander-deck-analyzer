import { describe, expect, it } from "vitest";

import { derive, type DeriveInput } from "./derive";

const c = (over: Partial<DeriveInput["cards"][number]>): DeriveInput["cards"][number] => ({
  name: "X",
  oracleId: "x",
  quantity: 1,
  isCommander: false,
  cmc: 0,
  typeLine: "Artifact",
  manaCost: null,
  categories: [],
  ...over,
});

const baseInput = (
  cards: DeriveInput["cards"],
  commander = "Atraxa, Praetors' Voice",
): DeriveInput => ({
  commander,
  commanders: [commander],
  colorIdentity: "WUBG",
  cards,
});

describe("derive — totals and lands", () => {
  it("counts total cards and basic vs. nonbasic lands", () => {
    const input = baseInput([
      c({
        name: "Atraxa, Praetors' Voice",
        cmc: 4,
        typeLine: "Legendary Creature",
        manaCost: "{G}{W}{U}{B}",
        isCommander: true,
      }),
      c({ name: "Plains", typeLine: "Basic Land — Plains", quantity: 30, categories: ["land"] }),
      c({ name: "Forest", typeLine: "Basic Land — Forest", quantity: 30, categories: ["land"] }),
      c({ name: "Reflecting Pool", typeLine: "Land", quantity: 4, categories: ["land"] }),
      c({ name: "Sol Ring", typeLine: "Artifact", cmc: 1, manaCost: "{1}", categories: ["ramp"] }),
      c({ name: "Cultivate", typeLine: "Sorcery", cmc: 3, manaCost: "{2}{G}", categories: ["ramp"], quantity: 1 }),
    ]);
    const r = derive(input);
    expect(r.totalCards).toBe(67);
    expect(r.landCount).toBe(64);
    expect(r.basicLandCount).toBe(60);
    expect(r.nonbasicLandCount).toBe(4);
  });
});

describe("derive — mana curve", () => {
  it("buckets nonland CMCs and excludes the commander", () => {
    const input = baseInput([
      // Commander excluded from curve.
      c({ name: "Cmdr", cmc: 4, isCommander: true, typeLine: "Legendary Creature" }),
      c({ name: "One", cmc: 1, typeLine: "Sorcery" }),
      c({ name: "Two", cmc: 2, typeLine: "Instant", quantity: 3 }),
      c({ name: "Five", cmc: 5, typeLine: "Sorcery" }),
      c({ name: "Eight", cmc: 8, typeLine: "Sorcery" }),
      c({ name: "Plains", cmc: 0, typeLine: "Basic Land — Plains", categories: ["land"] }),
    ]);
    const r = derive(input);
    expect(r.manaCurve["1"]).toBe(1);
    expect(r.manaCurve["2"]).toBe(3);
    expect(r.manaCurve["5"]).toBe(1);
    expect(r.manaCurve["7+"]).toBe(1);
    // Commander not in curve.
    expect(r.manaCurve["4"]).toBe(0);
    // Land not in curve.
    expect(r.manaCurve["0"]).toBe(0);
  });
});

describe("derive — pip counts", () => {
  it("counts colored pips, ignores generic and X", () => {
    const input = baseInput([
      c({ name: "A", manaCost: "{2}{W}{U}", typeLine: "Sorcery", cmc: 4 }),
      c({ name: "B", manaCost: "{X}{B}", typeLine: "Sorcery", cmc: 1 }),
      c({ name: "C", manaCost: "{C}", typeLine: "Artifact", cmc: 1 }),
    ]);
    const r = derive(input);
    expect(r.pipCount).toEqual({ W: 1, U: 1, B: 1, R: 0, G: 0, C: 1 });
  });

  it("splits hybrid pips by half", () => {
    const input = baseInput([
      c({ name: "Hybrid", manaCost: "{W/U}{W/U}", typeLine: "Sorcery", cmc: 2 }),
    ]);
    const r = derive(input);
    expect(r.pipCount.W).toBe(1.0); // 0.5 + 0.5
    expect(r.pipCount.U).toBe(1.0);
  });
});

describe("derive — categories and average CMC", () => {
  it("aggregates category counts (skipping land)", () => {
    const input = baseInput([
      c({ name: "Atraxa", cmc: 4, isCommander: true, typeLine: "Legendary Creature", manaCost: "{G}{W}{U}{B}" }),
      c({ name: "Sol Ring", cmc: 1, typeLine: "Artifact", manaCost: "{1}", categories: ["ramp"] }),
      c({ name: "Cultivate", cmc: 3, typeLine: "Sorcery", manaCost: "{2}{G}", categories: ["ramp"] }),
      c({ name: "Counterspell", cmc: 2, typeLine: "Instant", manaCost: "{U}{U}", categories: ["counterspell"] }),
      c({ name: "Wrath of God", cmc: 4, typeLine: "Sorcery", manaCost: "{2}{W}{W}", categories: ["wipe"] }),
      c({ name: "Forest", typeLine: "Basic Land — Forest", categories: ["land"] }),
    ]);
    const r = derive(input);
    expect(r.categoryCounts.ramp).toBe(2);
    expect(r.categoryCounts.counterspell).toBe(1);
    expect(r.categoryCounts.wipe).toBe(1);
    // 1+3+2+4 = 10, divided by 4 nonlands (commander excluded) = 2.5
    expect(r.averageCmc).toBe(2.5);
  });

  it("returns 0 average CMC if there are no nonland cards (degenerate)", () => {
    const input = baseInput([
      c({ name: "Atraxa", cmc: 4, isCommander: true, typeLine: "Legendary Creature" }),
      c({ name: "Forest", typeLine: "Basic Land — Forest", categories: ["land"] }),
    ]);
    expect(derive(input).averageCmc).toBe(0);
  });
});
