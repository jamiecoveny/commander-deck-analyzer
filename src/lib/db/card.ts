// Typed accessor for Card.categoriesJson — keeps the SQLite-compatible
// JSON-string column behind a typed boundary. See prisma/schema.prisma
// for the rationale.

import { z } from "zod";

export const CARD_CATEGORIES = [
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
  "land",
] as const;

export type CardCategory = (typeof CARD_CATEGORIES)[number];

const CategoriesSchema = z.array(z.enum(CARD_CATEGORIES));

export function parseCategories(json: string): readonly CardCategory[] {
  try {
    const raw = JSON.parse(json) as unknown;
    return CategoriesSchema.parse(raw);
  } catch {
    return [];
  }
}

export function serializeCategories(
  categories: readonly CardCategory[],
): string {
  return JSON.stringify(categories);
}
