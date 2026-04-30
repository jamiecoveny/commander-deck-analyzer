// Decklist validator. Takes parsed lines + a card lookup function and
// emits a ValidatedDeck or a list of structured errors.
//
// The DB layer is injected so this is unit-testable against a fake
// lookup. Production code will pass `getCardsByNames(prisma, ...)`.

import { loadBannedList } from "./banned";
import {
  canPairAsCommanders,
  hasChooseBackground,
  isBackground,
  isLegendary,
} from "./partners";
import type {
  CardLookupRow,
  DecklistError,
  ParsedDecklist,
  ValidateResult,
  ValidatedDeck,
  ValidatedDeckCard,
} from "./types";

const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;

const BASIC_LAND_NAMES = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
  "Snow-Covered Wastes",
]);

const ANY_NUMBER_PHRASE = /A deck can have any number of cards named/i;

export interface CardsByName {
  found: Map<string, CardLookupRow>;
  missing: string[];
}

export interface ValidateOptions {
  /** DI'd lookup. Tests pass a fake; production passes a Prisma adapter. */
  lookupCards: (names: readonly string[]) => Promise<CardsByName>;
  /** Override path for `config/banned-list.json`. Tests use this. */
  bannedListPath?: string;
  /** Skip the banned-list check entirely (advanced — used in unit tests). */
  skipBannedList?: boolean;
}

function sortColorIdentity(input: string): string {
  const set = new Set(input.toUpperCase().split(""));
  return COLOR_ORDER.filter((c) => set.has(c)).join("");
}

function isSubsetOf(card: string, commander: string): boolean {
  for (const ch of card) {
    if (!commander.includes(ch)) return false;
  }
  return true;
}

function isBasicLand(card: CardLookupRow): boolean {
  return BASIC_LAND_NAMES.has(card.name);
}

function allowsAnyNumber(card: CardLookupRow): boolean {
  return ANY_NUMBER_PHRASE.test(card.oracleText);
}

function commanderEligible(card: CardLookupRow): boolean {
  // Legendary Creatures are commanders. Some cards (planeswalkers, lands)
  // carry "can be your commander" — we honor that rider via oracle text.
  if (/can be your commander/i.test(card.oracleText)) return true;
  if (isBackground(card)) return true; // Background pairings allow it.
  return isLegendary(card) && /\bCreature\b/.test(card.typeLine);
}

/**
 * Aggregate quantities per card name. The parser yields one ParsedLine per
 * input line, but a deck may legitimately list a card across multiple
 * lines (rare but possible — and any duplicate basic land lines should be
 * summed, not flagged as a singleton violation).
 */
function aggregateQuantities(
  parsed: ParsedDecklist,
): Map<string, { quantity: number; isCommander: boolean }> {
  const out = new Map<string, { quantity: number; isCommander: boolean }>();
  for (const line of parsed.lines) {
    const existing = out.get(line.name);
    if (existing) {
      existing.quantity += line.quantity;
      existing.isCommander = existing.isCommander || line.isCommander;
    } else {
      out.set(line.name, {
        quantity: line.quantity,
        isCommander: line.isCommander,
      });
    }
  }
  return out;
}

