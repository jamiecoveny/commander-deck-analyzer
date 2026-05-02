// Pre-built opponent archetype templates. Each one carries an explicit
// bracket so the engine can apply the matching BracketProfile (mulligan
// strictness, react probability, win-mix bias).
//
// These aren't real decklists — they're profile counts intended to
// produce a believable curve, ramp suite, and threat density when run
// through the engine. Numbers are tuned for a 100-card deck. Lands all
// produce rainbow ("WUBRG") so we don't punish opponents for color
// screws — the user's own deck is the one we actually want to test.

import type { CardCategory } from "@/lib/db/card";

import { expandProfiles } from "./profiles";
import type { CardProfile, PlayerArchetype, TriggerProfile } from "./types";
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
  producesColors?: string;
  triggers?: TriggerProfile;
}

let oracleCounter = 0;

function p(spec: ProfileSpec): CardProfile {
  oracleCounter += 1;
  const isLand = spec.isLand ?? false;
  const manaPerTurn = spec.manaPerTurn ?? 0;
  return {
    oracleId: `template-${oracleCounter}`,
    name: spec.name,
    cmc: spec.cmc,
    manaCostColors: spec.manaCostColors ?? "",
    categories: spec.categories,
    isLand,
    isCreature: spec.isCreature ?? false,
    isPermanent: spec.isPermanent ?? (isLand || spec.isCreature || false),
    isCommander: spec.isCommander ?? false,
    power: spec.power ?? 0,
    toughness: spec.toughness ?? 0,
    producesColors:
      spec.producesColors ?? (isLand ? "WUBRG" : manaPerTurn > 0 ? "C" : ""),
    manaPerTurn,
    rampsLands: spec.rampsLands ?? 0,
    drawsCards: spec.drawsCards ?? 0,
    killsCreatures: spec.killsCreatures ?? 0,
    isAltWincon: spec.isAltWincon ?? false,
    isCounter: spec.isCounter ?? false,
    prerequisites: NO_PREREQUISITES,
    triggers: spec.triggers ?? {},
  };
}

const land = (label: string): CardProfile =>
  p({
    name: label,
    cmc: 0,
    categories: ["land"],
    isLand: true,
    isPermanent: true,
    producesColors: "WUBRG",
  });

const ramp = (cmc = 2, perTurn = 1): CardProfile =>
  p({
    name: `Mana Rock (CMC ${cmc})`,
    cmc,
    categories: ["ramp"],
    isPermanent: true,
    manaPerTurn: perTurn,
    producesColors: "C",
  });

// ---------- Archetypes ----------

/**
 * Bracket-2 "Core" — precon-power. Slower, more fair, fewer tutors.
 */
export function bracket2Core(): PlayerArchetype {
  const commander = p({
    name: "Generic Commander (B2 Core)",
    cmc: 5,
    categories: ["utility"],
    isCreature: true,
    isPermanent: true,
    isCommander: true,
    power: 4,
    toughness: 5,
  });
  const specs: Array<{ profile: CardProfile; quantity: number }> = [
    { profile: land("Land (B2)"), quantity: 38 },
    { profile: ramp(2, 1), quantity: 8 },
    { profile: p({ name: "Card Draw (B2)", cmc: 4, categories: ["draw"], drawsCards: 2 }), quantity: 10 },
    { profile: p({ name: "Spot Removal (B2)", cmc: 3, categories: ["removal"], killsCreatures: 1 }), quantity: 5 },
    { profile: p({ name: "Board Wipe (B2)", cmc: 5, categories: ["wipe"], killsCreatures: 99 }), quantity: 2 },
    { profile: p({ name: "Mid Threat (B2)", cmc: 4, categories: ["utility"], isCreature: true, isPermanent: true, power: 3, toughness: 4 }), quantity: 14 },
    { profile: p({ name: "Big Threat (B2)", cmc: 6, categories: ["utility"], isCreature: true, isPermanent: true, power: 6, toughness: 6 }), quantity: 8 },
    { profile: p({ name: "Utility (B2)", cmc: 3, categories: ["utility"] }), quantity: 14 },
  ];
  return { name: "Bracket-2 Core", deck: [commander, ...expandProfiles(specs)], bracket: 2 };
}

/**
 * Bracket-3 "Upgraded" — the original opponent template. Tuned suite.
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
  const specs: Array<{ profile: CardProfile; quantity: number }> = [
    { profile: land("Land (B3)"), quantity: 36 },
    { profile: ramp(2, 1), quantity: 4 },
    { profile: p({ name: "Land Ramp (B3)", cmc: 3, categories: ["ramp"], rampsLands: 1 }), quantity: 4 },
    { profile: p({ name: "Sol Ring", cmc: 1, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: p({ name: "Arcane Signet", cmc: 2, categories: ["ramp"], isPermanent: true, manaPerTurn: 1, producesColors: "C" }), quantity: 1 },
    { profile: p({ name: "Card Draw (B3)", cmc: 3, categories: ["draw"], drawsCards: 2 }), quantity: 6 },
    { profile: p({ name: "Repeatable Draw (B3)", cmc: 3, categories: ["draw"], isPermanent: true, drawsCards: 1 }), quantity: 4 },
    { profile: p({ name: "Spot Removal (B3)", cmc: 2, categories: ["removal"], killsCreatures: 1 }), quantity: 5 },
    { profile: p({ name: "Board Wipe (B3)", cmc: 4, categories: ["wipe"], killsCreatures: 99 }), quantity: 2 },
    { profile: p({ name: "Counterspell (B3)", cmc: 2, categories: ["counterspell"], isCounter: true }), quantity: 1 },
    { profile: p({ name: "Small Threat (B3)", cmc: 2, categories: ["utility"], isCreature: true, isPermanent: true, power: 2, toughness: 2 }), quantity: 8 },
    { profile: p({ name: "Mid Threat (B3)", cmc: 4, categories: ["utility"], isCreature: true, isPermanent: true, power: 4, toughness: 4 }), quantity: 10 },
    { profile: p({ name: "Big Threat (B3)", cmc: 6, categories: ["utility"], isCreature: true, isPermanent: true, power: 6, toughness: 6 }), quantity: 6 },
    { profile: p({ name: "Finisher (B3)", cmc: 7, categories: ["utility"], isCreature: true, isPermanent: true, power: 8, toughness: 8 }), quantity: 3 },
    { profile: p({ name: "Utility (B3)", cmc: 3, categories: ["utility"] }), quantity: 8 },
  ];
  return { name: "Bracket-3 Midrange", deck: [commander, ...expandProfiles(specs)], bracket: 3 };
}

/**
 * Bracket-4 "Optimized" — fast mana, more tutors, combo lines, more
 * counterspells. Combo can win turn 4–7.
 */
