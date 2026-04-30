// Hand-crafted card-lookup rows for validator tests. Just the columns
// the validator reads — no Prisma involved.

import type { CardLookupRow } from "../types";

const c = (
  name: string,
  typeLine: string,
  colorIdentity: string,
  oracleText = "",
): CardLookupRow => ({
  name,
  oracleId: `oid-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  typeLine,
  oracleText,
  colorIdentity,
});

export const ATRAXA = c(
  "Atraxa, Praetors' Voice",
  "Legendary Creature — Phyrexian Angel Horror",
  "WUBG",
  "Flying, vigilance, deathtouch, lifelink. Proliferate at end step.",
);

export const KRENKO = c(
  "Krenko, Mob Boss",
  "Legendary Creature — Goblin Warrior",
  "R",
  "Tap: Create X 1/1 red Goblin tokens.",
);

export const SOL_RING = c("Sol Ring", "Artifact", "", "{T}: Add {C}{C}.");
export const CULTIVATE = c(
  "Cultivate",
  "Sorcery",
  "G",
  "Search your library for up to two basic land cards...",
);
export const PLAINS = c("Plains", "Basic Land — Plains", "W", "{T}: Add {W}.");
export const FOREST = c("Forest", "Basic Land — Forest", "G", "{T}: Add {G}.");
export const RELENTLESS_RATS = c(
  "Relentless Rats",
  "Creature — Rat",
  "B",
  "Relentless Rats gets +1/+1 for each other creature you control named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.",
);

// A red card to use as a color-identity violator with a Bant commander.
export const LIGHTNING_BOLT = c(
  "Lightning Bolt",
  "Instant",
  "R",
  "Lightning Bolt deals 3 damage to any target.",
);

// Banned card example — must match config/banned-list.json
export const TIME_VAULT = c(
  "Time Vault",
  "Artifact",
  "",
  "Time Vault enters tapped. Activate: Take an extra turn.",
);

// Partners
export const TANA = c(
  "Tana, the Bloodsower",
  "Legendary Creature — Elf Druid",
  "RG",
  "Partner (You can have two commanders if both have partner.)\nWhenever Tana deals combat damage to a player, create that many 1/1 green Saproling tokens.",
);
export const SIDAR = c(
  "Sidar Kondo of Jamuraa",
  "Legendary Creature — Human Knight",
  "WG",
  "Partner (You can have two commanders if both have partner.)\nCreatures you control with power 2 or less have flying.",
);

// Non-legendary "commander" — should be rejected as ineligible.
export const GRIZZLY_BEARS = c(
  "Grizzly Bears",
  "Creature — Bear",
  "G",
  "",
);
