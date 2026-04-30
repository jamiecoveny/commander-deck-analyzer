// Helpers that decide whether two cards are a legal commander pair.
// The validator calls into these — keeping them here makes them easy to
// test in isolation against fabricated Card rows.
//
// Pairings supported:
//   - Vanilla "Partner" + "Partner"
//   - "Partner with X" + "Partner with Y" (must be reciprocal)
//   - "Friends forever" + "Friends forever"
//   - "Choose a Background" commander + a Background-typed card
//
// Not yet supported (low frequency, can extend in step 4 when the
// classifier touches oracle text more rigorously):
//   - "Doctor's companion" + Doctor (Doctor Who set)

import type { CardLookupRow } from "./types";

const PARTNER_PLAIN = /^Partner\b(?! with)/im;
const PARTNER_WITH = /Partner with ([^.\n(]+)/i;
const FRIENDS_FOREVER = /\bFriends forever\b/i;
const CHOOSE_BACKGROUND = /\bChoose a Background\b/i;

export function hasPartner(card: CardLookupRow): boolean {
  return PARTNER_PLAIN.test(card.oracleText);
}

export function getPartnerWith(card: CardLookupRow): string | null {
  const m = PARTNER_WITH.exec(card.oracleText);
  return m && m[1] ? m[1].trim() : null;
}

export function hasFriendsForever(card: CardLookupRow): boolean {
  return FRIENDS_FOREVER.test(card.oracleText);
}

export function hasChooseBackground(card: CardLookupRow): boolean {
  return CHOOSE_BACKGROUND.test(card.oracleText);
}

export function isBackground(card: CardLookupRow): boolean {
  return /\bBackground\b/.test(card.typeLine);
}

export function isLegendary(card: CardLookupRow): boolean {
  return /\bLegendary\b/.test(card.typeLine);
}

export type PartnerCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Returns whether `a` and `b` can legally share commander duty.
 *
 * Note: callers are responsible for asserting that each card is itself
 * commander-eligible (legendary creature, or a Background, or carries the
 * "can be your commander" rider). This function only enforces the
 * pairing rule.
 */
export function canPairAsCommanders(
  a: CardLookupRow,
  b: CardLookupRow,
): PartnerCheck {
  if (hasPartner(a) && hasPartner(b)) {
    return { ok: true };
  }

  const aPartnerWith = getPartnerWith(a);
  const bPartnerWith = getPartnerWith(b);
  if (
    aPartnerWith != null &&
    bPartnerWith != null &&
    aPartnerWith === b.name &&
    bPartnerWith === a.name
  ) {
    return { ok: true };
  }

  if (hasFriendsForever(a) && hasFriendsForever(b)) {
    return { ok: true };
  }

  if (hasChooseBackground(a) && isBackground(b)) {
    return { ok: true };
  }
  if (hasChooseBackground(b) && isBackground(a)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      "neither card has Partner / Friends forever / a matching Background pairing",
  };
}
