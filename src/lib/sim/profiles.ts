// Build CardProfiles for the sim.
//
// Top ~30 most-played EDH cards have hand-tuned numbers (mana production,
// ramp lands, draws, kills) keyed by name. For everything else we fall
// back to a category-based default — coarse, but the brief explicitly
// flags this as the right tradeoff for Phase 2's first cut.
//
// Source data: a NormalizedCard-shaped row + classifier categories.

import type { CardCategory } from "@/lib/db/card";

import type {
  CardProfile,
  CastPrerequisites,
  TriggerProfile,
} from "./types";
import { NO_PREREQUISITES } from "./types";

const NO_TRIGGERS: TriggerProfile = {};

export interface ProfileInput {
  oracleId: string;
  name: string;
  cmc: number;
  manaCost: string | null;
  typeLine: string;
  oracleText: string;
  power: number;
  toughness: number;
  categories: readonly CardCategory[];
  isCommander: boolean;
}

interface ProfileOverride {
  manaPerTurn?: number;
  rampsLands?: number;
  drawsCards?: number;
  killsCreatures?: number;
  isAltWincon?: boolean;
  isCounter?: boolean;
  prerequisites?: Partial<CastPrerequisites>;
  triggers?: TriggerProfile;
  /** WUBRG colors this card produces if it's a mana source. */
  producesColors?: string;
}

