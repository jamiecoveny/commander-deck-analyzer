// Public types for the analytics pipeline.
//
// AnalysisResult is the wire format the API route returns and the UI
// consumes. Keep it serializable (no Maps, no Dates) — JSON in, JSON out.

import type { CardCategory } from "@/lib/db/card";
import type { DetectedCombo } from "@/lib/spellbook";

/** CMC bucket -> count. 7+ collapses everything ≥ 7. */
export interface ManaCurve {
  "0": number;
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
  "6": number;
  "7+": number;
}

/** Mana symbol counts across the deck (excluding lands). */
export interface ColorPips {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

/** Counts per non-land category. `land` is tracked separately. */
export type CategoryBreakdown = Record<
  Exclude<CardCategory, "land">,
  number
>;

export interface AnalyzedCard {
  name: string;
  oracleId: string;
  quantity: number;
  cmc: number;
  isCommander: boolean;
  isLand: boolean;
  categories: CardCategory[];
}

export interface ArchetypeGuess {
  /** Display name, e.g. "Combo", "Voltron", "Big mana ramp". */
  archetype: string;
  /** Why we picked it — one short reason per matched signal. */
  reasons: string[];
}

export interface AnalysisResult {
  commander: string;
  commanders: string[];
  colorIdentity: string; // WUBRG-sorted

  totalCards: number;
  landCount: number;
  basicLandCount: number;
  nonbasicLandCount: number;

  /** Average CMC of non-land cards, weighted by quantity. */
  averageCmc: number;
  manaCurve: ManaCurve;
  pipCount: ColorPips;

  categoryCounts: CategoryBreakdown;
  /** Per-card breakdown for the UI deep-dive table. */
  cards: AnalyzedCard[];

  archetype: ArchetypeGuess;
  /** Plain-language summary of how the deck wins. 2–4 sentences. */
  gamePlan: string;
  /** Combos detected by Commander Spellbook. May be empty if Spellbook
   *  returned nothing or was unreachable; see `comboLookupFailed`. */
  combos: DetectedCombo[];
  /** True if the Spellbook lookup failed and we degraded gracefully.
   *  The UI can show an "unavailable" hint instead of "0 combos found". */
  comboLookupFailed: boolean;
}
