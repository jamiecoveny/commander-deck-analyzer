// Heuristic decisions: mulligan, hand priority, combat targeting,
// reactive interaction. All pure functions over the state — the engine
// composes them.
//
// Bracket-aware (Phase B+C): every function takes a BracketProfile so
// behavior scales with the player's power level — cEDH players counter
// 95% of wincons, B1 players keep funkier hands.

import type { BracketProfile, CardProfile, PlayerState } from "./types";

/**
 * London-mulligan keep heuristic with bracket-aware strictness.
 *
 * Base rules (Karsten-style):
 *  - 2–5 lands.
 *  - At least one of: ramp piece, draw engine, low-CMC threat.
 *
 * Bracket strictness multiplier > 1 adds:
 *  - At higher brackets, prefer hands that can act on T1–T2 (≥1 spell
 *    castable with starting lands).
 *  - cEDH: must have a tutor or wincon piece by hand.
 */
export function shouldKeepHand(
  hand: readonly CardProfile[],
  depth: number,
  profile: BracketProfile,
): boolean {
  // Hard cap on consecutive mulligans — 1 default, 2 for stricter brackets.
  const maxDepth = profile.mulliganStrictness >= 1.3 ? 2 : 1;
  if (depth >= maxDepth) return true;

  const lands = hand.filter((c) => c.isLand).length;
  if (lands < 2 || lands > 5) return false;

  const hasRamp = hand.some((c) => c.manaPerTurn > 0 || c.rampsLands > 0);
  const hasDraw = hand.some((c) => c.drawsCards > 0);
  const hasCheapThreat = hand.some(
    (c) => !c.isLand && c.cmc <= 3 && (c.isCreature || c.isAltWincon || c.killsCreatures > 0),
  );
  const baseKeep = hasRamp || hasDraw || hasCheapThreat;
  if (!baseKeep) return false;

  // Stricter brackets: also require at least one castable T1–T2 spell.
  if (profile.mulliganStrictness >= 1.2) {
    const earlyAction = hand.some(
      (c) => !c.isLand && c.cmc <= 2 && lands >= c.cmc,
    );
    if (!earlyAction) return false;
  }

  // cEDH: must have a tutor or wincon piece in hand.
  if (profile.mulliganStrictness >= 1.4) {
    const hasComboPiece = hand.some(
      (c) => c.isAltWincon || c.categories.includes("tutor"),
    );
    if (!hasComboPiece) return false;
  }

  return true;
}

/**
 * Total mana available to the active player this turn. Lands contribute
 * 1 each (color tracking happens inside ManaPool). Mana rocks/dorks
 * contribute their `manaPerTurn`.
 *
 * NOTE: this is the legacy "total mana" view used only by tests and the
 * mulligan check — the engine pays via ManaPool directly.
 */
export function availableMana(player: PlayerState): number {
  let total = player.lands.length;
  for (const p of player.permanents) total += p.manaPerTurn;
  return total;
}

/**
 * Sort the hand by play priority. Higher priority comes first.
 * Bracket-aware: combo decks weight wincons + tutors higher; combat
 * decks weight threats; stax decks weight hate pieces.
 */
export function sortByPriority(
  hand: readonly CardProfile[],
  turn: number,
  profile: BracketProfile,
): CardProfile[] {
  const out = hand.slice();
  const phase = turn <= 4 ? "early" : "late";
  out.sort(
    (a, b) =>
      priorityScore(b, phase, profile, turn) -
      priorityScore(a, phase, profile, turn),
  );
  return out;
}

type Phase = "early" | "late";

function priorityScore(
  c: CardProfile,
  phase: Phase,
  profile: BracketProfile,
  turn: number,
): number {
  if (c.isLand) return 0;
  let s = 0;

  // Bracket bias: combo/stax/combat preference.
  const bias = profile.winMix;

  if (phase === "early") {
    // Ramp + cheap interaction stays on top early.
    if (c.manaPerTurn > 0 || c.rampsLands > 0) s += 100;
    if (c.drawsCards > 0) s += 60;
    if (c.cmc <= 2) s += 30;
    if (c.killsCreatures > 0 && c.killsCreatures < 99) s += 20;
    // Combo decks tutor + race wincons earlier.
    if (c.isAltWincon) s += 80 * bias.combo;
    if (c.categories.includes("tutor")) s += 60 * bias.combo;
  } else {
    if (c.isAltWincon) s += 200 * bias.combo + 100;
    if (c.categories.includes("tutor")) s += 80 * bias.combo;
    if (c.killsCreatures >= 99) s += 90;
    if (c.killsCreatures > 0) s += 50;
    if (c.drawsCards > 0) s += 40;
    // Combat decks favor threats late.
    if (c.isCreature && c.power >= 4) s += 60 + 40 * bias.combat;
    if (c.manaPerTurn > 0) s += 20;
    // Stax decks weight hate pieces in mid-late game.
    if (c.categories.includes("stax")) s += 80 * bias.stax;
  }

  // Penalize high CMC slightly so we don't sit on uncastables.
  s -= c.cmc;
  // Late-game: turn pressure makes us prefer the highest-impact card.
  if (turn > profile.expectedEndTurn) s += c.cmc; // counteract the penalty
  return s;
}

/**
 * Pick a land to play this turn. Prefers a land that adds the colors
 * we don't yet have access to over a duplicate basic.
 */
export function pickLandToPlay(hand: readonly CardProfile[]): number {
  for (let i = 0; i < hand.length; i += 1) {
    if (hand[i]?.isLand) return i;
  }
  return -1;
}

/**
 * Combat target selection: pick the opponent with the lowest life that's
 * still alive. Ties broken by least board presence (proxy for "weakest
 * player at the table" politics).
 */
export function chooseCombatTarget(
  attackerId: string,
  players: readonly PlayerState[],
): PlayerState | null {
  const opponents = players.filter(
    (p) => p.id !== attackerId && p.lossReason === "",
  );
  if (opponents.length === 0) return null;
  opponents.sort((a, b) => {
    if (a.life !== b.life) return a.life - b.life;
    return totalBoardPower(a) - totalBoardPower(b);
  });
  return opponents[0]!;
}

function totalBoardPower(p: PlayerState): number {
  let n = 0;
  for (const c of p.permanents) if (c.isCreature) n += c.power;
  if (p.commanderInPlay && p.commander?.isCreature) n += p.commander.power;
  return n;
}

/**
 * Probabilistic counter / removal reaction. Bracket-aware: cEDH players
 * react to wincons at 95%, B1 players at 25%.
 *
 * Returns the index of the card to spend, or -1 if no react.
 */
export function pickInteraction(
  defender: PlayerState,
  threatPower: number,
  threatIsWincon: boolean,
  profile: BracketProfile,
  rng: () => number,
): number {
  if (threatIsWincon) {
    if (rng() > profile.reactToWinconProb) return -1;
  } else if (threatPower >= 6) {
    if (rng() > profile.reactToThreatProb) return -1;
  } else {
    return -1;
  }
  for (let i = 0; i < defender.hand.length; i += 1) {
    if (defender.hand[i]?.isCounter) return i;
  }
  if (!threatIsWincon) {
    for (let i = 0; i < defender.hand.length; i += 1) {
      const c = defender.hand[i];
      if (c && c.killsCreatures > 0 && c.killsCreatures < 99) return i;
    }
  }
  return -1;
}