/** Hand-tuned overrides for high-impact staples. Keyed by canonical name. */
const NAMED: Record<string, ProfileOverride> = {
  // Mana rocks (pay-once, mana-per-turn). Most produce colorless;
  // Signets / Talismans are 2-color, Arcane Signet is rainbow within
  // the commander's identity (we approximate as colorless since we
  // don't track per-deck identity at profile-build time).
  "Sol Ring": { manaPerTurn: 2, producesColors: "C" },
  "Mana Crypt": { manaPerTurn: 2, producesColors: "C" },
  "Arcane Signet": { manaPerTurn: 1, producesColors: "C" },
  "Mind Stone": { manaPerTurn: 1, producesColors: "C" },
  "Fellwar Stone": { manaPerTurn: 1, producesColors: "C" },
  "Talisman of Dominance": { manaPerTurn: 1, producesColors: "UB" },
  "Talisman of Hierarchy": { manaPerTurn: 1, producesColors: "WB" },
  "Talisman of Indulgence": { manaPerTurn: 1, producesColors: "BR" },
  "Talisman of Resilience": { manaPerTurn: 1, producesColors: "BG" },
  "Talisman of Unity": { manaPerTurn: 1, producesColors: "WG" },
  "Coldsteel Heart": { manaPerTurn: 1, producesColors: "C" },
  "Commander's Sphere": { manaPerTurn: 1, producesColors: "C" },
  "Chromatic Lantern": { manaPerTurn: 1, producesColors: "WUBRG" },
  "Smothering Tithe": { manaPerTurn: 1, drawsCards: 0, producesColors: "C" }, // treasure income approx

  // Land ramp (one-shot cast, +N lands).
  Cultivate: { rampsLands: 1, drawsCards: 1 },
  "Three Visits": { rampsLands: 1 },
  "Nature's Lore": { rampsLands: 1 },
  Farseek: { rampsLands: 1 },
  "Rampant Growth": { rampsLands: 1 },
  "Kodama's Reach": { rampsLands: 1, drawsCards: 1 },
  "Skyshroud Claim": { rampsLands: 2 },
  "Explosive Vegetation": { rampsLands: 2 },

  // Card draw.
  Divination: { drawsCards: 2 },
  "Sign in Blood": { drawsCards: 2 },
  "Night's Whisper": { drawsCards: 2 },
  "Read the Bones": { drawsCards: 2 },
  "Wheel of Fortune": { drawsCards: 7 },
  "Windfall": { drawsCards: 5 },
  "Rhystic Study": { drawsCards: 1, manaPerTurn: 0 }, // 1 per turn baseline; not literal
  "Mystic Remora": { drawsCards: 1 },

  // Removal.
  "Swords to Plowshares": { killsCreatures: 1 },
  "Path to Exile": { killsCreatures: 1 },
  "Beast Within": { killsCreatures: 1 },
  "Generous Gift": { killsCreatures: 1 },
  "Doom Blade": { killsCreatures: 1 },
  "Lightning Bolt": { killsCreatures: 1 },
  "Cyclonic Rift": { killsCreatures: 99 }, // overload assumed at midgame

  // Wipes.
  "Wrath of God": { killsCreatures: 99 },
  "Damnation": { killsCreatures: 99 },
  "Toxic Deluge": { killsCreatures: 99 },
  "Blasphemous Act": { killsCreatures: 99 },
  "Farewell": { killsCreatures: 99 },
  "Supreme Verdict": { killsCreatures: 99 },

  // Counters.
  "Counterspell": { isCounter: true },
  "Mana Drain": { isCounter: true },
  "Force of Will": { isCounter: true, prerequisites: { discardCards: 1 } },
  "Fierce Guardianship": { isCounter: true },
  "Pact of Negation": { isCounter: true }, // delayed cost; we don't punish in-game
  "Swan Song": { isCounter: true },

  // Alt-wins.
  "Thassa's Oracle": { isAltWincon: true },
  "Laboratory Maniac": { isAltWincon: true },
  "Jace, Wielder of Mysteries": { isAltWincon: true },
  "Approach of the Second Sun": { isAltWincon: true },
  "Coalition Victory": { isAltWincon: true },

  // Cast prerequisites — additional costs.
  "Culling the Weak": { prerequisites: { sacCreatures: 1 } },
  "Diabolic Intent": { prerequisites: { sacCreatures: 1 } },
  "Plumb the Forbidden": { prerequisites: { sacCreatures: 1 } },
  "Phyrexian Tower": { prerequisites: { sacCreatures: 1 } }, // activation, but treated as cast for sim purposes
  "Snuff Out": { prerequisites: { payLife: 4 } }, // alt cost: pay 4 life instead of {3}{B}
  "Daze": { prerequisites: { } }, // alt cost: return Island; we don't model alt costs, leave empty
  "Force of Negation": { isCounter: true, prerequisites: { discardCards: 1 } },

  // Death-trigger drains (Aristocrats core).
  "Zulaport Cutthroat": { triggers: { onAnyCreatureDiesDrain: 1 } },
  "Blood Artist": { triggers: { onAnyCreatureDiesDrain: 1 } },
  "Bastion of Remembrance": { triggers: { onAnyCreatureDiesDrain: 1 } },
  "Cruel Celebrant": { triggers: { onAnyCreatureDiesDrain: 1 } },
  "Falkenrath Noble": { triggers: { onAnyCreatureDiesDrain: 1 } },
  "Yawgmoth, Thran Physician": {
    triggers: { onAnyCreatureDiesDrain: 1, onYourCreatureDiesDraw: 1 },
  },

  // Sac outlets (free mana / draw activations).
  "Phyrexian Altar": { triggers: { sacForMana: 1 } },
  "Ashnod's Altar": { triggers: { sacForMana: 2 } },
  "Viscera Seer": { triggers: { sacForDraw: 1 } }, // scry approximated as draw
  "Carrion Feeder": { triggers: {} },
  "Bloodthrone Vampire": { triggers: {} },

  // ETB value creatures.
  "Eternal Witness": { triggers: { onEtbDraw: 1 } }, // grave→hand approx
  "Reclamation Sage": { triggers: { onEtbKills: 1 } },
  "Mulldrifter": { triggers: { onEtbDraw: 2 } },
  "Solemn Simulacrum": { triggers: { onEtbRamps: 1 } },
  "Wood Elves": { triggers: { onEtbRamps: 1 } },
  "Farhaven Elf": { triggers: { onEtbRamps: 1 } },
  "Sakura-Tribe Elder": { triggers: { onEtbRamps: 1 } },

  // Cast prerequisites — graveyard requirements.
  Reanimate: { prerequisites: { anyGraveCreatures: 1 } },
  "Animate Dead": { prerequisites: { anyGraveCreatures: 1 } },
  Necromancy: { prerequisites: { anyGraveCreatures: 1 } },
  "Dance of the Dead": { prerequisites: { anyGraveCreatures: 1 } },
  Victimize: { prerequisites: { ownGraveCreatures: 1, sacCreatures: 1 } },
  "Living Death": { prerequisites: { } }, // symmetric mass return; allow always
  "Unburial Rites": { prerequisites: { anyGraveCreatures: 1 } },
};