export async function validateDecklist(
  parsed: ParsedDecklist,
  opts: ValidateOptions,
): Promise<ValidateResult> {
  const errors: DecklistError[] = [];

  const aggregated = aggregateQuantities(parsed);
  if (aggregated.size === 0) {
    errors.push({ error: "wrong_total", expected: 100, actual: 0 });
    return { ok: false, errors, warnings: parsed.warnings };
  }

  const lookup = await opts.lookupCards(Array.from(aggregated.keys()));

  // Index missing names by their first-seen line so the user gets a useful
  // pointer back into their paste.
  const firstLineByName = new Map<string, number>();
  for (const line of parsed.lines) {
    if (!firstLineByName.has(line.name)) {
      firstLineByName.set(line.name, line.lineNumber);
    }
  }
  for (const missing of lookup.missing) {
    errors.push({
      error: "card_not_found",
      line: firstLineByName.get(missing) ?? 0,
      name: missing,
    });
  }

  // Banned list (skip for cards we already failed to look up).
  let banned: ReadonlySet<string> = new Set();
  if (!opts.skipBannedList) {
    try {
      banned = await loadBannedList(opts.bannedListPath);
    } catch (err) {
      // Surface as a parse_error with line 0 — config issue, not user input.
      errors.push({
        error: "parse_error",
        line: 0,
        message: `failed to load banned list: ${(err as Error).message}`,
      });
    }
  }
  for (const [name, info] of aggregated) {
    if (lookup.found.has(name) && banned.has(name)) {
      errors.push({ error: "banned_card", card: name });
    }
    void info;
  }

  // Identify commanders.
  const commanderEntries: Array<{
    name: string;
    card: CardLookupRow;
    quantity: number;
  }> = [];
  for (const [name, info] of aggregated) {
    if (!info.isCommander) continue;
    const card = lookup.found.get(name);
    if (!card) continue; // already errored as card_not_found
    if (!commanderEligible(card)) {
      errors.push({ error: "non_legendary_commander", card: name });
      continue;
    }
    commanderEntries.push({ name, card, quantity: info.quantity });
  }

  if (commanderEntries.length === 0) {
    errors.push({ error: "missing_commander" });
  } else if (commanderEntries.length > 2) {
    errors.push({
      error: "too_many_commanders",
      count: commanderEntries.length,
    });
  } else if (commanderEntries.length === 2) {
    const [a, b] = commanderEntries;
    // Non-null asserted by the length check above.
    const aE = a!;
    const bE = b!;
    const pair = canPairAsCommanders(aE.card, bE.card);
    if (!pair.ok) {
      errors.push({
        error: "invalid_partner",
        commanders: [aE.name, bE.name],
        reason: pair.reason,
      });
    }
  } else {
    // Exactly one commander — must not be a Background unless paired.
    const e = commanderEntries[0]!;
    if (isBackground(e.card) && !hasChooseBackground(e.card)) {
      errors.push({
        error: "invalid_partner",
        commanders: [e.name],
        reason: "Background cards must be paired with a 'Choose a Background' commander",
      });
    }
  }

  // Compute commander color identity (union of all commanders).
  const commanderCI = sortColorIdentity(
    commanderEntries.map((c) => c.card.colorIdentity).join(""),
  );

  // Color identity check on every other card.
  for (const [name, info] of aggregated) {
    if (info.isCommander) continue;
    const card = lookup.found.get(name);
    if (!card) continue;
    const cardCI = sortColorIdentity(card.colorIdentity);
    if (!isSubsetOf(cardCI, commanderCI)) {
      errors.push({
        error: "color_identity_violation",
        card: name,
        cardColors: cardCI,
        commanderColors: commanderCI,
      });
    }
  }

  // Singleton check.
  for (const [name, info] of aggregated) {
    if (info.quantity <= 1) continue;
    const card = lookup.found.get(name);
    if (!card) continue;
    if (isBasicLand(card)) continue;
    if (allowsAnyNumber(card)) continue;
    errors.push({ error: "singleton_violation", card: name, quantity: info.quantity });
  }

  // Total card count.
  let total = 0;
  for (const [, info] of aggregated) total += info.quantity;
  if (total !== 100) {
    errors.push({ error: "wrong_total", expected: 100, actual: total });
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings: parsed.warnings };
  }

  // Build the validated deck.
  const cards: ValidatedDeckCard[] = [];
  for (const [name, info] of aggregated) {
    const card = lookup.found.get(name);
    if (!card) continue;
    cards.push({
      name: card.name,
      oracleId: card.oracleId,
      quantity: info.quantity,
      isCommander: info.isCommander,
    });
  }

  const commanderNames = commanderEntries.map((c) => c.name).sort();
  const deck: ValidatedDeck = {
    commander: commanderNames.join(" // "),
    commanders: commanderNames,
    colorIdentity: commanderCI,
    cards,
    totalCards: total,
  };

  return { ok: true, deck, warnings: parsed.warnings };
}
