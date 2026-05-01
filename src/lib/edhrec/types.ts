// Wire types for EDHrec's commanders page JSON.
//
// Endpoint: https://json.edhrec.com/pages/commanders/<slug>.json
//
// Top-level fields include average type counts (creature, instant,
// land, basic, nonbasic, etc.) and a `container.json_dict.cardlists`
// array of { tag, header, cardviews } sections. Each cardview has
// inclusion (count), num_decks, potential_decks, and synergy.
//
// Schemas use .passthrough() — EDHrec has reshaped its JSON before and
// degrading is preferable to crashing.

import { z } from "zod";

export const EdhrecCardviewSchema = z
  .object({
    name: z.string(),
    sanitized: z.string().optional(),
    url: z.string().optional(),
    synergy: z.number().optional(),
    inclusion: z.number().int().nonnegative().optional(),
    num_decks: z.number().int().nonnegative().optional(),
    potential_decks: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type EdhrecCardview = z.infer<typeof EdhrecCardviewSchema>;

export const EdhrecCardlistSchema = z
  .object({
    tag: z.string(),
    header: z.string().optional().default(""),
    cardviews: z.array(EdhrecCardviewSchema).default([]),
  })
  .passthrough();

const ContainerSchema = z
  .object({
    json_dict: z
      .object({
        cardlists: z.array(EdhrecCardlistSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();

export const EdhrecResponseSchema = z
  .object({
    creature: z.number().optional(),
    instant: z.number().optional(),
    sorcery: z.number().optional(),
    artifact: z.number().optional(),
    enchantment: z.number().optional(),
    battle: z.number().optional(),
    planeswalker: z.number().optional(),
    land: z.number().optional(),
    basic: z.number().optional(),
    nonbasic: z.number().optional(),
    deck_size: z.number().optional(),
    num_decks_avg: z.number().optional(),
    similar: z.array(z.string()).optional(),
    container: ContainerSchema,
  })
  .passthrough();

export type EdhrecResponse = z.infer<typeof EdhrecResponseSchema>;

/** Domain shape consumed by the recommender + UI. Stripped to the
 *  fields we actually use, so a future EDHrec reshape doesn't ripple
 *  through the rest of the app. */
export interface EdhrecData {
  /** Total decks tracked for this commander on EDHrec. */
  numDecks: number;
  averageTypeCounts: {
    creature: number;
    instant: number;
    sorcery: number;
    artifact: number;
    enchantment: number;
    planeswalker: number;
    land: number;
    basic: number;
    nonbasic: number;
  };
  /** Card → inclusion percentage (0–1) for high-inclusion cards. Sorted
   *  by inclusion percentage descending. */
  topCards: EdhrecTopCard[];
  similarCommanders: string[];
}

export interface EdhrecTopCard {
  name: string;
  inclusionPct: number;
  numDecks: number;
  potentialDecks: number;
  synergy: number;
  /** EDHrec section this card came from (e.g., "Mana Artifacts"). */
  section: string;
}