const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;

/**
 * Extract the colored mana symbols from a Scryfall mana cost string and
 * return them WUBRG-sorted. Hybrid pips count toward both colors (we
 * don't track them separately for sim purposes — close enough).
 */
function manaCostColors(manaCost: string | null): string {
  if (!manaCost) return "";
  const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
  const colors = new Set<string>();
  for (const sym of symbols) {
    const inner = sym.slice(1, -1).toUpperCase();
    for (const ch of inner.split("/")) {
      if (/^[WUBRG]$/.test(ch)) colors.add(ch);
    }
  }
  return COLOR_ORDER.filter((c) => colors.has(c)).join("");
}

function isLandTypeLine(typeLine: string): boolean {
  return /\bLand\b/.test(typeLine);
}

function isCreatureTypeLine(typeLine: string): boolean {
  return /\bCreature\b/.test(typeLine);
}

function isPermanentTypeLine(typeLine: string): boolean {
  return /\b(Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/.test(typeLine);
}

const BASIC_LAND_COLORS: Record<string, string> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
  Wastes: "C",
};

/**
 * Determine what colors a land produces. Heuristic — reads the basic
 * land type line first, then falls back to oracle text "Add {.}"
 * patterns. Cards we don't recognize default to "C" (colorless) so
 * they at least produce *some* mana.
 */
function detectLandColors(typeLine: string, oracleText: string): string {
  const colors = new Set<string>();

  // Basic land subtypes give one color each.
  for (const [name, color] of Object.entries(BASIC_LAND_COLORS)) {
    if (typeLine.includes(name)) colors.add(color);
  }

  // Oracle text "Add {W}" / "Add {U}" / "Add one mana of any color".
  const addMatches = oracleText.matchAll(/\bAdd \{([^}]+)\}/gi);
  for (const m of addMatches) {
    const inner = m[1]?.toUpperCase() ?? "";
    for (const ch of inner.split("/")) {
      if (/^[WUBRG]$/.test(ch)) colors.add(ch);
      if (ch === "C") colors.add("C");
    }
  }
  if (/Add (one|any|two) mana of any color/i.test(oracleText)) {
    colors.add("W");
    colors.add("U");
    colors.add("B");
    colors.add("R");
    colors.add("G");
  }

  if (colors.size === 0) return "C";
  // Strip "C" if any colored mana is present (a Forest doesn't also tap for C in our model).
  if (colors.size > 1) colors.delete("C");
  // WUBRG-sorted.
  const order = ["W", "U", "B", "R", "G", "C"];
  return order.filter((c) => colors.has(c)).join("");
}

/**
 * Detect TriggerProfile fields from oracle text. Conservative — only
 * the canonical patterns. NAMED overrides win for finer control.
 */
