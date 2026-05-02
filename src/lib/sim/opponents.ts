// Pre-built opponent archetype templates. Phase 1 ships one (a generic
// Bracket-3 midrange "good stuff" pile); the brief's full archetype set
// (Aggro Voltron / Group Hug / Combo / etc.) lands later.
//
// These aren't real decklists — they're profile counts intended to
// produce a believable curve, ramp suite, and threat density when run
// through the engine. The numbers are tuned for a 100-card deck.

import type { CardCategory } from "@/lib/db/card";

import { expandProfiles } from "./profiles";
import type { CardProfile, PlayerArchetype } from "./types";
import { NO_PREREQUISITES } from "./types";

interface ProfileSpec {
  name: string;
  cmc: number;
  manaCostColors?: string;
  categories: CardCategory[];
  isLand?: boolean;
  isCreature?: boolean;
  isPermanent?: boolean;
  isCommander?: boolean;
  power?: number;
  toughness?: number;
  manaPerTurn?: number;
  rampsLands?: number;
  drawsCards?: number;
  killsCreatures?: number;
  isCounter?: boolean;
  isAltWincon?: boolean;
}

let oracleCounter = 0;

function p(spec: ProfileSpec): CardProfile {
  oracleCounter += 1;
  return {
    oracleId: `template-${oracleCounter}`,
    name: spec.name,
    cmc: spec.cmc,
    manaCostColors: spec.manaCostColors ?? "",
    categories: spec.categories,
    isLand: spec.isLand ?? false,
    isCreature: spec.isCreature ?? false,
    isPermanent: spec.isPermanent ?? (spec.isLand || spec.isCreature || false),
    isCommander: spec.isCommander ?? false,
    power: spec.power ?? 0,
    toughness: spec.toughness ?? 0,
    manaPerTurn: spec.manaPerTurn ?? 0,
    rampsLands: spec.rampsLands ?? 0,
    drawsCards: spec.drawsCards ?? 0,
    killsCreatures: spec.killsCreatures ?? 0,
    isAltWincon: spec.isAltWincon ?? false,
    isCounter: spec.isCounter ?? false,
    prerequisites: NO_PREREQUISITES,
  };
}

/**
 * Bracket-3 "Upgraded" generic midrange. ~36 lands, ~10 ramp, ~10 draw,
 * ~8 interaction (removal + counters), a handful of threats and a
 * commander stand-in.
 */
export function bracket3Midrange(): PlayerArchetype {
  const commander = p({
    name: "Generic Commander (B3 Midrange)",
    cmc: 4,
    categories: ["utility"],
    isCreature: true,
    isPermanent: true,
    isCommander: true,
    power: 4,
    toughness: 4,
  });

  const generic: Array<{ profile: CardProfile; quantity: number }> = [
    // Lands — 36 total.
    { profile: p({ name: "Land (B3)", cmc: 0, categories: ["land"], isLand: true, isPermanent: true }), quantity: 36 },
    // Ramp — 10.
    { profile: p({ name: "Mana Rock (B3)", cmc: 2, categories: ["ramp"], isPermanent: true, manaPerTurn: 1 }), quantity: 4 },
    { profile: p({ name: "Land Ramp (B3)", cmc: 3, categories: ["ramp"], rampsLands: 1 }), quantity: 4 },
    { profile: p({ name: "Sol Ring", cmc: 1, categories: ["ramp"], isPermanent: true, manaPerTurn: 2 }), quantity: 1 },
    { profile: p({ name: "Arcane Signet", cmc: 2, categories: ["ramp"], isPermanent: true, manaPerTurn: 1 }), quantity: 1 },
    // Draw — 10.
    { profile: p({ name: "Card Draw (B3)", cmc: 3, categories: ["draw"], drawsCards: 2 }), quantity: 6 },
    { profile: p({ name: "Repeatable Draw (B3)", cmc: 3, categories: ["draw"], isPermanent: true, drawsCards: 1 }), quantity: 4 },
    // Interaction — 8.
    { profile: p({ name: "Spot Removal (B3)", cmc: 2, categories: ["removal"], killsCreatures: 1 }), quantity: 5 },
    { profile: p({ name: "Board Wipe (B3)", cmc: 4, categories: ["wipe"], killsCreatures: 99 }), quantity: 2 },
    { profile: p({ name: "Counterspell (B3)", cmc: 2, categories: ["counterspell"], isCounter: true }), quantity: 1 },
    // Threats — 35 (creatures + utility permanents).
    { profile: p({ name: "Small Threat (B3)", cmc: 2, categories: ["utility"], isCreature: true, isPermanent: true, power: 2, toughness: 2 }), quantity: 8 },
    { profile: p({ name: "Mid Threat (B3)", cmc: 4, categories: ["utility"], isCreature: true, isPermanent: true, power: 4, toughness: 4 }), quantity: 10 },
    { profile: p({ name: "Big Threat (B3)", cmc: 6, categories: ["utility"], isCreature: true, isPermanent: true, power: 6, toughness: 6 }), quantity: 6 },
    { profile: p({ name: "Finisher (B3)", cmc: 7, categories: ["utility"], isCreature: true, isPermanent: true, power: 8, toughness: 8 }), quantity: 3 },
    // Filler utility (sorceries / enchantments).
    { profile: p({ name: "Utility (B3)", cmc: 3, categories: ["utility"] }), quantity: 8 },
  ];

  // Commander as the 100th card (engine pulls it out of `library`
  // before shuffling and treats it as the command zone).
  const deck = [commander, ...expandProfiles(generic)];
  return { name: "Bracket-3 Midrange", deck };
}
