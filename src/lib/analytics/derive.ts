// Pure analytics derivations. No I/O — every input is a primitive or a
// plain object. Tests exercise these directly with hand-crafted card rows.

import type { CardCategory } from "@/lib/db/card";

import type {
  AnalysisResult,
  AnalyzedCard,
  CategoryBreakdown,
  ColorPips,
  ManaCurve,
} from "./types";

const NON_LAND_CATEGORIES = [
  "ramp",
  "draw",
  "removal",
  "wipe",
  "counterspell",
  "tutor",
  "recursion",
  "wincon",
  "stax",
  "utility",
] as const;

const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
  "Snow-Covered Wastes",
]);

export interface DeriveInput {
  commander: string;
  commanders: string[];
  colorIdentity: string;
  cards: ReadonlyArray<{
    name: string;
    oracleId: string;
    quantity: number;
    isCommander: boolean;
    cmc: number;
    typeLine: string;
    manaCost: string | null;
    categories: readonly CardCategory[];
  }>;
}

function emptyCurve(): ManaCurve {
  return {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7+": 0,
  };
}

function emptyPips(): ColorPips {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function emptyCategories(): CategoryBreakdown {
  return {
    ramp: 0,
    draw: 0,
    removal: 0,
    wipe: 0,
    counterspell: 0,
    tutor: 0,
    recursion: 0,
    wincon: 0,
    stax: 0,
    utility: 0,
  };
}

function isLandRow(typeLine: string): boolean {
  return /\bLand\b/.test(typeLine);
}

function curveBucket(cmc: number): keyof ManaCurve {
  if (cmc < 1) return "0";
  if (cmc < 2) return "1";
  if (cmc < 3) return "2";
  if (cmc < 4) return "3";
  if (cmc < 5) return "4";
  if (cmc < 6) return "5";
  if (cmc < 7) return "6";
  return "7+";
}

/**
 * Count mana symbols in a Scryfall-style mana cost string. Hybrid pips
 * (e.g. {W/U}) count toward both colors at half weight; we round in the
 * final report. {2/W} pays half-weight too. {X} and generic {N} don't
 * count toward color totals.
 */
function tallyPips(manaCost: string | null, into: ColorPips): void {
  if (!manaCost) return;
  // Each {symbol}.
  const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
  for (const sym of symbols) {
    const inner = sym.slice(1, -1).toUpperCase();
    if (/^[0-9]+$/.test(inner)) continue; // {2}
    if (inner === "X" || inner === "Y" || inner === "Z") continue;
    if (inner === "S") continue; // snow generic
    if (inner === "C") {
      into.C += 1;
      continue;
    }
    if (/^[WUBRG]$/.test(inner)) {
      into[inner as "W" | "U" | "B" | "R" | "G"] += 1;
      continue;
    }
    // Hybrid forms: W/U, 2/W, W/P (phyrexian).
    const halves = inner.split("/");
    let colorParts = 0;
    for (const h of halves) {
      if (/^[WUBRG]$/.test(h)) colorParts += 1;
    }
    if (colorParts === 0) continue;
    const weight = 1 / colorParts;
    for (const h of halves) {
      if (/^[WUBRG]$/.test(h)) {
        into[h as "W" | "U" | "B" | "R" | "G"] += weight;
      }
    }
  }
}

function roundPips(pips: ColorPips): ColorPips {
  return {
    W: Math.round(pips.W * 10) / 10,
    U: Math.round(pips.U * 10) / 10,
    B: Math.round(pips.B * 10) / 10,
    R: Math.round(pips.R * 10) / 10,
    G: Math.round(pips.G * 10) / 10,
    C: Math.round(pips.C * 10) / 10,
  };
}

export function derive(
  input: DeriveInput,
): Omit<
  AnalysisResult,
  | "archetype"
  | "gamePlan"
  | "combos"
  | "comboLookupFailed"
  | "edhrec"
  | "recommendations"
  | "bracketEstimate"
> {
  const cards: AnalyzedCard[] = [];
  const categoryCounts = emptyCategories();
  const manaCurve = emptyCurve();
  const pipCount = emptyPips();

  let totalCards = 0;
  let landCount = 0;
  let basicLandCount = 0;
  let nonbasicLandCount = 0;
  let nonlandCmcWeighted = 0;
  let nonlandCount = 0;

  for (const c of input.cards) {
    totalCards += c.quantity;
    const isLand = isLandRow(c.typeLine) || c.categories.includes("land");

    cards.push({
      name: c.name,
      oracleId: c.oracleId,
      quantity: c.quantity,
      cmc: c.cmc,
      isCommander: c.isCommander,
      isLand,
      categories: [...c.categories],
    });

    if (isLand) {
      landCount += c.quantity;
      if (BASIC_LAND_NAMES.has(c.name)) basicLandCount += c.quantity;
      else nonbasicLandCount += c.quantity;
      // Lands don't contribute to curve, pips, or category counts.
      continue;
    }

    // Curve excludes the commander itself — it's not a card you cast from
    // your hand on a typical turn (it sits in the command zone). Keeping
    // it in the deck list for completeness, but the curve histogram is
    // about your average draw.
    if (!c.isCommander) {
      const bucket = curveBucket(c.cmc);
      manaCurve[bucket] += c.quantity;
      nonlandCmcWeighted += c.cmc * c.quantity;
      nonlandCount += c.quantity;
    }

    tallyPips(c.manaCost, pipCount);

    for (const cat of c.categories) {
      if (cat === "land") continue;
      if (NON_LAND_CATEGORIES.includes(cat)) {
        categoryCounts[cat] += c.quantity;
      }
    }
  }

  const averageCmc = nonlandCount > 0
    ? Math.round((nonlandCmcWeighted / nonlandCount) * 100) / 100
    : 0;

  return {
    commander: input.commander,
    commanders: input.commanders,
    colorIdentity: input.colorIdentity,
    totalCards,
    landCount,
    basicLandCount,
    nonbasicLandCount,
    averageCmc,
    manaCurve,
    pipCount: roundPips(pipCount),
    categoryCounts,
    cards,
  };
}
