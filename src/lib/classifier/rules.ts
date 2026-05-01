// Regex rule sets per category. The classifier runs these in order; a
// card can match more than one (e.g. Smothering Tithe is both ramp and
// draw — that one's in overrides because the regex doesn't catch the
// "Treasure" → ramp implication on its own).
//
// Design rules I'm trying to follow:
//   - Patterns are conservative. Better to miss and override than over-tag.
//   - `wipe` is checked before `removal` so "Destroy all creatures" doesn't
//     leak into the targeted-removal bucket via post-processing.
//   - `ramp` includes both mana production and basic-land tutoring.
//     Non-basic-land tutors are `tutor` instead — adjudicated in
//     classify.ts (a `tutor` match is dropped if `ramp` already matched
//     via the basic-land path).

import type { CategoryRule } from "./types";

// ---------- ramp ----------

export const RAMP_PATTERNS: readonly RegExp[] = [
  // Mana production: "Add {C}{C}", "Add one mana of any color"
  /\bAdd \{[^}]+\}/i,
  /\bAdd one mana of any color\b/i,
  // Land ramp: search library for a basic land
  /\bSearch your library for (?:up to \w+ )?(?:a )?basic land/i,
  // Treasure / Gold token producers (named patterns)
  /\bcreate (?:a|\w+) Treasure tokens?\b/i,
  /\bcreate (?:a|\w+) Gold tokens?\b/i,
];

// ---------- card draw ----------

export const DRAW_PATTERNS: readonly RegExp[] = [
  // Cover both imperative ("draw two cards") and third-person
  // ("each player draws seven cards" — Wheel of Fortune).
  /\bdraws? \w+ cards?\b/i,
  /\bdraws? (?:a|an) card\b/i,
  /\bdraws? an (?:additional|extra) card\b/i,
];

// ---------- counterspell ----------

export const COUNTER_PATTERNS: readonly RegExp[] = [
  /\bCounter target (?:spell|creature spell|noncreature spell|nonland|nonland permanent|spell or ability|permanent spell|activated ability|triggered ability)\b/i,
  /\bCounter that spell\b/i,
];

// ---------- board wipe ----------

export const WIPE_PATTERNS: readonly RegExp[] = [
  /\b(?:Destroy|Exile) all (?:creatures|nonland permanents|permanents|artifacts|enchantments|nonland)/i,
  /\b(?:Destroy|Exile) each (?:creature|nonland permanent|permanent)/i,
  /\bAll creatures get -\d+\/-\d+\b/i,
  /\bEach creature gets -\d+\/-\d+\b/i,
  /\bDeal \d+ damage to each creature\b/i,
  /\bdeals \d+ damage to each creature\b/i,
  /\bReturn all .* to (?:its|their) owners?'? hands?\b/i,
  // Cyclonic Rift overload — "Return all nonland permanents you don't control..."
  /\bReturn all nonland permanents\b/i,
];

// ---------- targeted removal ----------

export const REMOVAL_PATTERNS: readonly RegExp[] = [
  // "Destroy target [adjective(s)] creature/artifact/etc." — allows up
  // to three adjective words ("target attacking nonblack creature").
  /\b(?:Destroy|Exile) target (?:[\w-]+\s+){0,3}(?:creature|artifact|enchantment|planeswalker|permanent|land|nonland)\b/i,
  // Bounce: "Return target ... to its/their owner's/owners' hand(s)".
  // The lazy `[\s\S]*?` walks past clauses like "you don't control".
  /\bReturn target (?:[\w-]+\s+){0,4}(?:creature|artifact|enchantment|planeswalker|permanent|nonland)[\s\S]{0,80}?\bto (?:its|their) owner['s ]+\s*hand/i,
  // Direct damage to a target.
  /\bdeals \d+ damage to (?:any target|target creature|target permanent|target player|target opponent)\b/i,
  /\bdeals (?:X|N) damage to (?:any target|target creature|target permanent|target player|target opponent)\b/i,
  // Fight effects.
  /\bfights target creature\b/i,
];

// ---------- tutor ----------

export const TUTOR_PATTERNS: readonly RegExp[] = [
  /\bSearch your library for (?:a |an |any |up to )/i,
];

// ---------- recursion ----------

export const RECURSION_PATTERNS: readonly RegExp[] = [
  /\bReturn target [^.]+? from (?:your |a )?graveyard\b/i,
  /\bput target [^.]+? from (?:your |a )?graveyard onto the battlefield\b/i,
  /\breturn .* from your graveyard to (?:your hand|the battlefield)\b/i,
];

// ---------- stax / hate ----------

export const STAX_PATTERNS: readonly RegExp[] = [
  // "Players can't" / "Each player can't" / "Your opponents can't"
  /\b(?:Players|Each player|Your opponents) can't\b/i,
  // Cost-increasing taxes.
  /\bcost \{[^}]+\} more to cast\b/i,
  /\bspells (?:your opponents cast )?cost \{[^}]+\} more\b/i,
  // Step skipping.
  /\bskips? (?:their|its) (?:draw|untap|upkeep) step\b/i,
  // Common stax phrasing.
  /\bcreatures can't attack\b/i,
  /\bcan't untap during\b/i,
];

// ---------- wincon (alt-win text only — combos come from Spellbook) ----------

export const WINCON_PATTERNS: readonly RegExp[] = [
  /\byou win the game\b/i,
  /\bthat (?:opponent|player) loses the game\b/i,
  /\bcan't lose the game\b/i,
];

// ---------- the rule set ----------

export const RULES: readonly CategoryRule[] = [
  { category: "wipe", patterns: WIPE_PATTERNS },
  { category: "counterspell", patterns: COUNTER_PATTERNS },
  { category: "removal", patterns: REMOVAL_PATTERNS },
  { category: "ramp", patterns: RAMP_PATTERNS },
  { category: "draw", patterns: DRAW_PATTERNS },
  { category: "tutor", patterns: TUTOR_PATTERNS },
  { category: "recursion", patterns: RECURSION_PATTERNS },
  { category: "stax", patterns: STAX_PATTERNS },
  { category: "wincon", patterns: WINCON_PATTERNS },
] as const;
