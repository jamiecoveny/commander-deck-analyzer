// Recommendation engine types.
//
// Tier 1 = must-fix (illegal cards, illegal counts).
// Tier 2 = strong upgrades (high-inclusion EDHrec cards you're not running,
//          Spellbook combo completions).
// Tier 3 = nice-to-have (moderate-inclusion EDHrec cards).
//
// `source` lets the UI cite where each recommendation came from
// ("via EDHrec", "via Spellbook", "via validation"). The brief requires
// these citations.

export type RecommendationTier = 1 | 2 | 3;

export type RecommendationSource = "validation" | "edhrec" | "spellbook";

export interface Recommendation {
  tier: RecommendationTier;
  /** Imperative phrase shown as the headline (e.g. "Cut: Lightning Bolt"). */
  title: string;
  /** Short justification — 1 sentence with the data source. */
  reason: string;
  source: RecommendationSource;
  /** Card to add (if applicable). */
  addCard?: string;
  /** Card to cut (if applicable — color identity violations, banned, swap). */
  cutCard?: string;
  /** Inclusion percentage from EDHrec (0–1). */
  inclusionPct?: number;
}
