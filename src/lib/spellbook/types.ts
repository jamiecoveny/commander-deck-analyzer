// Wire types for Commander Spellbook's `find-my-combos` endpoint.
//
// The contract was probed live (POST returns 200 even with no body, and
// echoes back the structured `results.{included,almostIncluded,...}`
// shape). The schemas below are intentionally lenient — Spellbook's
// API has changed shape historically, and we'd rather degrade than 500.
// `.passthrough()` everywhere keeps unknown fields from breaking parsing.

import { z } from "zod";

const SpellbookCardSchema = z
  .object({
    id: z.number().optional(),
    name: z.string(),
    oracleId: z.string().optional(),
    typeLine: z.string().optional(),
  })
  .passthrough();

const SpellbookCardUseSchema = z
  .object({
    card: SpellbookCardSchema,
    quantity: z.number().optional(),
    zoneLocations: z.array(z.string()).optional(),
    mustBeCommander: z.boolean().optional(),
  })
  .passthrough();

const SpellbookFeatureSchema = z
  .object({
    id: z.number().optional(),
    name: z.string(),
    uncountable: z.boolean().optional(),
  })
  .passthrough();

const SpellbookProduceSchema = z
  .object({
    feature: SpellbookFeatureSchema,
    quantity: z.number().optional(),
  })
  .passthrough();

const SpellbookTemplateSchema = z
  .object({
    id: z.number().optional(),
    name: z.string(),
    scryfallQuery: z.string().optional(),
  })
  .passthrough();

const SpellbookRequireSchema = z
  .object({
    quantity: z.number().optional(),
    template: SpellbookTemplateSchema.optional(),
    card: SpellbookCardSchema.optional(),
    zoneLocations: z.array(z.string()).optional(),
  })
  .passthrough();

export const SpellbookComboSchema = z
  .object({
    id: z.string(),
    uses: z.array(SpellbookCardUseSchema).default([]),
    requires: z.array(SpellbookRequireSchema).default([]),
    produces: z.array(SpellbookProduceSchema).default([]),
    identity: z.string().optional(),
    popularity: z.number().optional(),
    bracketTag: z.string().optional(),
    manaValueNeeded: z.number().optional(),
    notablePrerequisites: z.string().optional().default(""),
    status: z.string().optional(),
  })
  .passthrough();

export type SpellbookCombo = z.infer<typeof SpellbookComboSchema>;

const SpellbookResultsSchema = z
  .object({
    identity: z.string().optional(),
    included: z.array(SpellbookComboSchema).default([]),
    includedByChangingCommanders: z.array(SpellbookComboSchema).default([]),
    almostIncluded: z.array(SpellbookComboSchema).default([]),
    almostIncludedByAddingColors: z.array(SpellbookComboSchema).default([]),
  })
  .passthrough();

export const SpellbookResponseSchema = z
  .object({
    results: SpellbookResultsSchema,
  })
  .passthrough();

export type SpellbookResponse = z.infer<typeof SpellbookResponseSchema>;

/** Domain shape we return to the rest of the app. Stripped of fields
 *  we don't use, so consumers can't accidentally couple to Spellbook
 *  internals. Also keeps the wire payload small. */
export interface DetectedCombo {
  spellbookId: string;
  /** Names of combo pieces. For `in_deck` / `partial`, every name in
   *  this list is already in the user's deck (apart from `missing`). */
  cards: string[];
  /** Names or template descriptions of cards still needed (partial). */
  missing: string[];
  /** Short paraphrased result labels, e.g. ["Infinite colorless mana"]. */
  results: string[];
  /** Optional notable prerequisites, paraphrased to a single string. */
  notablePrerequisites: string | null;
  popularity: number | null;
  manaValueNeeded: number | null;
  /** Spellbook's bracket tag, when present. */
  bracket: string | null;
  /** Where the combo sits relative to the user's deck. */
  completeness:
    | "in_deck"
    | "needs_commander_change"
    | "almost_in_deck"
    | "needs_color";
}
