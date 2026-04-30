// Shared types for the rules-based classifier.

import type { CardCategory } from "@/lib/db/card";

export interface ClassifierInput {
  name: string;
  typeLine: string;
  oracleText: string;
}

/**
 * One per category. `patterns` are positive matches; if any match, the
 * category is tagged. `excludePatterns` block the tag — typically used to
 * stop a broader category from absorbing a more specific one.
 *
 * For most categories we run patterns directly. The interaction between
 * `ramp` and `tutor` (a card that only fetches basic lands is ramp, not
 * tutor) is handled by category ordering + post-processing in classify.ts
 * rather than by inflating exclude regexes.
 */
export interface CategoryRule {
  category: CardCategory;
  patterns: readonly RegExp[];
  excludePatterns?: readonly RegExp[];
}

export interface OverrideEntry {
  /** Replace the auto-classification entirely. */
  categories: readonly CardCategory[];
  /** Optional human note describing why the override exists. */
  note?: string;
}

export type OverrideMap = ReadonlyMap<string, OverrideEntry>;

export interface ClassifyOptions {
  overrides?: OverrideMap;
}
