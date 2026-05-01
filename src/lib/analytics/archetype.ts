// Coarse archetype guess. Phase-1 heuristic; the brief's full archetype
// list (voltron/combo/tokens/aristocrats/mill/stax/group hug/storm/big
// mana) needs Spellbook data and additional signals. We pick the
// strongest signal we can detect from category counts + commander hints
// and return it with reasons attached, so the UI can show "Combo
// (because: 5 counterspells, 4 tutors)".

import type { ArchetypeGuess, AnalysisResult } from "./types";

interface Signal {
  archetype: string;
  reason: string;
  /** 0..1 — used to pick the strongest match. */
  weight: number;
}

export interface ArchetypeInput {
  commanderName: string;
  commanderTypeLine?: string;
  commanderOracleText?: string;
  categoryCounts: AnalysisResult["categoryCounts"];
  averageCmc: number;
  totalCards: number;
}

export function guessArchetype(input: ArchetypeInput): ArchetypeGuess {
  const sig: Signal[] = [];
  const c = input.categoryCounts;

  // Stax / lock — gating effects > 5 is a strong signal.
  if (c.stax >= 5) {
    sig.push({
      archetype: "Stax / lock",
      reason: `${c.stax} stax-tagged cards`,
      weight: Math.min(1, c.stax / 12),
    });
  }

  // Combo / control — heavy interaction + tutoring.
  if (c.counterspell + c.tutor >= 6) {
    sig.push({
      archetype: "Combo / control",
      reason: `${c.counterspell} counters + ${c.tutor} tutors`,
      weight: Math.min(1, (c.counterspell + c.tutor) / 14),
    });
  } else if (c.counterspell >= 6) {
    sig.push({
      archetype: "Control",
      reason: `${c.counterspell} counterspells`,
      weight: Math.min(1, c.counterspell / 12),
    });
  }

  // Big mana ramp — high ramp count + above-curve average CMC.
  if (c.ramp >= 12 && input.averageCmc >= 4) {
    sig.push({
      archetype: "Big mana ramp",
      reason: `${c.ramp} ramp + avg CMC ${input.averageCmc.toFixed(1)}`,
      weight: 0.9,
    });
  }

  // Reanimator — recursion-heavy.
  if (c.recursion >= 6) {
    sig.push({
      archetype: "Reanimator / recursion",
      reason: `${c.recursion} recursion effects`,
      weight: Math.min(1, c.recursion / 12),
    });
  }

  // Voltron — heuristic from the commander's text. We don't have a real
  // equipment count yet (that needs a typeLine pass); if the commander
  // is a creature with double-strike / lifelink / unblockable wording
  // we tag it as Voltron-leaning.
  const cmdrText = input.commanderOracleText ?? "";
  const cmdrType = input.commanderTypeLine ?? "";
  if (
    /\bCreature\b/.test(cmdrType) &&
    /(double strike|deals damage equal to|combat damage|commander damage)/i.test(
      cmdrText,
    )
  ) {
    sig.push({
      archetype: "Voltron / combat damage",
      reason: "commander has combat-focused text",
      weight: 0.6,
    });
  }

  // Wincon-tagged cards (Approach, Lab Maniac, Thassa's Oracle, etc.).
  if (c.wincon >= 2) {
    sig.push({
      archetype: "Combo wincon",
      reason: `${c.wincon} alt-win cards`,
      weight: Math.min(1, c.wincon / 4),
    });
  }

  if (sig.length === 0) {
    return {
      archetype: "Midrange / good stuff",
      reasons: ["no dominant signal — balanced curve and category mix"],
    };
  }

  // Pick the strongest signal as the headline; surface the rest as
  // additional reasons so the user can see what else is firing.
  sig.sort((a, b) => b.weight - a.weight);
  const headline = sig[0]!;
  const reasons = [
    headline.reason,
    ...sig.slice(1).map((s) => `${s.archetype.toLowerCase()}: ${s.reason}`),
  ];
  return { archetype: headline.archetype, reasons };
}