function detectTriggers(oracleText: string): TriggerProfile {
  const out: TriggerProfile = {};
  if (!oracleText) return out;

  if (/Whenever (a|another) creature dies[^.]*opponent[^.]*loses (\d+|one) life/i.test(oracleText)) {
    out.onAnyCreatureDiesDrain = 1;
  }
  if (/Whenever a creature dies[^.]*you gain (\d+|one) life/i.test(oracleText)) {
    // gain-life-only triggers (Ayli style) — model as 0 drain since it
    // only helps the controller, not pressuring opponents.
  }
  if (/Whenever another creature you control dies[^.]*draw a card/i.test(oracleText)) {
    out.onYourCreatureDiesDraw = 1;
  }

  if (/When [^.]*enters[^.]*battlefield[^.]*draw (\d+|a|two|three) cards?/i.test(oracleText)) {
    const m = /draw (\d+|a|two|three) cards?/i.exec(oracleText);
    const word = m?.[1]?.toLowerCase() ?? "a";
    out.onEtbDraw = word === "two" ? 2 : word === "three" ? 3 : Number.parseInt(word, 10) || 1;
  }
  if (/When [^.]*enters[^.]*battlefield[^.]*destroy target/i.test(oracleText)) {
    out.onEtbKills = 1;
  }
  if (/When [^.]*enters[^.]*battlefield[^.]*search your library for [^.]*basic land/i.test(oracleText)) {
    out.onEtbRamps = 1;
  }

  if (/Sacrifice (a|another) creature: ?Add \{[^}]+\}/i.test(oracleText)) {
    out.sacForMana = 1;
  }
  if (/Sacrifice (a|another) creature: ?Scry/i.test(oracleText)) {
    out.sacForDraw = 1;
  }

  return out;
}

interface CategoryDefaults {
  manaPerTurn?: number;
  rampsLands?: number;
  drawsCards?: number;
  killsCreatures?: number;
  isCounter?: boolean;
}

/**
 * Detect cast prerequisites from oracle text. Conservative — only fires
 * when the wording is unambiguous. Hand-curated overrides in NAMED take
 * precedence over anything detected here.
 */
function detectPrerequisites(oracleText: string): Partial<CastPrerequisites> {
  const out: Partial<CastPrerequisites> = {};
  if (!oracleText) return out;

  // Additional sac costs.
  // "As an additional cost to cast this spell, sacrifice a creature."
  const sacCreatureMatch = /As an additional cost[^.]*sacrifice (?:(a|an|two|three|four)\s+)?(?:other\s+)?creature/i.exec(
    oracleText,
  );
  if (sacCreatureMatch) {
    const word = sacCreatureMatch[1]?.toLowerCase() ?? "a";
    out.sacCreatures =
      word === "two"
        ? 2
        : word === "three"
          ? 3
          : word === "four"
            ? 4
            : 1;
  }

  if (/As an additional cost[^.]*sacrifice (?:a|an|two|three) lands?/i.test(oracleText)) {
    out.sacLands = /sacrifice (two|three)/i.test(oracleText) ? 2 : 1;
  }

  if (/As an additional cost[^.]*discard (?:a|an|two) cards?/i.test(oracleText)) {
    out.discardCards = /discard (two)/i.test(oracleText) ? 2 : 1;
  }

  const payLifeMatch = /As an additional cost[^.]*pay (\d+) life/i.exec(oracleText);
  if (payLifeMatch && payLifeMatch[1]) {
    const n = Number.parseInt(payLifeMatch[1], 10);
    if (Number.isFinite(n)) out.payLife = n;
  }

  // Graveyard requirements (Tier 2).
  // "Return target creature card from your graveyard"
  if (/Return target [^.]*creature card[^.]*from your graveyard/i.test(oracleText)) {
    out.ownGraveCreatures = 1;
  }
  // "...from a graveyard..." (any player's)
  if (/Return target [^.]*creature card[^.]*from a graveyard/i.test(oracleText)) {
    out.anyGraveCreatures = 1;
  }
  // Reanimate-style: "Put target creature card from a graveyard onto the battlefield"
  if (/Put target [^.]*creature card[^.]*from a graveyard onto the battlefield/i.test(oracleText)) {
    out.anyGraveCreatures = 1;
  }

  return out;
}

