// Helpers for assembling a fake `lookupCards` from a list of CardLookupRow
// fixtures. Mirrors the production `getCardsByNames` shape.

import type { CardsByName } from "../validate";
import type { CardLookupRow } from "../types";

export function makeFakeLookup(rows: readonly CardLookupRow[]) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  return async function lookupCards(
    names: readonly string[],
  ): Promise<CardsByName> {
    const found = new Map<string, CardLookupRow>();
    const missing: string[] = [];
    for (const name of names) {
      const row = byName.get(name);
      if (row) found.set(name, row);
      else missing.push(name);
    }
    return { found, missing };
  };
}
