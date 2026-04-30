// Loader for the Commander banned list. Reads `config/banned-list.json`.
//
// This is intentionally a tiny module so the validator can swap in a
// custom list during tests via the `bannedNames` option.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface BannedListFile {
  _meta?: unknown;
  banned: string[];
}

let cache: ReadonlySet<string> | null = null;
let cachePath: string | null = null;

/**
 * Loads (and memoizes) the banned-list set keyed by canonical card name.
 * Pass an explicit `path` in tests to skip the cache.
 */
export async function loadBannedList(path?: string): Promise<ReadonlySet<string>> {
  const target = path ?? join(process.cwd(), "config", "banned-list.json");
  if (cache && cachePath === target) return cache;

  const raw = await readFile(target, "utf8");
  const parsed = JSON.parse(raw) as BannedListFile;
  if (!Array.isArray(parsed.banned)) {
    throw new Error(`banned-list.json missing "banned" array (path=${target})`);
  }

  const set = new Set(parsed.banned);
  cache = set;
  cachePath = target;
  return set;
}

/** Test-only: clear the in-memory cache so a fresh path is re-read. */
export function clearBannedListCache(): void {
  cache = null;
  cachePath = null;
}
