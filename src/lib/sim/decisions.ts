// Heuristic decisions: mulligan, hand priority, combat targeting,
// reactive interaction. All pure functions over the state — the engine
// composes them.

import type { CardProfile, PlayerState } from "./types";

/**
 * London-mulligan keep heuristic. Returns true if we keep the hand at
 * the current mulligan depth. We allow at most one mulligan in Phase 1.
 *
 * Rules of thumb (Frank Karsten's heuristic, paraphrased):
 *  - Need ≥ 2 lands and ≤ 5 lands.
 *  - At least one of: ramp piece, draw engine, or low-CMC threat.
 */
export function shouldKeepHand(hand: readonly CardProfile[], depth: number): boolean {
  // Hard cap: stop mulliganing after 1 mull (effective hand 6).
  if (depth >= 1) return true;
  const lands = hand.filter((c) => c.isLand).length;
  if (lands < 2 || lands > 5) return false;
  const hasRamp = hand.some(
    (c) => c.manaPerTurn > 0 || c.rampsLands > 0,
  );
  const hasDraw = hand.some((c) => c.drawsCards > 0);
  const hasCheapThreat = hand.some(
    (c) => !c.isLand && c.cmc <= 3 && (c.isCreature || c.isAltWincon || c.killsCreatures > 0),
  );
  return hasRamp || hasDraw || hasCheapThreat;
}

/**
 * Total mana available to the active player this turn. Lands contribute
 * 1 each (we don't model color screws — see notes in the engine).
 * Mana rocks/dorks contribute their `manaPerTurn`.
 */
export function availableMana(player: PlayerState): number {
  let total = player.lands.length;
  for (const p of player.permanents) total += p.manaPerTurn;
  return total;
}

/**
 * Sort the hand by play priority. Higher priority comes first.
 * Phase: "early" (turns 1–4) prefers ramp + cheap interaction; "late"
 * prefers wincons + finishers + counters held up.
 */
export function sortByPriority(
  hand: readonly CardProfile[],
  turn: number,
): CardProfile[] {
  const out = hand.slice();
  const phase = turn <= 4 ? "early" : "late";
  out.sort((a, b) => priorityScore(b, phase) - priorityScore(a, phase));
  return out;
}

type Phase = "early" | "late";

function priorityScore(c: CardProfile, phase: Phase): number {
  if (c.isLand) return 0; // lands are played separately, not from spell loop
  let s = 0;
  if (phase === "early") {
    if (c.manaPerTurn > 0 || c.rampsLands > 0) s += 100;
    if (c.drawsCards > 0) s += 60;
    if (c.cmc <= 2) s += 30;
    if (c.killsCreatures > 0 && c.killsCreatures < 99) s += 20;
  } else {
    if (c.isAltWincon) s += 200;
    if (c.killsCreatures >= 99) s += 90;
    if (c.killsCreatures > 0) s += 50;
    if (c.drawsCards > 0) s += 40;
    if (c.isCreature && c.power >= 4) s += 60;
    if (c.manaPerTurn > 0) s += 20;
  }
  // Penalize high CMC slightly so we don't sit on uncastables.
  s -= c.cmc;
  return s;
}

/**
 * Pick a land to play this turn. Prefers a basic / generic land over
 * something we'd want to crack later. Lands are interchangeable in our
 * coarse model, so this is just "first one we find."
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
 * Whether a defender wants to react (counter / removal) to an opponent's
 * threat. Probabilistic — politics. Returns the index of the responder's
 * card to spend, or -1 if no react.
 */
export function pickInteraction(
  defender: PlayerState,
  threatPower: number,
  threatIsWincon: boolean,
  rng: () => number,
): number {
  // We can only counter cast spells or remove creatures from hand
  // (counter) / from battlefield (removal happens on cast resolution
  // via removal cards in hand — we model this as "spend a removal
  // from hand to neutralize the just-cast threat").
  if (threatIsWincon) {
    // 70% reaction rate for wincon — table-saves matter.
    if (rng() > 0.7) return -1;
  } else if (threatPower >= 6) {
    if (rng() > 0.5) return -1;
  } else {
    // Don't burn interaction on small threats.
    return -1;
  }
  // Prefer counter (preempts) > spot removal.
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
