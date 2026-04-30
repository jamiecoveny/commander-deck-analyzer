// Shared types for decklist parsing and validation.
//
// The error shape mirrors the brief's contract:
//   { error: "color_identity_violation", card: "Lightning Bolt", commanderColors: ["G","U"] }
// We use string-typed `colorIdentity` (e.g. "GU") instead of arrays to
// match the rest of the codebase (Scryfall normalizer, Card.colorIdentity).

import type { Card } from "@prisma/client";

export interface ParsedLine {
  /** 1-indexed line number in the original input. */
  lineNumber: number;
  raw: string;
  name: string;
  quantity: number;
  /** True if the line was tagged `*CMDR*` or fell under a `// Commander` block. */
  isCommander: boolean;
}

export interface ParseWarning {
  lineNumber: number;
  message: string;
}

export interface ParsedDecklist {
  lines: ParsedLine[];
  warnings: ParseWarning[];
}

export type DecklistError =
  | { error: "parse_error"; line: number; message: string }
  | { error: "card_not_found"; line: number; name: string }
  | {
      error: "color_identity_violation";
      card: string;
      cardColors: string;
      commanderColors: string;
    }
  | { error: "singleton_violation"; card: string; quantity: number }
  | { error: "banned_card"; card: string }
  | { error: "wrong_total"; expected: 100; actual: number }
  | { error: "missing_commander" }
  | { error: "too_many_commanders"; count: number }
  | { error: "invalid_partner"; commanders: string[]; reason: string }
  | { error: "non_legendary_commander"; card: string }
  | { error: "duplicate_card_lines"; card: string };

export interface ValidatedDeckCard {
  name: string;
  oracleId: string;
  quantity: number;
  isCommander: boolean;
}

export interface ValidatedDeck {
  /**
   * Display name. For partners this is "Front // Back" with the partners
   * sorted alphabetically for stable identity (used as a cache key).
   */
  commander: string;
  /** Either 1 entry or 2 (partner / background pairing). */
  commanders: string[];
  /** WUBRG-sorted color identity letters (e.g. "WUB"). Empty string = colorless. */
  colorIdentity: string;
  cards: ValidatedDeckCard[];
  totalCards: number;
}

export type ValidateResult =
  | { ok: true; deck: ValidatedDeck; warnings: ParseWarning[] }
  | { ok: false; errors: DecklistError[]; warnings: ParseWarning[] };

/** A reference to a card looked up via Scryfall — handy for tests. */
export type CardLookupRow = Pick<
  Card,
  "name" | "oracleId" | "typeLine" | "oracleText" | "colorIdentity"
>;
