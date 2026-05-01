// Normalize a Scryfall card into the Card row shape we persist.
//
// Most cards map 1:1, but multi-faced layouts (transform, modal_dfc, split,
// flip, adventure, meld) put the relevant text on `card_faces` rather than
// at the top level. We concatenate faces with " // " so the downstream
// classifier and search by-text both keep working.

import type { ScryfallCard } from "./types";

export interface NormalizedCard {
  oracleId: string;
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string; // "WUBRG" subset, sorted
  /** Integer power; 0 for non-creatures or `*` / `X` placeholders. */
  power: number;
  /** Integer toughness; 0 for non-creatures or `*` / `X` placeholders. */
  toughness: number;
  edhrecRank: number | null;
  priceUsd: number | null;
}

const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
type ColorLetter = (typeof COLOR_ORDER)[number];

function isColorLetter(s: string): s is ColorLetter {
  return (COLOR_ORDER as readonly string[]).includes(s);
}

function sortColorIdentity(colors: readonly string[]): string {
  const set = new Set<ColorLetter>();
  for (const c of colors) {
    const u = c.toUpperCase();
    if (isColorLetter(u)) set.add(u);
  }
  return COLOR_ORDER.filter((c) => set.has(c)).join("");
}

const MULTIFACE_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "split",
  "flip",
  "adventure",
  "meld",
  "double_faced_token",
  "art_series",
  "reversible_card",
]);

interface CardFaceLite {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
}

function joinFaces(
  faces: readonly CardFaceLite[],
  key: keyof CardFaceLite,
  separator = " // ",
): string {
  return faces
    .map((f) => f[key])
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(separator);
}

function parsePriceUsd(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Coerce P/T strings ("2", "*", "1+*", "X") to a non-negative int. */
function parsePT(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Returns null for cards we want to skip — currently:
 *   - missing oracle_id (some art-series printings)
 *   - layout we treat as non-playable for EDH (token, emblem, etc.)
 */
export function normalize(card: ScryfallCard): NormalizedCard | null {
  if (!card.oracle_id) return null;

  // Skip non-playable card objects.
  if (
    card.layout === "token" ||
    card.layout === "emblem" ||
    card.layout === "double_faced_token" ||
    card.layout === "art_series" ||
    card.set_type === "memorabilia"
  ) {
    return null;
  }

  const isMultiface =
    MULTIFACE_LAYOUTS.has(card.layout) &&
    Array.isArray(card.card_faces) &&
    card.card_faces.length > 1;

  let manaCost: string | null;
  let typeLine: string;
  let oracleText: string;

  if (isMultiface && card.card_faces) {
    // Front face mana cost is the canonical CMC reference; type/text join.
    manaCost = card.card_faces[0]?.mana_cost?.trim() || null;
    typeLine =
      joinFaces(card.card_faces, "type_line") || (card.type_line ?? "");
    oracleText =
      joinFaces(card.card_faces, "oracle_text", "\n//\n") ||
      (card.oracle_text ?? "");
  } else {
    manaCost = card.mana_cost?.trim() || null;
    typeLine = card.type_line ?? "";
    oracleText = card.oracle_text ?? "";
  }

  // For multi-faced cards, the front face's P/T is what matters at cast.
  const power = isMultiface
    ? parsePT(card.card_faces?.[0]?.power as string | undefined)
    : parsePT(card.power);
  const toughness = isMultiface
    ? parsePT(card.card_faces?.[0]?.toughness as string | undefined)
    : parsePT(card.toughness);

  return {
    oracleId: card.oracle_id,
    name: card.name,
    manaCost: manaCost && manaCost.length > 0 ? manaCost : null,
    cmc: card.cmc ?? 0,
    typeLine,
    oracleText,
    colorIdentity: sortColorIdentity(card.color_identity),
    power,
    toughness,
    edhrecRank: card.edhrec_rank ?? null,
    priceUsd: parsePriceUsd(card.prices?.usd),
  };
}
