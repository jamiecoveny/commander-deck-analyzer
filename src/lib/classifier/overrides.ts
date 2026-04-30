// Loader for the classifier overrides JSON.
//
// Mirrors banned.ts in structure: cached after first load, accepts a path
// override in tests, exposes a cache-clear for test isolation.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { CARD_CATEGORIES } from "@/lib/db/card";

import type { OverrideMap } from "./types";

const OverrideEntrySchema = z.object({
  categories: z.array(z.enum(CARD_CATEGORIES)).min(1),
  note: z.string().optional(),
});

const OverridesFileSchema = z.object({
  _meta: z.unknown().optional(),
  overrides: z.record(z.string(), OverrideEntrySchema),
});

let cache: OverrideMap | null = null;
let cachePath: string | null = null;

export async function loadClassifierOverrides(
  path?: string,
): Promise<OverrideMap> {
  const target =
    path ?? join(process.cwd(), "config", "classifier-overrides.json");
  if (cache && cachePath === target) return cache;

  const raw = await readFile(target, "utf8");
  const parsed = OverridesFileSchema.parse(JSON.parse(raw));

  const map = new Map<string, { categories: typeof parsed.overrides[string]["categories"]; note?: string }>();
  for (const [name, entry] of Object.entries(parsed.overrides)) {
    map.set(name, { categories: entry.categories, note: entry.note });
  }

  cache = map;
  cachePath = target;
  return map;
}

export function clearOverridesCache(): void {
  cache = null;
  cachePath = null;
}
