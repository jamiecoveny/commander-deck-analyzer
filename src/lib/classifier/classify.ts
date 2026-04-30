// Run the rule set against a card and return its category set.
//
// Order of operations:
//   1. Lands short-circuit to ["land"] (plus any extra tags from the rule
//      run, e.g. utility lands that draw cards).
//   2. Apply regex rules to collect candidate categories.
//   3. Adjudicate ramp-vs-tutor: if the only reason `tutor` matched was a
//      basic-land search and `ramp` already matched the same path, drop
//      `tutor`. (Ensures Cultivate is "ramp" only, not "ramp" + "tutor".)
//   4. If no categories matched, default to "utility".
//   5. Apply overrides last — they replace the result entirely.

import type { CardCategory } from "@/lib/db/card";

import { RULES } from "./rules";
import type { ClassifierInput, ClassifyOptions, OverrideMap } from "./types";

const BASIC_LAND_TUTOR =
  /\bSearch your library for (?:up to \w+ )?(?:a )?basic land/i;

function isLand(input: ClassifierInput): boolean {
  return /\bLand\b/.test(input.typeLine);
}

function runRules(input: ClassifierInput): Set<CardCategory> {
  const out = new Set<CardCategory>();
  for (const rule of RULES) {
    let matched = false;
    for (const re of rule.patterns) {
      if (re.test(input.oracleText)) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;
    if (rule.excludePatterns) {
      let blocked = false;
      for (const re of rule.excludePatterns) {
        if (re.test(input.oracleText)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
    }
    out.add(rule.category);
  }
  return out;
}

function adjudicateRampTutor(
  input: ClassifierInput,
  cats: Set<CardCategory>,
): void {
  // If the only `tutor` trigger was the basic-land path that also tagged
  // ramp, drop tutor. We detect that case by checking whether the
  // basic-land regex would match alone.
  if (cats.has("tutor") && cats.has("ramp")) {
    if (BASIC_LAND_TUTOR.test(input.oracleText)) {
      // Heuristic: if removing the basic-land sentence leaves no other
      // "Search your library for" clauses, the tutor tag is spurious.
      const stripped = input.oracleText.replace(BASIC_LAND_TUTOR, "");
      if (!/\bSearch your library for /i.test(stripped)) {
        cats.delete("tutor");
      }
    }
  }
}

export function classify(
  input: ClassifierInput,
  opts: ClassifyOptions = {},
): CardCategory[] {
  // Override short-circuit: name lookup wins over everything.
  if (opts.overrides) {
    const hit = opts.overrides.get(input.name);
    if (hit) return [...hit.categories];
  }

  if (isLand(input)) {
    const extra = runRules(input);
    // Don't tag a land as ramp on its mana ability — lands aren't ramp,
    // they're the base. Same for tutor on a fetchland-style search;
    // analytics keeps lands separate from those buckets.
    extra.delete("ramp");
    extra.delete("tutor");
    extra.add("land");
    return Array.from(extra);
  }

  const cats = runRules(input);
  adjudicateRampTutor(input, cats);

  if (cats.size === 0) return ["utility"];
  return Array.from(cats);
}

/**
 * Classify a batch keyed by card name. Useful when running over the whole
 * Card table — caller can then bulk-update categoriesJson.
 */
export function classifyAll(
  inputs: readonly ClassifierInput[],
  opts: ClassifyOptions = {},
): Map<string, CardCategory[]> {
  const out = new Map<string, CardCategory[]>();
  for (const input of inputs) {
    out.set(input.name, classify(input, opts));
  }
  return out;
}

export type { OverrideMap };