function defaultsFromCategory(
  cmc: number,
  cats: readonly CardCategory[],
  isCreature: boolean,
): CategoryDefaults {
  const out: CategoryDefaults = {};
  if (cats.includes("ramp")) {
    if (isCreature) {
      // Mana dork — 1 per turn from CMC 1–2; bigger dorks rare.
      out.manaPerTurn = 1;
    } else if (cmc <= 2) {
      // Likely a mana rock — 1 per turn, Sol Ring covered by override.
      out.manaPerTurn = 1;
    } else {
      // Likely land ramp.
      out.rampsLands = 1;
    }
  }
  if (cats.includes("draw")) {
    // Average one-shot draw spell pulls 2; repeatable engines are
    // typically over-counted by this — overrides correct it.
    out.drawsCards = 2;
  }
  if (cats.includes("removal")) out.killsCreatures = 1;
  if (cats.includes("wipe")) out.killsCreatures = 99;
  if (cats.includes("counterspell")) out.isCounter = true;
  return out;
}

export function buildProfile(input: ProfileInput): CardProfile {
  const isLand = isLandTypeLine(input.typeLine);
  const isCreature = isCreatureTypeLine(input.typeLine);
  const isPermanent = isPermanentTypeLine(input.typeLine);

  const cats = input.categories;
  const named = NAMED[input.name];
  const defaults = defaultsFromCategory(input.cmc, cats, isCreature);

  // Lands produce mana per turn implicitly via the engine's untap; we
  // don't tag them with manaPerTurn here.
  const manaPerTurn = isLand
    ? 0
    : (named?.manaPerTurn ?? defaults.manaPerTurn ?? 0);
  const rampsLands = named?.rampsLands ?? defaults.rampsLands ?? 0;
  const drawsCards = named?.drawsCards ?? defaults.drawsCards ?? 0;
  const killsCreatures =
    named?.killsCreatures ?? defaults.killsCreatures ?? 0;
  const isCounter = named?.isCounter ?? defaults.isCounter ?? false;
  const isAltWincon = named?.isAltWincon ?? cats.includes("wincon");

  // Prereqs: detected from text, then named override patches selectively.
  const detectedPrereqs = detectPrerequisites(input.oracleText);
  const namedPrereqs = named?.prerequisites ?? {};
  const prerequisites: CastPrerequisites = {
    ...NO_PREREQUISITES,
    ...detectedPrereqs,
    ...namedPrereqs,
  };

  // Triggers: regex detection + named overrides.
  const detectedTriggers = detectTriggers(input.oracleText);
  const triggers: TriggerProfile = {
    ...detectedTriggers,
    ...(named?.triggers ?? {}),
  };

  // Color production: lands derive from type+text; rocks/dorks come
  // from named override or default colorless.
  let producesColors = "";
  if (isLand) {
    producesColors = detectLandColors(input.typeLine, input.oracleText);
  } else if (manaPerTurn > 0) {
    producesColors = named?.producesColors ?? "C";
  }

  void NO_TRIGGERS; // silence unused-import for fallback path
  return {
    oracleId: input.oracleId,
    name: input.name,
    cmc: input.cmc,
    manaCostColors: manaCostColors(input.manaCost),
    categories: cats,
    isLand,
    isCreature,
    isPermanent,
    isCommander: input.isCommander,
    power: input.power,
    toughness: input.toughness,
    producesColors,
    manaPerTurn,
    rampsLands,
    drawsCards,
    killsCreatures,
    isAltWincon,
    isCounter,
    prerequisites,
    triggers,
  };
}

/** Build a flat profile list expanding by quantity. */
export function expandProfiles(
  inputs: ReadonlyArray<{ profile: CardProfile; quantity: number }>,
): CardProfile[] {
  const out: CardProfile[] = [];
  for (const { profile, quantity } of inputs) {
    for (let i = 0; i < quantity; i += 1) {
      // Each card is its own object (the engine mutates them).
      out.push({ ...profile });
    }
  }
  return out;
}

