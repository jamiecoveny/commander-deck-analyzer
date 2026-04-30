// Card lookup helpers. The decklist parser, validator, and classifier all
// flow through these so we have one place to memoize and one place that
// owns the canonical-name normalization rules.

import type { Card, PrismaClient } from "@prisma/client";

/**
 * Normalize a user-typed card name for lookup. We keep this conservative:
 *   - trim
 *   - collapse internal whitespace
 *   - title-case is NOT applied — Scryfall is case-sensitive on canonical
 *     form and we want misspellings/casing errors to surface, not silently
 *     map to something close.
 *
 * For DFCs, users sometimes type only the front-face name. The decklist
 * parser handles that fallback by also trying `<front> // <back>` matches
 * via getCardByFrontFaceName.
 */
export function normalizeUserName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export async function getCardByOracleId(
  prisma: PrismaClient,
  oracleId: string,
): Promise<Card | null> {
  return prisma.card.findUnique({ where: { oracleId } });
}

export async function getCardByName(
  prisma: PrismaClient,
  name: string,
): Promise<Card | null> {
  const canonical = normalizeUserName(name);
  return prisma.card.findUnique({ where: { name: canonical } });
}

/**
 * For double-faced/split layouts where Scryfall stores the canonical name
 * as "Front // Back", users typically only type the front face. Try the
 * exact match first, then fall back to a startsWith on "<name> // ".
 */
export async function getCardByFrontFaceName(
  prisma: PrismaClient,
  name: string,
): Promise<Card | null> {
  const direct = await getCardByName(prisma, name);
  if (direct) return direct;
  const canonical = normalizeUserName(name);
  return prisma.card.findFirst({
    where: { name: { startsWith: `${canonical} // ` } },
  });
}

/**
 * Batch lookup keyed by user-typed name. Missing names appear in the
 * `missing` array — callers (the parser/validator) surface them as user
 * errors rather than guessing.
 */
export async function getCardsByNames(
  prisma: PrismaClient,
  names: readonly string[],
): Promise<{ found: Map<string, Card>; missing: string[] }> {
  const canonical = Array.from(new Set(names.map(normalizeUserName)));
  const found = new Map<string, Card>();
  if (canonical.length === 0) return { found, missing: [] };

  const exact = await prisma.card.findMany({
    where: { name: { in: canonical } },
  });
  for (const c of exact) found.set(c.name, c);

  const missingExact = canonical.filter((n) => !found.has(n));
  if (missingExact.length === 0) {
    return { found, missing: [] };
  }

  // Fallback for front-face-only names. Cheaper to issue one query per
  // miss than to OR a startsWith for every missing name; in practice the
  // miss list is tiny (typos and DFC fronts).
  const stillMissing: string[] = [];
  for (const n of missingExact) {
    const card = await prisma.card.findFirst({
      where: { name: { startsWith: `${n} // ` } },
    });
    if (card) found.set(n, card);
    else stillMissing.push(n);
  }

  return { found, missing: stillMissing };
}
