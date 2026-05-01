// Build a 2–4 sentence plain-language game plan summary.
//
// Pure function. Takes the inputs that already exist in the analysis
// pipeline (archetype guess, category counts, detected combos) and
// composes a short narrative. Templates per archetype, with optional
// combo + commander mentions.
//
// Why this lives in analytics/, not classifier/: it's read-only over
// the analytics outputs, and consumed by the same UI panel that shows
// the archetype guess.

import type { DetectedCombo } from "@/lib/spellbook";

import type { ArchetypeGuess, CategoryBreakdown } from "./types";

export interface GamePlanInput {
  commander: string;
  archetype: ArchetypeGuess;
  categoryCounts: CategoryBreakdown;
  combos: readonly DetectedCombo[];
  averageCmc: number;
  landCount: number;
  totalCards: number;
}

const TEMPLATES: Record<string, (ctx: TemplateCtx) => string[]> = {
  "Combo / control": (ctx) => [
    `${ctx.commander} runs a tutor + counterspell suite (${ctx.c.tutor} tutors, ${ctx.c.counterspell} counters).`,
    ctx.combos.length > 0
      ? `Wins through assembled combos${ctx.topComboPhrase}.`
      : `Looks for a combo line; protects it with interaction once it's set up.`,
  ],
  Control: (ctx) => [
    `Stall the game with ${ctx.c.counterspell} counterspells and ${ctx.c.removal + ctx.c.wipe} pieces of removal.`,
    `Close out late with ${ctx.commander} or one of the deck's ${ctx.c.wincon || 1} alt-win pieces.`,
  ],
  "Big mana ramp": (ctx) => [
    `Ramp aggressively (${ctx.c.ramp} ramp pieces, average CMC ${ctx.avgCmc.toFixed(1)}).`,
    `Drop overcosted threats once the mana base is ahead of the table; ${ctx.commander} closes the game.`,
  ],
  "Reanimator / recursion": (ctx) => [
    `Fill the graveyard, then cheat threats back into play (${ctx.c.recursion} recursion effects).`,
    `${ctx.commander} anchors the value engine.`,
  ],
  "Voltron / combat damage": (ctx) => [
    `Suit up ${ctx.commander} with equipment / auras / combat tricks and swing for commander damage.`,
    `Hold up ${ctx.c.removal + ctx.c.counterspell} pieces of interaction to protect the threat.`,
  ],
  "Combo wincon": (ctx) => [
    `Looks for an alt-win line via ${ctx.c.wincon} wincon pieces${ctx.topComboPhrase}.`,
    `${ctx.commander} provides card flow to find the missing pieces.`,
  ],
  "Stax / lock": (ctx) => [
    `Lock opponents under taxes and resource denial (${ctx.c.stax} stax pieces).`,
    `Outlast the table; ${ctx.commander} grinds value while resources stay scarce.`,
  ],
  "Midrange / good stuff": (ctx) => [
    `Plays efficient threats and ${ctx.c.removal + ctx.c.wipe + ctx.c.counterspell} pieces of interaction.`,
    `${ctx.commander} provides incremental value; balanced curve and ramp suite (${ctx.c.ramp} ramp / ${ctx.c.draw} draw / avg CMC ${ctx.avgCmc.toFixed(1)}).`,
  ],
};

interface TemplateCtx {
  commander: string;
  c: CategoryBreakdown;
  combos: readonly DetectedCombo[];
  avgCmc: number;
  /**
   * Pre-built phrase like " (key combo: Thassa's Oracle + Demonic
   * Consultation)" — empty string when no combos in deck.
   */
  topComboPhrase: string;
}

function topComboPhrase(combos: readonly DetectedCombo[]): string {
  const inDeck = combos.filter((c) => c.completeness === "in_deck");
  if (inDeck.length === 0) return "";
  const top = inDeck[0];
  if (!top || top.cards.length === 0) return "";
  const cardList = top.cards.slice(0, 3).join(" + ");
  return ` (e.g. ${cardList})`;
}

export function buildGamePlan(input: GamePlanInput): string {
  const ctx: TemplateCtx = {
    commander: input.commander || "the commander",
    c: input.categoryCounts,
    combos: input.combos,
    avgCmc: input.averageCmc,
    topComboPhrase: topComboPhrase(input.combos),
  };
  const tmpl =
    TEMPLATES[input.archetype.archetype] ??
    TEMPLATES["Midrange / good stuff"]!;
  return tmpl(ctx).filter((s) => s.trim().length > 0).join(" ");
}
