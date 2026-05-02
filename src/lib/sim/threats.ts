// Threat assessment + combat math + combo recognition (Phase D).
//
// All pure functions over PlayerState — the engine and decisions
// modules compose them. Keeping the heuristics here makes the
// engine's combat / cast paths cleaner and the AI behavior easier
// to tune in one place.

import type { CardProfile, PlayerState } from "./types";

// ---------- Threat score: who's about to win ----------

/**
 * Overall danger level of a player. Higher = more likely to close out
 * the game soon. The combat-target chooser uses this to "pile on the
 * leader" instead of the lowest-life-first heuristic from Phase 1.
 *
 * Components (rough weights tuned by intuition; adjust as the sim
 * gets more sophisticated):
 *   - Wincon cards visible on board (huge — 50 each)
 *   - Sac outlets + Aristocrats triggers in play (combo assembly)
 *   - Total board power × 2 (combat clock)
 *   - Mana base (lands + rocks)
 *   - Hand size × 0.5 (card advantage proxy)
 *   - Commander damage already dealt to OTHER opponents (snowball)
 */
export function threatScore(p: PlayerState): number {
  let s = 0;

  for (const c of p.permanents) {
    if (c.isAltWincon) s += 50;
    if ((c.triggers.sacForMana ?? 0) > 0) s += 12;
    if ((c.triggers.sacForDraw ?? 0) > 0) s += 8;
    if ((c.triggers.onAnyCreatureDiesDrain ?? 0) > 0) s += 12;
    if ((c.triggers.onYourCreatureDiesDraw ?? 0) > 0) s += 10;
    if (c.categories.includes("tutor")) s += 5;
    if ((c.drawsCards > 0 || c.manaPerTurn >= 2) && c.isPermanent) s += 6;
  }

  // Board power.
  let totalPower = 0;
  for (const c of p.permanents) if (c.isCreature) totalPower += c.power;
  if (p.commanderInPlay && p.commander?.isCreature) {
    totalPower += p.commander.power;
  }
  s += totalPower * 2;

  // Mana base + card advantage.
  s += p.lands.length;
  s += p.hand.length * 0.5;

  return s;
}

/**
 * How close `p` looks to assembling an Aristocrats or Spellbook combo.
 * Returns an integer 0..N where ≥2 means "react aggressively".
 */
export function comboRiskScore(p: PlayerState): number {
  let n = 0;
  for (const c of p.permanents) {
    if (c.isAltWincon) n += 2;
    if ((c.triggers.sacForMana ?? 0) > 0) n += 1;
    if ((c.triggers.sacForDraw ?? 0) > 0) n += 1;
    if ((c.triggers.onAnyCreatureDiesDrain ?? 0) > 0) n += 1;
    if ((c.triggers.onYourCreatureDiesDraw ?? 0) > 0) n += 1;
  }
  return n;
}

// ---------- Removal targeting ----------

/**
 * Priority score for spot removal targeting. Higher = better target.
 * Order: wincon pieces → commanders → sac outlets / drain / repeatable
 * value engines → biggest creature.
 */
export function removalTargetScore(
  card: CardProfile,
  isCommander: boolean,
): number {
  let s = 0;
  if (card.isAltWincon) s += 100;
  if (isCommander) s += 60;
  if ((card.triggers.sacForMana ?? 0) > 0) s += 45;
  if ((card.triggers.sacForDraw ?? 0) > 0) s += 30;
  if ((card.triggers.onAnyCreatureDiesDrain ?? 0) > 0) s += 40;
  if ((card.triggers.onYourCreatureDiesDraw ?? 0) > 0) s += 30;
  if (card.drawsCards > 0 && card.isPermanent) s += 25;
  if (card.manaPerTurn >= 2) s += 20;
  s += card.power * 2; // tiebreak on board pressure
  return s;
}

export interface RemovalTarget {
  card: CardProfile;
  controller: PlayerState;
}

/**
 * Pick the top N removal targets across all opponents, ordered by
 * `removalTargetScore`. Returns at most N pairs of (card, controller).
 */
export function chooseRemovalTargets(
  others: readonly PlayerState[],
  count: number,
): RemovalTarget[] {
  const candidates: RemovalTarget[] = [];
  for (const opp of others) {
    if (opp.lossReason !== "") continue;
    for (const c of opp.permanents) {
      if (!c.isCreature) continue;
      candidates.push({ card: c, controller: opp });
    }
    // Commander on the battlefield is also a valid target.
    if (opp.commanderInPlay && opp.commander?.isCreature) {
      candidates.push({ card: opp.commander, controller: opp });
    }
  }
  candidates.sort(
    (a, b) =>
      removalTargetScore(b.card, b.card === b.controller.commander) -
      removalTargetScore(a.card, a.card === a.controller.commander),
  );
  return candidates.slice(0, count);
}

// ---------- Combat math ----------

export function attackerPower(p: PlayerState): number {
  let s = 0;
  for (const c of p.permanents) if (c.isCreature) s += c.power;
  if (p.commanderInPlay && p.commander?.isCreature) s += p.commander.power;
  return s;
}

export function defenderPower(p: PlayerState): number {
  // Defender's blockers can absorb roughly half their power per our
  // combat model. The "effective defense" estimate.
  return Math.floor(attackerPower(p) * 0.5);
}

/**
 * Estimate damage `attacker` would deal to `target` if it swings all-in.
 * Mirrors the engine's combat math (smallest attackers blocked first).
 */
export function estimateCombatDamage(
  attacker: PlayerState,
  target: PlayerState,
): number {
  const ap = attackerPower(attacker);
  const dp = defenderPower(target);
  return Math.max(0, ap - dp);
}

export function canLethal(attacker: PlayerState, target: PlayerState): boolean {
  return estimateCombatDamage(attacker, target) >= target.life;
}

// ---------- Reactive mana reservation ----------

/**
 * How much mana the player wants to keep untapped this turn for
 * counters / instant-speed removal. Bracket-aware:
 *   - B1-2: don't bother (loose play)
 *   - B3+: reserve enough for the cheapest counter in hand if a
 *     real threat is on the table or an opponent looks combo-ready
 */
export function reservedReactiveMana(
  player: PlayerState,
  others: readonly PlayerState[],
  bracket: 1 | 2 | 3 | 4 | 5,
): number {
  if (bracket <= 2) return 0;
  const counters = player.hand.filter((c) => c.isCounter);
  if (counters.length === 0) return 0;

  // Only reserve when there's something to fear.
  const anyComboRisk = others.some(
    (o) => o.lossReason === "" && comboRiskScore(o) >= 1,
  );
  const anyBigBoard = others.some(
    (o) =>
      o.lossReason === "" &&
      (attackerPower(o) >= 6 || threatScore(o) >= 30),
  );
  if (!anyComboRisk && !anyBigBoard) return 0;

  let cheapest = Infinity;
  for (const c of counters) {
    if (c.cmc < cheapest) cheapest = c.cmc;
  }
  if (!Number.isFinite(cheapest)) return 0;

  // cEDH always holds counters up; B3-4 hold up only when they have
  // multiple counters or the combo risk is high.
  if (bracket >= 5) return cheapest;
  if (counters.length >= 2 || anyComboRisk) return cheapest;
  return 0;
}
