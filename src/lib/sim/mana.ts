// Color-aware mana pool (Phase B). Replaces the previous
// `{ value: number }` ref-cell pattern with per-source tap tracking
// and colored-pip allocation.
//
// Sources:
//   - Lands: each contributes 1 mana of its `producesColors` (which
//     can be a single color "G", a multi-color shockland-style "UB",
//     or "WUBRG" for City of Brass / Forbidden Orchard).
//   - Permanents with `manaPerTurn > 0`: rocks and dorks. Their
//     `producesColors` says what colors they make. If a rock provides
//     >1 mana per turn (Sol Ring, Mana Crypt) we model it as N
//     separate sources of the same colors.
//
// Allocation:
//   - For each colored pip (W/U/B/R/G) in the spell's manaCostColors,
//     find an available source that can produce that color and tap it.
//   - For the generic portion (cmc minus colored count), tap any
//     remaining available source (we prefer to tap rainbow sources
//     last so future pips have more options — but the heuristic isn't
//     a full rules engine).

import type { CardProfile } from "./types";

interface ManaSource {
  /** "G", "UB", "WUBRG", or "C" for colorless-only. */
  produces: string;
  available: boolean;
  /** Backref so the caller can know whether we're tapping a land vs
   *  a rock vs the commander, etc. Unused by the pool itself. */
  origin: "land" | "rock" | "dork";
}

export class ManaPool {
  readonly sources: ManaSource[];

  constructor(sources: ManaSource[]) {
    this.sources = sources;
  }

  /** Total available mana (any color), counting one per untapped source. */
  get available(): number {
    return this.sources.reduce(
      (n, s) => (s.available ? n + 1 : n),
      0,
    );
  }

  /**
   * Try to pay `card`'s mana cost. Returns true and taps the chosen
   * sources on success; returns false and taps nothing on failure.
   */
  pay(card: CardProfile): boolean {
    const cmc = card.cmc;
    if (cmc === 0) return true;

    const required = card.manaCostColors; // e.g. "GW" or "" for colorless
    const generic = cmc - required.length;

    // Snapshot so we can roll back.
    const tapped: ManaSource[] = [];

    // Greedy: pay each colored pip with the most-restrictive source first.
    for (const color of required) {
      // Sort untapped sources by how few colors they make (fewer = more
      // restrictive = use first). Skip colorless-only when paying colored.
      const candidates = this.sources
        .filter((s) => s.available && s.produces.includes(color))
        .sort((a, b) => a.produces.length - b.produces.length);
      const pick = candidates[0];
      if (!pick) {
        // Roll back any taps we did during this attempt.
        for (const t of tapped) t.available = true;
        return false;
      }
      pick.available = false;
      tapped.push(pick);
    }

    // Generic: prefer colorless / less-restrictive sources for the
    // remainder so future colored pips have more options.
    let remaining = generic;
    if (remaining > 0) {
      const generics = this.sources
        .filter((s) => s.available)
        .sort((a, b) => {
          // Colorless-only first, then by producing fewer colors.
          if (a.produces === "C" && b.produces !== "C") return -1;
          if (b.produces === "C" && a.produces !== "C") return 1;
          return b.produces.length - a.produces.length;
        });
      for (const s of generics) {
        if (remaining <= 0) break;
        s.available = false;
        tapped.push(s);
        remaining -= 1;
      }
    }

    if (remaining > 0) {
      for (const t of tapped) t.available = true;
      return false;
    }

    return true;
  }
}

/**
 * Build the active player's mana pool for the turn from their lands
 * and mana-producing permanents.
 *
 * Sol Ring and Mana Crypt produce 2 colorless per turn — we model that
 * as two separate "C"-producing sources so each can be allocated
 * independently. (Phyrexian Tower and similar tap-for-2 lands could be
 * modeled the same way; we don't.)
 */
export function buildManaPool(
  lands: readonly CardProfile[],
  permanents: readonly CardProfile[],
): ManaPool {
  const sources: ManaSource[] = [];

  for (const land of lands) {
    sources.push({
      produces: land.producesColors || "C",
      available: true,
      origin: "land",
    });
  }

  for (const p of permanents) {
    if (p.manaPerTurn <= 0) continue;
    const colors = p.producesColors || "C";
    const origin: ManaSource["origin"] = p.isCreature ? "dork" : "rock";
    for (let i = 0; i < p.manaPerTurn; i += 1) {
      sources.push({ produces: colors, available: true, origin });
    }
  }

  return new ManaPool(sources);
}
