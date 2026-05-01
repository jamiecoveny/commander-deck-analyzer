// Build a tiered recommendation list. Pure function over:
//   - validated deck cards (with names)
//   - validation errors that survived (Tier 1)
//   - EDHrec data (Tier 2/3 inclusion-based)
//   - Spellbook detected combos (Tier 2 completions)
//
// Caps each tier to keep the UI scannable. Top 8 per tier.

import type { DecklistError, ValidatedDeck } from "@/lib/decklist/types";
import type { EdhrecData } from "@/lib/edhrec";
import type { DetectedCombo } from "@/lib/spellbook";

import type { Recommendation } from "./types";

const TIER_CAP = 8;

const STRONG_THRESHOLD = 0.4; // ≥ 40% inclusion → Tier 2
const NICE_THRESHOLD = 0.2; // 20–40% inclusion → Tier 3

export interface BuildRecommendationsInput {
  deck: ValidatedDeck;
  /** Validation errors that survived an `ok: true` outcome — those get
   *  surfaced as Tier-1 recommendations rather than blocking the
   *  analysis. (E.g., singleton violations the user has but is still
   *  willing to see analytics for.) For the current pipeline this
   *  array is usually empty since validation blocks on errors. */
  validationErrors?: DecklistError[];
  edhrec: EdhrecData | null;
  combos: readonly DetectedCombo[];
}

export function buildRecommendations(
  input: BuildRecommendationsInput,
): Recommendation[] {
  const out: Recommendation[] = [];
  const ownedNames = new Set(input.deck.cards.map((c) => c.name));

  // ---- Tier 1: validation surfacing ----
  for (const err of input.validationErrors ?? []) {
    const rec = errorToRecommendation(err);
    if (rec) out.push(rec);
  }

  // ---- Tier 2: Spellbook combo completions (almost-in-deck) ----
  for (const combo of input.combos) {
    if (combo.completeness !== "almost_in_deck") continue;
    if (combo.missing.length === 0) continue;
    // We surface one rec per combo, listing the missing piece(s).
    // Templates ("Permanent that can be cast using {C}") get listed verbatim.
    const cardList = combo.cards.length > 0 ? combo.cards.join(" + ") : "this combo";
    const missingList = combo.missing.join(", ");
    out.push({
      tier: 2,
      title: `Add: ${missingList}`,
      reason: `Completes the ${cardList} line${combo.results.length > 0 ? ` → ${combo.results[0]}` : ""} (via Spellbook).`,
      source: "spellbook",
      addCard: combo.missing[0],
    });
  }

  // ---- Tier 2 + 3: EDHrec inclusion-% gaps ----
  if (input.edhrec) {
    for (const card of input.edhrec.topCards) {
      if (ownedNames.has(card.name)) continue;
      if (card.inclusionPct >= STRONG_THRESHOLD) {
        out.push({
          tier: 2,
          title: `Add: ${card.name}`,
          reason: `${(card.inclusionPct * 100).toFixed(0)}% of ${input.deck.commander} decks include it (${card.section}, via EDHrec).`,
          source: "edhrec",
          addCard: card.name,
          inclusionPct: card.inclusionPct,
        });
      } else if (card.inclusionPct >= NICE_THRESHOLD) {
        out.push({
          tier: 3,
          title: `Consider: ${card.name}`,
          reason: `${(card.inclusionPct * 100).toFixed(0)}% inclusion in ${card.section} (via EDHrec).`,
          source: "edhrec",
          addCard: card.name,
          inclusionPct: card.inclusionPct,
        });
      }
    }
  }

  return capPerTier(out);
}

function errorToRecommendation(err: DecklistError): Recommendation | null {
  switch (err.error) {
    case "color_identity_violation":
      return {
        tier: 1,
        title: `Cut: ${err.card}`,
        reason: `Color identity ${err.cardColors} not in commander identity ${err.commanderColors}.`,
        source: "validation",
        cutCard: err.card,
      };
    case "banned_card":
      return {
        tier: 1,
        title: `Cut: ${err.card}`,
        reason: "Banned in Commander.",
        source: "validation",
        cutCard: err.card,
      };
    case "singleton_violation":
      return {
        tier: 1,
        title: `Reduce to 1× ${err.card}`,
        reason: `Currently ${err.quantity} copies — Commander is singleton.`,
        source: "validation",
        cutCard: err.card,
      };
    case "wrong_total":
      return {
        tier: 1,
        title: `Adjust deck size`,
        reason: `Deck has ${err.actual} cards; must be ${err.expected}.`,
        source: "validation",
      };
    case "missing_commander":
      return {
        tier: 1,
        title: `Mark a commander`,
        reason: "No commander tagged. Use *CMDR* or // Commander.",
        source: "validation",
      };
    case "non_legendary_commander":
      return {
        tier: 1,
        title: `Replace commander: ${err.card}`,
        reason: "Card isn't commander-eligible.",
        source: "validation",
      };
    case "invalid_partner":
      return {
        tier: 1,
        title: `Fix partner pairing`,
        reason: err.reason,
        source: "validation",
      };
    default:
      return null;
  }
}

function capPerTier(recs: Recommendation[]): Recommendation[] {
  const buckets: Record<number, Recommendation[]> = { 1: [], 2: [], 3: [] };
  for (const r of recs) buckets[r.tier]?.push(r);
  // Tier 2 prioritization: spellbook completions first, then EDHrec by
  // inclusion %.
  buckets[2]?.sort((a, b) => {
    const score = (r: Recommendation): number => {
      if (r.source === "spellbook") return 1000;
      return (r.inclusionPct ?? 0) * 100;
    };
    return score(b) - score(a);
  });
  buckets[3]?.sort((a, b) => (b.inclusionPct ?? 0) - (a.inclusionPct ?? 0));
  return [
    ...(buckets[1] ?? []),
    ...(buckets[2] ?? []).slice(0, TIER_CAP),
    ...(buckets[3] ?? []).slice(0, TIER_CAP),
  ];
}