export function bracket4Optimized(): PlayerArchetype {
  const commander = p({
    name: "Generic Commander (B4 Optimized)",
    cmc: 3,
    categories: ["utility"],
    isCreature: true,
    isPermanent: true,
    isCommander: true,
    power: 3,
    toughness: 3,
  });
  const specs: Array<{ profile: CardProfile; quantity: number }> = [
    { profile: land("Land (B4)"), quantity: 32 },
    { profile: p({ name: "Sol Ring", cmc: 1, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: p({ name: "Mana Crypt", cmc: 0, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: ramp(2, 1), quantity: 6 },
    { profile: p({ name: "Land Ramp (B4)", cmc: 2, categories: ["ramp"], rampsLands: 1 }), quantity: 4 },
    { profile: p({ name: "Tutor (B4)", cmc: 2, categories: ["tutor"] }), quantity: 4 },
    { profile: p({ name: "Card Draw (B4)", cmc: 3, categories: ["draw"], drawsCards: 2 }), quantity: 6 },
    { profile: p({ name: "Spot Removal (B4)", cmc: 1, categories: ["removal"], killsCreatures: 1 }), quantity: 4 },
    { profile: p({ name: "Counterspell (B4)", cmc: 2, categories: ["counterspell"], isCounter: true }), quantity: 6 },
    { profile: p({ name: "Wincon Combo Piece (B4)", cmc: 2, categories: ["wincon"], isAltWincon: true }), quantity: 2 },
    { profile: p({ name: "Mid Threat (B4)", cmc: 3, categories: ["utility"], isCreature: true, isPermanent: true, power: 3, toughness: 3 }), quantity: 12 },
    { profile: p({ name: "Big Threat (B4)", cmc: 5, categories: ["utility"], isCreature: true, isPermanent: true, power: 5, toughness: 5 }), quantity: 6 },
    { profile: p({ name: "Utility (B4)", cmc: 2, categories: ["utility"] }), quantity: 15 },
  ];
  return { name: "Bracket-4 Optimized", deck: [commander, ...expandProfiles(specs)], bracket: 4 };
}

/**
 * Bracket-5 "cEDH" — turbo combo. Aims to win turns 3–5. Loaded with
 * counterspells; thin on creatures.
 */
export function bracket5CEDH(): PlayerArchetype {
  const commander = p({
    name: "Generic cEDH Commander",
    cmc: 2,
    categories: ["utility"],
    isCreature: true,
    isPermanent: true,
    isCommander: true,
    power: 2,
    toughness: 2,
  });
  const specs: Array<{ profile: CardProfile; quantity: number }> = [
    { profile: land("Land (B5)"), quantity: 30 },
    { profile: p({ name: "Sol Ring", cmc: 1, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: p({ name: "Mana Crypt", cmc: 0, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: p({ name: "Mana Vault", cmc: 1, categories: ["ramp"], isPermanent: true, manaPerTurn: 2, producesColors: "C" }), quantity: 1 },
    { profile: ramp(2, 1), quantity: 6 },
    { profile: p({ name: "Tutor (B5)", cmc: 1, categories: ["tutor"] }), quantity: 8 },
    { profile: p({ name: "Card Draw (B5)", cmc: 2, categories: ["draw"], drawsCards: 2 }), quantity: 6 },
    { profile: p({ name: "Counterspell (B5)", cmc: 2, categories: ["counterspell"], isCounter: true }), quantity: 12 },
    { profile: p({ name: "Free Counter (B5)", cmc: 0, categories: ["counterspell"], isCounter: true }), quantity: 4 },
    { profile: p({ name: "Wincon (B5)", cmc: 2, categories: ["wincon"], isAltWincon: true }), quantity: 4 },
    { profile: p({ name: "Combo Piece (B5)", cmc: 2, categories: ["utility"] }), quantity: 6 },
    { profile: p({ name: "Removal (B5)", cmc: 1, categories: ["removal"], killsCreatures: 1 }), quantity: 4 },
    { profile: p({ name: "Filler (B5)", cmc: 1, categories: ["utility"] }), quantity: 16 },
  ];
  return { name: "Bracket-5 cEDH", deck: [commander, ...expandProfiles(specs)], bracket: 5 };
}
