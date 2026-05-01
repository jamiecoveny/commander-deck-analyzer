// EDHrec commander-page fetcher.
//
// Their JSON endpoints are unofficial but stable — the brief notes this
// and we degrade gracefully on schema drift. Cached 24h per slug.

import { commanderSlug, edhrecCommanderUrl } from "./slug";
import {
  EdhrecResponseSchema,
  type EdhrecData,
  type EdhrecResponse,
  type EdhrecTopCard,
} from "./types";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_USER_AGENT =
  "commander-deck-analyzer/0.1 (+https://github.com/local; contact: dev@example.com)";

const cache = new Map<string, { data: EdhrecData | null; expiresAt: number }>();

export function clearEdhrecCache(): void {
  cache.clear();
}

export interface FetchEdhrecOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  ttlMs?: number;
  /** Bypass the cache. */
  force?: boolean;
}

/**
 * Pull the commander page and project to our `EdhrecData` domain shape.
 * Returns `null` on 404 (commander not on EDHrec), schema drift, or
 * transport failure — callers degrade to no-comparison.
 */
export async function fetchEdhrecCommander(
  commanderName: string,
  opts: FetchEdhrecOptions = {},
): Promise<EdhrecData | null> {
  const slug = commanderSlug(commanderName);
  if (!slug) return null;

  if (!opts.force) {
    const cached = cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const userAgent =
    opts.userAgent ?? process.env.HTTP_USER_AGENT ?? DEFAULT_USER_AGENT;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;

  const url = edhrecCommanderUrl(commanderName);
  let raw: unknown;
  try {
    const r = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });
    if (r.status === 404) {
      cache.set(slug, { data: null, expiresAt: Date.now() + ttlMs });
      return null;
    }
    if (!r.ok) {
      throw new Error(`edhrec ${r.status} ${r.statusText}`);
    }
    raw = await r.json();
  } catch {
    return null;
  }

  const parsed = EdhrecResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const data = projectEdhrec(parsed.data);
  cache.set(slug, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

function projectEdhrec(r: EdhrecResponse): EdhrecData {
  const topCards = collectTopCards(r);
  return {
    numDecks: Math.round(r.num_decks_avg ?? 0),
    averageTypeCounts: {
      creature: r.creature ?? 0,
      instant: r.instant ?? 0,
      sorcery: r.sorcery ?? 0,
      artifact: r.artifact ?? 0,
      enchantment: r.enchantment ?? 0,
      planeswalker: r.planeswalker ?? 0,
      land: r.land ?? 0,
      basic: r.basic ?? 0,
      nonbasic: r.nonbasic ?? 0,
    },
    topCards,
    similarCommanders: r.similar ?? [],
  };
}

/** Sections we surface in recommendations. We exclude `newcards`
 *  (release noise) and section-internal duplicates by deduping on name. */
const RELEVANT_TAGS = new Set([
  "topcards",
  "highsynergycards",
  "manaartifacts",
  "utilityartifacts",
  "creatures",
  "instants",
  "sorceries",
  "enchantments",
  "planeswalkers",
  "utilitylands",
]);

function collectTopCards(r: EdhrecResponse): EdhrecTopCard[] {
  const seen = new Map<string, EdhrecTopCard>();
  for (const list of r.container.json_dict.cardlists) {
    if (!RELEVANT_TAGS.has(list.tag)) continue;
    for (const cv of list.cardviews) {
      const inclusion = cv.inclusion ?? cv.num_decks ?? 0;
      const potential = cv.potential_decks ?? 0;
      if (potential <= 0) continue;
      const pct = inclusion / potential;
      if (pct <= 0) continue;
      const existing = seen.get(cv.name);
      if (!existing || existing.inclusionPct < pct) {
        seen.set(cv.name, {
          name: cv.name,
          inclusionPct: pct,
          numDecks: inclusion,
          potentialDecks: potential,
          synergy: cv.synergy ?? 0,
          section: list.header || list.tag,
        });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.inclusionPct - a.inclusionPct);
}
