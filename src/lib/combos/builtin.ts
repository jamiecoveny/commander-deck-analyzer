// Built-in commander combo detector — supplements Spellbook.
//
// Why we don't trust Spellbook alone:
//   - Their JSON sometimes returns no combos for decks with obvious
//     lines (e.g. Meren + Phyrexian Altar + Reassembling Skeleton).
//   - 3-card synergy combos are sometimes missed by their auto-detection.
//   - We want category-specific framing ("infinite mana", "death loop",
//     "wincon") in the recommendations layer.
//
// This module reads config/known-combos.json and returns matches in
// the same DetectedCombo shape Spellbook produces, so the rest of the
// pipeline doesn't care where a combo came from.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { DetectedCombo } from "@/lib/spellbook";

const KnownComboSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    pieces: z.array(z.string()),
    /** Optional companions — having one of these alongside `pieces`
     *  completes the combo. */
    almostPieces: z.array(z.string()).optional(),
    result: z.string(),
    category: z.string().optional(),
    commanderHints: z.array(z.string()).optional(),
    commanderRequired: z.string().optional(),
    synergyHint: z.string().optional(),
  })
  .passthrough();

type KnownCombo = z.infer<typeof KnownComboSchema>;

const FileSchema = z.object({
  _meta: z.unknown().optional(),
  combos: z.array(KnownComboSchema),
});

let cache: KnownCombo[] | null = null;

function loadKnownCombos(): KnownCombo[] {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "known-combos.json");
  const raw = readFileSync(path, "utf8");
  const parsed = FileSchema.parse(JSON.parse(raw));
  cache = parsed.combos;
  return cache;
}

export function clearKnownCombosCache(): void {
  cache = null;
}

export interface BuiltinDetectInput {
  deckCardNames: readonly string[];
  commanderNames: readonly string[];
}

/**
 * Match the user's deck against the known-combos database. Each match
 * comes back as a DetectedCombo with `spellbookId` prefixed `builtin:`
 * so the UI can label the source. completeness is `in_deck` when every
 * piece is present, `almost_in_deck` when one is missing.
 */
export function detectBuiltinCombos(
  input: BuiltinDetectInput,
): DetectedCombo[] {
  const combos = loadKnownCombos();
  const owned = new Set([...input.deckCardNames, ...input.commanderNames]);
  const cmdrSet = new Set(input.commanderNames);
  const out: DetectedCombo[] = [];

  for (const combo of combos) {
    // Commander gating.
    if (combo.commanderRequired && !cmdrSet.has(combo.commanderRequired)) {
      continue;
    }

    const requiredPresent = combo.pieces.filter((p) => owned.has(p));
    const requiredMissing = combo.pieces.filter((p) => !owned.has(p));

    if (requiredMissing.length === 0) {
      // All required pieces in deck. If `almostPieces` is set, we need
      // at least one of them too — without one, the combo isn't actually
      // assembled. With one, full match.
      if (combo.almostPieces && combo.almostPieces.length > 0) {
        const optionalsOwned = combo.almostPieces.filter((p) => owned.has(p));
        if (optionalsOwned.length > 0) {
          out.push({
            spellbookId: `builtin:${combo.id}`,
            cards: [...requiredPresent, ...optionalsOwned.slice(0, 1)],
            missing: [],
            results: [combo.result],
            notablePrerequisites: combo.synergyHint ?? null,
            popularity: null,
            manaValueNeeded: null,
            bracket: null,
            completeness: "in_deck",
          });
        } else {
          out.push({
            spellbookId: `builtin:${combo.id}`,
            cards: requiredPresent,
            missing: combo.almostPieces,
            results: [combo.result],
            notablePrerequisites: combo.synergyHint ?? null,
            popularity: null,
            manaValueNeeded: null,
            bracket: null,
            completeness: "almost_in_deck",
          });
        }
      } else {
        // Pure required match.
        out.push({
          spellbookId: `builtin:${combo.id}`,
          cards: requiredPresent,
          missing: [],
          results: [combo.result],
          notablePrerequisites: combo.synergyHint ?? null,
          popularity: null,
          manaValueNeeded: null,
          bracket: null,
          completeness: "in_deck",
        });
      }
    } else if (requiredMissing.length === 1 && requiredPresent.length >= 1) {
      // One required piece away from completion — surface as
      // almost_in_deck so the recommender knows what to suggest.
      out.push({
        spellbookId: `builtin:${combo.id}`,
        cards: requiredPresent,
        missing: requiredMissing,
        results: [combo.result],
        notablePrerequisites: combo.synergyHint ?? null,
        popularity: null,
        manaValueNeeded: null,
        bracket: null,
        completeness: "almost_in_deck",
      });
    }
  }

  return out;
}

/**
 * Merge Spellbook + built-in combos. Drop duplicates by spellbookId
 * (Spellbook IDs are numeric/dashed; built-in IDs are prefixed
 * `builtin:`, so no collision is possible). Keep `in_deck` results
 * before `almost_in_deck` per existing ordering.
 */
export function mergeCombos(
  fromSpellbook: readonly DetectedCombo[],
  fromBuiltin: readonly DetectedCombo[],
): DetectedCombo[] {
  const all = [...fromSpellbook, ...fromBuiltin];
  const seen = new Set<string>();
  const deduped: DetectedCombo[] = [];

  // De-dupe by primary cards so a Spellbook entry doesn't double up
  // with a built-in one for the same line. Stable hash on sorted
  // card names + bucket.
  for (const c of all) {
    const key = `${c.completeness}:${[...c.cards].sort().join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  const order: Record<DetectedCombo["completeness"], number> = {
    in_deck: 0,
    almost_in_deck: 1,
    needs_commander_change: 2,
    needs_color: 3,
  };
  return deduped.sort((a, b) => order[a.completeness] - order[b.completeness]);
}
