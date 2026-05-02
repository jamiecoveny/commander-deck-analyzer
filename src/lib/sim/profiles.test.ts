import { describe, expect, it } from "vitest";

import { buildProfile, type ProfileInput } from "./profiles";

function build(over: Partial<ProfileInput>) {
  return buildProfile({
    oracleId: "x",
    name: "Test",
    cmc: 0,
    manaCost: null,
    typeLine: "Sorcery",
    oracleText: "",
    power: 0,
    toughness: 0,
    categories: [],
    isCommander: false,
    ...over,
  });
}

describe("buildProfile — prerequisite detection", () => {
  it("detects sacrifice-creature additional cost from oracle text", () => {
    const p = build({
      name: "Some Made-Up Sac Spell",
      oracleText:
        "As an additional cost to cast this spell, sacrifice a creature.\nAdd {B}{B}{B}{B}.",
    });
    expect(p.prerequisites.sacCreatures).toBe(1);
  });

  it("detects 'sacrifice two' with quantity word", () => {
    const p = build({
      oracleText:
        "As an additional cost to cast this spell, sacrifice two creatures.",
    });
    expect(p.prerequisites.sacCreatures).toBe(2);
  });

  it("detects pay-life additional cost", () => {
    const p = build({
      oracleText:
        "As an additional cost to cast this spell, pay 4 life.\nDestroy target creature.",
    });
    expect(p.prerequisites.payLife).toBe(4);
  });

  it("detects discard-card additional cost", () => {
    const p = build({
      oracleText:
        "As an additional cost to cast this spell, discard a card.",
    });
    expect(p.prerequisites.discardCards).toBe(1);
  });

  it("detects graveyard requirement (own grave)", () => {
    const p = build({
      oracleText:
        "Return target creature card from your graveyard to the battlefield.",
    });
    expect(p.prerequisites.ownGraveCreatures).toBe(1);
  });

  it("detects graveyard requirement (any grave)", () => {
    const p = build({
      name: "Reanimate (test)",
      oracleText:
        "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.",
    });
    expect(p.prerequisites.anyGraveCreatures).toBe(1);
  });

  it("named override beats text detection", () => {
    // Culling the Weak's named override sets sacCreatures: 1.
    const p = build({
      name: "Culling the Weak",
      oracleText: "totally unrelated text",
    });
    expect(p.prerequisites.sacCreatures).toBe(1);
  });

  it("Victimize gets ownGraveCreatures + sacCreatures from override", () => {
    const p = build({
      name: "Victimize",
      oracleText: "...",
    });
    expect(p.prerequisites.ownGraveCreatures).toBe(1);
    expect(p.prerequisites.sacCreatures).toBe(1);
  });

  it("vanilla card has no prerequisites", () => {
    const p = build({
      name: "Vanilla",
      oracleText: "First strike.",
      typeLine: "Creature",
    });
    expect(p.prerequisites).toEqual({
      sacCreatures: 0,
      sacLands: 0,
      discardCards: 0,
      payLife: 0,
      ownGraveCreatures: 0,
      anyGraveCreatures: 0,
    });
  });
});
