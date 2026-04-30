// Wire types for Scryfall's `oracle-cards` bulk data.
//
// Source: https://scryfall.com/docs/api/cards
// We only validate the fields we actually consume — Scryfall ships dozens
// more, but parsing them all wastes CPU on a 500MB stream.

import { z } from "zod";

const ScryfallPricesSchema = z
  .object({
    usd: z.string().nullable().optional(),
    usd_foil: z.string().nullable().optional(),
    eur: z.string().nullable().optional(),
  })
  .partial();

const ScryfallCardFaceSchema = z.object({
  name: z.string(),
  mana_cost: z.string().optional(),
  type_line: z.string().optional(),
  oracle_text: z.string().optional(),
});

export const ScryfallCardSchema = z
  .object({
    object: z.literal("card").optional(),
    oracle_id: z.string().optional(), // missing on a tiny number of art-series; we filter
    id: z.string(),
    name: z.string(),
    layout: z.string(),
    mana_cost: z.string().optional(),
    cmc: z.number().optional().default(0),
    type_line: z.string().optional(),
    oracle_text: z.string().optional(),
    color_identity: z.array(z.string()).default([]),
    edhrec_rank: z.number().int().nullable().optional(),
    prices: ScryfallPricesSchema.optional(),
    card_faces: z.array(ScryfallCardFaceSchema).optional(),
    // Reprint marker — we still want each oracle entry exactly once,
    // but the bulk file is `oracle-cards` so reprints are pre-filtered.
    digital: z.boolean().optional(),
    set_type: z.string().optional(),
  })
  .passthrough();

export type ScryfallCard = z.infer<typeof ScryfallCardSchema>;

// Subset of /bulk-data list response we use.
export const BulkDataListItemSchema = z.object({
  type: z.string(), // 'oracle_cards', 'unique_artwork', etc.
  updated_at: z.string(), // ISO datetime
  download_uri: z.string().url(),
  size: z.number().int().nonnegative().optional(),
  content_type: z.string().optional(),
});

export const BulkDataListSchema = z.object({
  object: z.literal("list").optional(),
  data: z.array(BulkDataListItemSchema),
});

export type BulkDataListItem = z.infer<typeof BulkDataListItemSchema>;
