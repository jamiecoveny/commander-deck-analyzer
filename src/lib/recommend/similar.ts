// Similar-deck cross-reference recommender.
//
// EDHrec's commander page returns a `similar` array of related commanders.
// We fetch the top 3 of those, look at THEIR top cards, and find cards
// that appear in multiple similar commanders' top lists but NOT in the
// user's deck. The "why" tells the user *which* similar commanders run
// the card and at what %, giving each rec independent justification.
//
// This is the "research similar decks" feature — it gives recommendations
// that wouldn't show up in the user's own commander's EDHrec page (cards
// outside that page's top section but popular in the broader cluster).

import { fetchEdhrecCommander, type EdhrecData } from "@/lib/edhrec";

import type { Recommendation } from "./types";

const TOP_SIMILAR_COMMANDERS = 3;
/** Card needs to appear in at least this many similar commanders' top
 *  lists to be considered a multi-source recommendation. */
const MIN_SIMILAR_HITS = 2;
/** Per-similar-commander inclusion threshold to count as "appearing". */
const PER_COMMANDER_INCLUSION_THRESHOLD = 0.3;

interface CrossRefEvidence {
  /** Commander name where this card appears in the top list. */
  commander: string;
  /** Inclusion percentage (0–1) for that commander. */
  inclusionPct: number;
  /** EDHrec section header (e.g. "Mana Artifacts"). */
  section: string;
}

interface CrossRefHit {
  cardName: string;
  evidence: CrossRefEvidence[];
}

export interface SimilarRecommendInput {
  ownedCardNames: ReadonlyArray<string>;
  commanderEdhrec: EdhrecData | null;
  /** Commanders already represented in the user's deck (don't recommend
   *  the user's own commander as an addition). */
  excludeNames: ReadonlySet<string>;
}

/**
 * Pull EDHrec data for the user's commander's `similar` peers (in
 * parallel), build a cross-reference index, and emit Tier-2/3
 * recommendations whose justifications cite multiple similar commanders.
 *
 * Degrades gracefully — any individual failure is swallowed.
 */
export async function similarDeckRecommendations(
  input: SimilarRecommendInput,
): Promise<Recommendation[]> {
  if (!input.commanderEdhrec) return [];
  const similar = input.commanderEdhrec.similarCommanders.slice(
    0,
    TOP_SIMILAR_COMMANDERS,
  );
  if (similar.length === 0) return [];

  // Parallel fetch.
  const settled = await Promise.allSettled(
    similar.map((name) => fetchEdhrecCommander(name)),
  );
  const peerData = settled
    .map((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        return { name: similar[i]!, data: r.value };
      }
      return null;
    })
    .filter((x): x is { name: string; data: EdhrecData } => x !== null);

  if (peerData.length === 0) return [];

  // Build cross-reference index: card name → list of evidence.
  const idx = new Map<string, CrossRefEvidence[]>();
  for (const peer of peerData) {
    for (const card of peer.data.topCards) {
      if (card.inclusionPct < PER_COMMANDER_INCLUSION_THRESHOLD) continue;
      // Don't recommend the user's own commander.
      if (input.excludeNames.has(card.name)) continue;
      const existing = idx.get(card.name);
      const evidence: CrossRefEvidence = {
        commander: peer.name,
        inclusionPct: card.inclusionPct,
        section: card.section,
      };
      if (existing) {
        existing.push(evidence);
      } else {
        idx.set(card.name, [evidence]);
      }
    }
  }

  const owned = new Set(input.ownedCardNames);
  const hits: CrossRefHit[] = [];
  for (const [cardName, evidence] of idx) {
    if (owned.has(cardName)) continue;
    if (evidence.length < MIN_SIMILAR_HITS) continue;
    hits.push({ cardName, evidence });
  }

  // Score = sum of inclusion% across similar commanders. More appearances
  // and higher inclusion → higher score.
  hits.sort((a, b) => {
    const aScore = a.evidence.reduce((s, e) => s + e.inclusionPct, 0);
    const bScore = b.evidence.reduce((s, e) => s + e.inclusionPct, 0);
    return bScore - aScore;
  });

  return hits.slice(0, 12).map((h) => buildRecommendation(h));
}

function buildRecommendation(hit: CrossRefHit): Recommendation {
  const sortedEv = [...hit.evidence].sort(
    (a, b) => b.inclusionPct - a.inclusionPct,
  );
  // Headline cite: highest-inclusion appearance.
  const headlineEv = sortedEv[0]!;
  const otherEv = sortedEv.slice(1);
  const peers = otherEv
    .slice(0, 2)
    .map((e) => `${e.commander} ${(e.inclusionPct * 100).toFixed(0)}%`)
    .join(", ");

  // Tier 2 if it appears in 2+ similar decks at >=40% somewhere; tier 3 otherwise.
  const tier: Recommendation["tier"] =
    headlineEv.inclusionPct >= 0.4 && hit.evidence.length >= 2 ? 2 : 3;

  return {
    tier,
    title: `Add: ${hit.cardName}`,
    addCard: hit.cardName,
    inclusionPct: headlineEv.inclusionPct,
    source: "edhrec",
    reason: peers
      ? `Featured in ${hit.evidence.length} similar commanders (${headlineEv.commander} ${(headlineEv.inclusionPct * 100).toFixed(0)}%, also ${peers}).`
      : `Featured in ${hit.evidence.length} similar commanders (${headlineEv.commander} ${(headlineEv.inclusionPct * 100).toFixed(0)}%).`,
  };
}
