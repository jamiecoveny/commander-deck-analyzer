// Build a 2–4 sentence plain-language game plan summary.
//
// Pure function. Takes the inputs that already exist in the analysis
// pipeline (archetype guess, category counts, detected combos) and
// composes a short narrative. Context-aware: each fragment is only
// included when its underlying signal is actually present (no more
// "tutor + counterspell suite (7 tutors, 0 counters)" hallucinations).

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

interface TemplateCtx {
  commander: string;
  c: CategoryBreakdown;
  combos: readonly DetectedCombo[];
  avgCmc: number;
  topComboPhrase: string;
  inDeckCombos: readonly DetectedCombo[];
}

/**
 * Conditional sentence builder — joins fragments with spaces; drops
 * empty strings. Keeps the templates readable.
 */
function plan(...fragments: ReadonlyArray<string | false | null | undefined>): string {
  return fragments
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" ");
}

/**
 * Describe the deck's interaction suite truthfully — only mentions a
 * piece when the count is > 0. "tutor + counterspell suite" only when
 * both > 0. Returns an empty string if the deck has neither.
 */
function suitePhrase(c: CategoryBreakdown): string {
  const parts: string[] = [];
  if (c.tutor > 0) parts.push(`${c.tutor} tutor${c.tutor === 1 ? "" : "s"}`);
  if (c.counterspell > 0) {
    parts.push(`${c.counterspell} counter${c.counterspell === 1 ? "" : "s"}`);
  }
  if (c.removal + c.wipe > 0) {
    const total = c.removal + c.wipe;
    parts.push(`${total} removal piece${total === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

const TEMPLATES: Record<string, (ctx: TemplateCtx) => string> = {
  "Combo / control": (ctx) =>
    plan(
      `${ctx.commander} runs a combo line ${suitePhrase(ctx.c)}.`,
      ctx.inDeckCombos.length > 0
        ? `Wins through assembled combos${ctx.topComboPhrase}.`
        : ctx.c.counterspell >= 4
          ? "Stalls the game with counters until the line assembles."
          : "Looks for the combo line; tutors find missing pieces.",
    ),

  "Combo / tutor": (ctx) =>
    plan(
      `${ctx.commander} is a tutor-heavy combo deck ${suitePhrase(ctx.c)}.`,
      ctx.inDeckCombos.length > 0
        ? `Assembled wincons${ctx.topComboPhrase} once enough mana is online.`
        : `Tutors find the wincon pieces; minimal interaction means racing the table.`,
    ),

  "Reanimator combo": (ctx) =>
    plan(
      `${ctx.commander} is a reanimator combo (${ctx.c.recursion} recursion, ${ctx.c.tutor} tutor${ctx.c.tutor === 1 ? "" : "s"}).`,
      `Fill the graveyard, sac a creature into${
        ctx.inDeckCombos.length > 0 ? ` ${ctx.topComboPhrase} or` : ""
      } a drain trigger, repeat until the table is dead.`,
    ),

  Control: (ctx) =>
    plan(
      ctx.c.counterspell > 0
        ? `Stall with ${ctx.c.counterspell} counterspells and ${ctx.c.removal + ctx.c.wipe} pieces of removal.`
        : `Stall with ${ctx.c.removal + ctx.c.wipe} pieces of removal.`,
      `Close out late with ${ctx.commander}${ctx.c.wincon > 0 ? ` or one of the deck's ${ctx.c.wincon} alt-win pieces` : ""}.`,
    ),

  "Big mana ramp": (ctx) =>
    plan(
      `Ramp aggressively (${ctx.c.ramp} ramp pieces, average CMC ${ctx.avgCmc.toFixed(1)}).`,
      `Drop overcosted threats once the mana base is ahead of the table; ${ctx.commander} closes the game.`,
    ),

  "Reanimator / recursion": (ctx) =>
    plan(
      `Fill the graveyard, then cheat threats back into play (${ctx.c.recursion} recursion effects).`,
      `${ctx.commander} anchors the value engine.`,
    ),

  "Voltron / combat damage": (ctx) =>
    plan(
      `Suit up ${ctx.commander} with equipment / auras / combat tricks and swing for commander damage.`,
      ctx.c.removal + ctx.c.counterspell > 0
        ? `Hold up ${ctx.c.removal + ctx.c.counterspell} pieces of interaction to protect the threat.`
        : `Light on protection — race the table before they answer.`,
    ),

  "Combo wincon": (ctx) =>
    plan(
      `Looks for an alt-win line via ${ctx.c.wincon} wincon piece${ctx.c.wincon === 1 ? "" : "s"}${ctx.topComboPhrase}.`,
      `${ctx.commander} provides card flow to find the missing pieces.`,
    ),

  "Stax / lock": (ctx) =>
    plan(
      `Lock opponents under taxes and resource denial (${ctx.c.stax} stax pieces).`,
      `Outlast the table; ${ctx.commander} grinds value while resources stay scarce.`,
    ),

  "Midrange / good stuff": (ctx) => {
    const interaction = ctx.c.removal + ctx.c.wipe + ctx.c.counterspell;
    return plan(
      `Plays efficient threats${interaction > 0 ? ` and ${interaction} pieces of interaction` : ""}.`,
      `${ctx.commander} provides incremental value; balanced curve and ramp suite (${ctx.c.ramp} ramp / ${ctx.c.draw} draw / avg CMC ${ctx.avgCmc.toFixed(1)}).`,
    );
  },
};

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
    inDeckCombos: input.combos.filter((c) => c.completeness === "in_deck"),
  };
  const tmpl =
    TEMPLATES[input.archetype.archetype] ??
    TEMPLATES["Midrange / good stuff"]!;
  return tmpl(ctx);
}
