// Commander Spellbook find-my-combos client.
//
// POST https://backend.commanderspellbook.com/find-my-combos/
//
// Body:
//   {
//     "main":       [{"card": "Sol Ring"}, ...],
//     "commanders": [{"card": "Atraxa, Praetors' Voice"}]
//   }
//
// The response groups combos into four buckets (`included`,
// `includedByChangingCommanders`, `almostIncluded`,
// `almostIncludedByAddingColors`). We map those onto our `completeness`
// enum and project to the smaller `DetectedCombo` domain type so the
// rest of the app can't accidentally take a dependency on Spellbook's
// internal field names.
//
// Cache: per decklist hash with a 7-day TTL (matches the brief's spec).
// In-memory for Phase 1; Redis is the production target.

import { createHash } from "node:crypto";

import {
  SpellbookResponseSchema,
  type DetectedCombo,
  type SpellbookCombo,
} from "./types";

const ENDPOINT = "https://backend.commanderspellbook.com/find-my-combos/";

const DEFAULT_USER_AGENT =
  "commander-deck-analyzer/0.1 (+https://github.com/local; contact: dev@example.com)";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cache = new Map<string, { combos: DetectedCombo[]; expiresAt: number }>();

export function clearSpellbookCache(): void {
  cache.clear();
}

export interface FindCombosOptions {
  cardNames: readonly string[];
  commanderNames: readonly string[];
  fetchImpl?: typeof fetch;
  userAgent?: string;
  ttlMs?: number;
  /** Bypass the cache (test / debug). */
  force?: boolean;
}

function decklistHash(
  cardNames: readonly string[],
  commanderNames: readonly string[],
): string {
  const sorted = [...cardNames].sort();
  const sortedCmdr = [...commanderNames].sort();
  return createHash("sha1")
    .update(`m:${sorted.join("|")};c:${sortedCmdr.join("|")}`)
    .digest("hex");
}

function paraphraseRequires(combo: SpellbookCombo): string[] {
  const out: string[] = [];
  for (const r of combo.requires) {
    if (r.card) {
      out.push(r.card.name);
    } else if (r.template) {
      // Templates are descriptive: e.g. "Permanent that can be cast
      // using {C}". They're already short and user-facing.
      out.push(r.template.name);
    }
  }
  return out;
}

function project(
  combo: SpellbookCombo,
  completeness: DetectedCombo["completeness"],
): DetectedCombo {
  const cards = combo.uses
    .map((u) => u.card.name)
    .filter((n): n is string => typeof n === "string");
  const results = combo.produces
    .map((p) => p.feature.name)
    .filter((n): n is string => typeof n === "string");
  const notable = combo.notablePrerequisites?.trim() ?? "";

  return {
    spellbookId: combo.id,
    cards,
    missing: completeness === "in_deck" ? [] : paraphraseRequires(combo),
    results,
    notablePrerequisites: notable.length > 0 ? notable : null,
    popularity: combo.popularity ?? null,
    manaValueNeeded: combo.manaValueNeeded ?? null,
    bracket: combo.bracketTag ?? null,
    completeness,
  };
}

function dedupeAndSort(combos: DetectedCombo[]): DetectedCombo[] {
  const seen = new Map<string, DetectedCombo>();
  for (const c of combos) {
    if (!seen.has(c.spellbookId)) seen.set(c.spellbookId, c);
  }
  // Order: completeness bucket → popularity desc.
  const order: Record<DetectedCombo["completeness"], number> = {
    in_deck: 0,
    almost_in_deck: 1,
    needs_commander_change: 2,
    needs_color: 3,
  };
  return Array.from(seen.values()).sort((a, b) => {
    const co = order[a.completeness] - order[b.completeness];
    if (co !== 0) return co;
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
}

/**
 * Hit Spellbook's find-my-combos and return a deduped, sorted list of
 * combos relevant to the supplied deck. Throws on transport failures —
 * the caller decides whether to swallow (we should keep the analytics
 * usable even if Spellbook is down).
 */
export async function findCombos(
  opts: FindCombosOptions,
): Promise<DetectedCombo[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const userAgent =
    opts.userAgent ?? process.env.HTTP_USER_AGENT ?? DEFAULT_USER_AGENT;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;

  const key = decklistHash(opts.cardNames, opts.commanderNames);
  if (!opts.force) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.combos;
    }
  }

  const r = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      main: opts.cardNames.map((card) => ({ card })),
      commanders: opts.commanderNames.map((card) => ({ card })),
    }),
  });
  if (!r.ok) {
    throw new Error(`spellbook find-my-combos failed: ${r.status} ${r.statusText}`);
  }
  const json: unknown = await r.json();

  const parsed = SpellbookResponseSchema.safeParse(json);
  if (!parsed.success) {
    // Don't blow up on schema drift; surface zero combos.
    return [];
  }

  const { results } = parsed.data;
  const combos: DetectedCombo[] = [
    ...results.included.map((c) => project(c, "in_deck")),
    ...results.includedByChangingCommanders.map((c) =>
      project(c, "needs_commander_change"),
    ),
    ...results.almostIncluded.map((c) => project(c, "almost_in_deck")),
    ...results.almostIncludedByAddingColors.map((c) =>
      project(c, "needs_color"),
    ),
  ];
  const deduped = dedupeAndSort(combos);

  cache.set(key, { combos: deduped, expiresAt: Date.now() + ttlMs });
  return deduped;
}

export function spellbookComboUrl(spellbookId: string): string {
  return `https://commanderspellbook.com/combo/${encodeURIComponent(spellbookId)}/`;
}
