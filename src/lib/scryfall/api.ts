// Live Scryfall API client.
//
// The brief's preferred path is a local Card cache populated by
// `npm run scryfall:sync`. But step 5 needs the dashboard to actually
// run end-to-end without a DB, so this client is a fallback: it hits
// /cards/collection (POST, batch up to 75 names) and normalizes the
// response into the same CardLookupRow shape the validator expects.
//
// Caching: a process-wide in-memory Map keyed by canonical name with a
// configurable TTL (default 7 days, matching the brief's spec).
// In a real deployment this should be Redis — fine for Phase 1.

import { normalize } from "./normalize";
import { ScryfallCardSchema } from "./types";

import type { CardsByName } from "@/lib/decklist";
import type { CardLookupRow } from "@/lib/decklist/types";

const COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const BATCH_SIZE = 75; // Scryfall API limit per request.

const DEFAULT_USER_AGENT =
  "commander-deck-analyzer/0.1 (+https://github.com/local; contact: dev@example.com)";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Enriched lookup row — includes the analytics fields the validator
 *  doesn't need but the analytics derivations do (cmc, manaCost). */
export interface EnrichedLookupRow extends CardLookupRow {
  cmc: number;
  manaCost: string | null;
}

interface CachedRow {
  row: EnrichedLookupRow;
  expiresAt: number;
}

const cache = new Map<string, CachedRow>();

export function clearScryfallApiCache(): void {
  cache.clear();
}

interface CollectionResponse {
  object?: string;
  data: unknown[];
  not_found?: Array<{ name?: string }>;
}

function toEnrichedRow(raw: unknown): EnrichedLookupRow | null {
  const parsed = ScryfallCardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const n = normalize(parsed.data);
  if (!n) return null;
  return {
    name: n.name,
    oracleId: n.oracleId,
    typeLine: n.typeLine,
    oracleText: n.oracleText,
    colorIdentity: n.colorIdentity,
    cmc: n.cmc,
    manaCost: n.manaCost,
  };
}

/**
 * Pace requests so we stay polite (Scryfall asks for 50–100ms between
 * calls). A simple sleep between iterations is enough for a deck-sized
 * batch (1–2 calls).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScryfallApiOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** Cache TTL in ms. Default 7 days. */
  ttlMs?: number;
  /** Delay between consecutive POSTs in ms. Default 100ms. */
  paceMs?: number;
}

/**
 * Returns enriched rows (includes cmc and manaCost) so the analytics
 * layer can derive curve and pip stats without a second fetch. The
 * validator-shape adapter is built on top of this; see
 * `lookupCardsViaScryfall` below.
 *
 * Caches every found row under the user-typed name with a 7-day TTL.
 * Cards missing from the Scryfall response surface in `missing` —
 * misspelled pastes won't silently fuzzy-match.
 */
export async function lookupEnrichedCardsViaScryfall(
  names: readonly string[],
  opts: ScryfallApiOptions = {},
): Promise<{
  found: Map<string, EnrichedLookupRow>;
  missing: string[];
}> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const userAgent =
    opts.userAgent ?? process.env.HTTP_USER_AGENT ?? DEFAULT_USER_AGENT;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const paceMs = opts.paceMs ?? 100;

  const found = new Map<string, EnrichedLookupRow>();
  const missing: string[] = [];
  const now = Date.now();

  // Cache pre-pass.
  const toQuery: string[] = [];
  for (const name of names) {
    const cached = cache.get(name);
    if (cached && cached.expiresAt > now) {
      found.set(name, cached.row);
      continue;
    }
    toQuery.push(name);
  }

  if (toQuery.length === 0) {
    return { found, missing };
  }

  for (let i = 0; i < toQuery.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(paceMs);
    const batch = toQuery.slice(i, i + BATCH_SIZE);
    const r = await fetchImpl(COLLECTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({
        identifiers: batch.map((name) => ({ name })),
      }),
    });
    if (!r.ok) {
      throw new Error(
        `scryfall /cards/collection failed: ${r.status} ${r.statusText}`,
      );
    }
    const body = (await r.json()) as CollectionResponse;

    for (const raw of body.data ?? []) {
      const row = toEnrichedRow(raw);
      if (!row) continue;
      const original = batch.find(
        (n) => n === row.name || row.name.startsWith(`${n} // `),
      );
      const indexAs = original ?? row.name;
      found.set(indexAs, row);
      cache.set(indexAs, { row, expiresAt: now + ttlMs });
    }

    for (const nf of body.not_found ?? []) {
      const name = nf.name;
      if (typeof name === "string" && !found.has(name)) {
        missing.push(name);
      }
    }
  }

  for (const n of toQuery) {
    if (!found.has(n) && !missing.includes(n)) missing.push(n);
  }

  return { found, missing };
}

/**
 * Validator-shape adapter. Returns the same Map values as the enriched
 * lookup but typed down to `CardLookupRow` so the validator can swap in
 * a Prisma-backed implementation later without changing the wire shape.
 */
export async function lookupCardsViaScryfall(
  names: readonly string[],
  opts: ScryfallApiOptions = {},
): Promise<CardsByName> {
  const enriched = await lookupEnrichedCardsViaScryfall(names, opts);
  const found = new Map<string, CardLookupRow>();
  for (const [k, v] of enriched.found) found.set(k, v);
  return { found, missing: enriched.missing };
}
