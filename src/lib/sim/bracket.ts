// Bracket profile loader. Phase B+C.
//
// We sync-load the JSON via Node's fs at first use so the engine and
// decisions modules can be pure functions. The JSON file is small
// (5 entries) so reading it once at process start is fine.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { BracketProfile } from "./types";

const BracketProfileSchema = z.object({
  bracket: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  name: z.string(),
  expectedEndTurn: z.number().int().positive(),
  winMix: z.object({
    combat: z.number(),
    combo: z.number(),
    stax: z.number(),
    other: z.number(),
  }),
  reactToWinconProb: z.number().min(0).max(1),
  reactToThreatProb: z.number().min(0).max(1),
  mulliganStrictness: z.number().positive(),
  maxTurns: z.number().int().positive(),
});

const FileSchema = z.object({
  _meta: z.unknown().optional(),
  profiles: z.array(BracketProfileSchema).length(5),
});

let cache: Map<number, BracketProfile> | null = null;

function loadProfiles(): Map<number, BracketProfile> {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "bracket-profiles.json");
  const raw = readFileSync(path, "utf8");
  const parsed = FileSchema.parse(JSON.parse(raw));
  cache = new Map(parsed.profiles.map((p) => [p.bracket, p]));
  return cache;
}

/** Look up a bracket profile. Defaults to bracket 3 for unknown / unset. */
export function getBracketProfile(
  bracket: number | undefined,
): BracketProfile {
  const profiles = loadProfiles();
  const b = bracket ?? 3;
  const found = profiles.get(b);
  if (found) return found;
  // Out-of-range → clamp to 3.
  return profiles.get(3)!;
}

export function clearBracketCache(): void {
  cache = null;
}
