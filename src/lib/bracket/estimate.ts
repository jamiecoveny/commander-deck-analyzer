// Bracket estimator. Reads the user's deck against the WotC criteria:
//   - Number of Game Changers (config/game-changers.json)
//   - Fast mana count
//   - Tier-1 tutors
//   - Mass land destruction patterns
//   - Detected combos in deck (from Spellbook integration)
//
// Output: { bracket: 1..5, reasons: string[] }
//
// Bracket rules per WotC's bracket beta + community guidance:
//   - Bracket 5 (cEDH): explicitly cEDH archetype — we don't auto-tag this; user picks it.
//   - Bracket 4: any of: 4+ Game Changers, fast mana present, MLD present, in-deck combos detected.
//   - Bracket 3: 1-3 Game Changers, no MLD, no early combos, possibly late-game combos.
//   - Bracket 2: 0 Game Changers, no fast mana, no infinite combos.
//   - Bracket 1: extremely casual; we default here only if a deck looks intentionally jank.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DetectedCombo } from "@/lib/spellbook";

interface GameChangersFile {
  gameChangers: string[];
  fastMana: string[];
  tier1Tutors: string[];
  massLandDestructionPatterns: string[];
}

let cache: GameChangersFile | null = null;

async function loadGameChangers(): Promise<GameChangersFile> {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "game-changers.json");
  const raw = await readFile(path, "utf8");
  cache = JSON.parse(raw) as GameChangersFile;
  return cache;
}

export interface BracketEstimateInput {
  cards: ReadonlyArray<{
    name: string;
    typeLine: string;
    oracleText: string;
  }>;
  combos: readonly DetectedCombo[];
}

export interface BracketEstimateResult {
  bracket: 1 | 2 | 3 | 4;
  reasons: string[];
}

export async function estimateBracket(
  input: BracketEstimateInput,
): Promise<BracketEstimateResult> {
  const cfg = await loadGameChangers();

  const owned = new Set(input.cards.map((c) => c.name));
  const gameChangers = cfg.gameChangers.filter((n) => owned.has(n));
  const fastMana = cfg.fastMana.filter((n) => owned.has(n));
  const tier1Tutors = cfg.tier1Tutors.filter((n) => owned.has(n));

  const mldRegexes = cfg.massLandDestructionPatterns.map(
    (p) => new RegExp(p, "i"),
  );
  const mldCards: string[] = [];
  for (const card of input.cards) {
    for (const re of mldRegexes) {
      if (re.test(card.oracleText) || re.test(card.name)) {
        mldCards.push(card.name);
        break;
      }
    }
  }

  const inDeckCombos = input.combos.filter((c) => c.completeness === "in_deck");

  const reasons: string[] = [];

  // Bracket 4 indicators.
  let isBracket4 = false;
  if (gameChangers.length >= 4) {
    isBracket4 = true;
    reasons.push(`${gameChangers.length} Game Changers (≥4 puts deck in B4+)`);
  }
  if (fastMana.length > 0) {
    isBracket4 = true;
    reasons.push(`fast mana present: ${fastMana.join(", ")}`);
  }
  if (mldCards.length > 0) {
    isBracket4 = true;
    reasons.push(`mass land destruction: ${mldCards.slice(0, 2).join(", ")}`);
  }
  if (inDeckCombos.length > 0) {
    isBracket4 = true;
    reasons.push(
      `${inDeckCombos.length} complete combo${inDeckCombos.length === 1 ? "" : "s"} in deck (via Spellbook)`,
    );
  }

  if (isBracket4) {
    return { bracket: 4, reasons };
  }

  // Bracket 3 indicators.
  if (gameChangers.length >= 1 || tier1Tutors.length >= 2) {
    if (gameChangers.length >= 1) {
      reasons.push(
        `${gameChangers.length} Game Changer${gameChangers.length === 1 ? "" : "s"}: ${gameChangers.slice(0, 3).join(", ")}`,
      );
    }
    if (tier1Tutors.length >= 2) {
      reasons.push(`${tier1Tutors.length} tier-1 tutors`);
    }
    return { bracket: 3, reasons };
  }

  // Bracket 2 default — typical mid-power decks land here.
  reasons.push(
    "no Game Changers, no fast mana, no MLD, no detected complete combos — Core (Bracket 2)",
  );
  return { bracket: 2, reasons };
}

export function clearBracketEstimateCache(): void {
  cache = null;
}
