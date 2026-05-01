// Heuristic playtest engine.
//
// Honest about what this is: a coarse approximation, not a real MTG
// rules engine. We model:
//   - Card draw, mulligan (London, 1 mull cap), land drops
//   - Mana production (lands + rocks + dorks; treated as colorless)
//   - Casting from hand by priority (ramp > cheap > threats > wincons)
//   - Reactive interaction: counters / spot removal at probabilistic
//     rates ('politics')
//   - Combat: attacker hits the lowest-life opponent for
//     max(0, attackerPower - 0.5 * defenderPower). Commander damage
//     tracked for the 21-damage win condition.
//   - Win checks: life ≤ 0, library out, 21 commander damage,
//     alt-wincon resolved (Thoracle / Approach), 15-turn stalemate cap.
//
// What we do NOT model:
//   - Color screws (mana base produces "colorless mana" only — we
//     compare CMC, not pip requirements).
//   - Stack interactions, blockers, instants on opponents' turns.
//   - Hexproof, indestructible, replacement effects.
//   - Discard, mill targeting beyond library-out.
//
// Result: the simulator gives a directional read on how often the deck
// stabilizes / closes, not a deterministic match prediction.

import { shouldKeepHand, sortByPriority, availableMana, pickLandToPlay, chooseCombatTarget, pickInteraction } from "./decisions";
import { makeRng, shuffle, type Rng } from "./rng";
import type {
  CardProfile,
  GameResult,
  PlayerArchetype,
  PlayerState,
  TurnEvent,
} from "./types";

const STARTING_LIFE = 40;
const STARTING_HAND_SIZE = 7;
const COMMANDER_DAMAGE_LETHAL = 21;

interface RunGameOptions {
  userDeck: CardProfile[];
  opponents: PlayerArchetype[];
  rng: Rng;
  maxTurns: number;
}

function newPlayer(
  id: string,
  archetype: string,
  isUser: boolean,
  deck: CardProfile[],
): PlayerState {
  // Find the commander before shuffling.
  const cmdrIdx = deck.findIndex((c) => c.isCommander);
  const commander = cmdrIdx >= 0 ? deck[cmdrIdx] ?? null : null;
  const library = deck.filter((c) => !c.isCommander);
  return {
    id,
    isUser,
    archetype,
    life: STARTING_LIFE,
    lossReason: "",
    library,
    hand: [],
    graveyard: [],
    lands: [],
    permanents: [],
    commander,
    commanderInPlay: false,
    commanderTax: 0,
    commanderDamageTo: {},
    mulligansTaken: 0,
    firstWinconAttemptTurn: null,
    commanderCastTurn: null,
  };
}

function drawCards(p: PlayerState, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i += 1) {
    const top = p.library.shift();
    if (!top) {
      // Library out — losing condition checked elsewhere; we just stop.
      break;
    }
    p.hand.push(top);
    drawn += 1;
  }
  return drawn;
}

/**
 * London mulligan: shuffle, draw 7, decide keep/mull. If mull, send the
 * whole hand back, shuffle, draw 7 again — at depth N you put N cards
 * on the bottom. We cap at 1 mull and skip the bottom-cards step (the
 * sim doesn't care about deck order beyond the next few draws).
 */
function mulligan(p: PlayerState, rng: Rng): void {
  for (let depth = 0; depth <= 1; depth += 1) {
    p.library.push(...p.hand);
    p.hand = [];
    shuffle(p.library, rng);
    drawCards(p, STARTING_HAND_SIZE);
    if (shouldKeepHand(p.hand, depth)) {
      p.mulligansTaken = depth;
      return;
    }
  }
  p.mulligansTaken = 1;
}

function alivePlayers(players: readonly PlayerState[]): PlayerState[] {
  return players.filter((p) => p.lossReason === "");
}

/** Apply spell-on-cast effects. */
function applyOnCast(
  caster: PlayerState,
  card: CardProfile,
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  // Card draw.
  if (card.drawsCards > 0) {
    drawCards(caster, card.drawsCards);
  }
  // Land ramp — fetch a land from library to battlefield (we don't
  // distinguish basics vs. nonbasics here; pick the first land we find).
  if (card.rampsLands > 0) {
    let placed = 0;
    for (let i = caster.library.length - 1; i >= 0 && placed < card.rampsLands; i -= 1) {
      const c = caster.library[i];
      if (c?.isLand) {
        caster.library.splice(i, 1);
        caster.lands.push(c);
        placed += 1;
      }
    }
    // Reshuffle after a tutor.
    // (We don't carry a Rng through here; deterministic order is fine
    //  for the heuristic's purposes.)
  }
  // Removal / wipe — kill `killsCreatures` opposing creatures.
  if (card.killsCreatures > 0) {
    const targets = others
      .filter((p) => p.lossReason === "")
      .flatMap((p) => p.permanents.filter((x) => x.isCreature).map((x) => ({ p, x })));
    if (card.killsCreatures >= 99) {
      // Wipe — kill every creature (including caster's; symmetric).
      for (const owner of others) {
        // Move creature permanents to graveyard.
        const remaining: CardProfile[] = [];
        for (const c of owner.permanents) {
          if (c.isCreature) owner.graveyard.push(c);
          else remaining.push(c);
        }
        owner.permanents = remaining;
      }
      const remaining: CardProfile[] = [];
      for (const c of caster.permanents) {
        if (c.isCreature) caster.graveyard.push(c);
        else remaining.push(c);
      }
      caster.permanents = remaining;
      log.push({ turn, playerId: caster.id, text: `${card.name} wipes the board` });
    } else {
      // Spot removal — pick the biggest creature among opponents.
      targets.sort((a, b) => b.x.power - a.x.power);
      let killed = 0;
      for (const t of targets) {
        if (killed >= card.killsCreatures) break;
        const idx = t.p.permanents.indexOf(t.x);
        if (idx >= 0) {
          t.p.permanents.splice(idx, 1);
          t.p.graveyard.push(t.x);
          killed += 1;
        }
      }
      if (killed > 0) {
        log.push({
          turn,
          playerId: caster.id,
          text: `${card.name} kills ${killed} creature${killed === 1 ? "" : "s"}`,
        });
      }
    }
  }
}

/**
 * Try to cast `card` from `caster.hand`. Pays mana (deducting from a
 * mana pool we track turn-by-turn). Returns true if cast resolved.
 *
 * Reactive interaction: each opponent gets a chance to counter via
 * `pickInteraction`. If countered, the spell goes to graveyard and we
 * still pay the mana.
 */
function tryCast(
  caster: PlayerState,
  card: CardProfile,
  manaPool: { value: number },
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
  rng: Rng,
): boolean {
  if (card.cmc > manaPool.value) return false;

  const isWincon = card.isAltWincon;
  // Probabilistic counter check across opponents.
  let countered = false;
  for (const op of others) {
    if (op.lossReason !== "") continue;
    const idx = pickInteraction(op, card.power, isWincon, rng);
    if (idx < 0) continue;
    const reactCard = op.hand[idx];
    if (!reactCard) continue;
    // Only counter actually counters; remove-from-hand removal can't
    // hit a spell that's resolving — we use it later.
    if (reactCard.isCounter) {
      op.hand.splice(idx, 1);
      op.graveyard.push(reactCard);
      manaPool.value -= card.cmc;
      caster.graveyard.push(card);
      log.push({
        turn,
        playerId: caster.id,
        text: `${card.name} countered by ${op.id} (${reactCard.name})`,
      });
      countered = true;
      break;
    }
  }
  if (countered) return true; // turn-pass effects still apply (spell happened)

  manaPool.value -= card.cmc;
  if (card.isCommander) {
    caster.commanderInPlay = true;
    caster.commanderCastTurn = caster.commanderCastTurn ?? turn;
    caster.permanents.push(card);
    log.push({ turn, playerId: caster.id, text: `Cast ${card.name} (commander)` });
  } else if (card.isPermanent) {
    if (card.isLand) caster.lands.push(card);
    else caster.permanents.push(card);
    log.push({ turn, playerId: caster.id, text: `Cast ${card.name}` });
  } else {
    // Sorcery / instant — to graveyard after resolving.
    caster.graveyard.push(card);
    log.push({ turn, playerId: caster.id, text: `Cast ${card.name}` });
  }

  if (isWincon) {
    caster.firstWinconAttemptTurn = caster.firstWinconAttemptTurn ?? turn;
  }

  applyOnCast(caster, card, others, log, turn);
  return true;
}

function castCommanderIfAble(
  caster: PlayerState,
  manaPool: { value: number },
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
  rng: Rng,
): void {
  if (caster.commanderInPlay) return;
  const cmdr = caster.commander;
  if (!cmdr) return;
  const cost = cmdr.cmc + caster.commanderTax;
  if (manaPool.value < cost) return;
  // We pay the tax separately so the rest of the pipeline still treats
  // CMC as the cast cost.
  manaPool.value -= caster.commanderTax;
  // tryCast will pay the base cmc itself.
  const wasCast = tryCast(caster, { ...cmdr, isCommander: true }, manaPool, others, log, turn, rng);
  if (wasCast) caster.commanderTax += 2;
}

function castSpellsFromHand(
  caster: PlayerState,
  manaPool: { value: number },
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
  rng: Rng,
): void {
  // Iterate in priority order. Use a copy of hand we mutate.
  while (manaPool.value > 0) {
    const ordered = sortByPriority(caster.hand, turn);
    let cast = false;
    for (const card of ordered) {
      if (card.isLand) continue;
      if (card.cmc > manaPool.value) continue;
      const idx = caster.hand.indexOf(card);
      if (idx < 0) continue;
      caster.hand.splice(idx, 1);
      const ok = tryCast(caster, card, manaPool, others, log, turn, rng);
      if (ok) {
        cast = true;
        break;
      }
    }
    if (!cast) break;
  }
}

function combatPhase(
  active: PlayerState,
  players: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  const target = chooseCombatTarget(active.id, players);
  if (!target) return;
  let attackerPower = 0;
  let commanderPower = 0;
  for (const c of active.permanents) {
    if (c.isCreature) attackerPower += c.power;
  }
  if (active.commanderInPlay && active.commander?.isCreature) {
    attackerPower += active.commander.power;
    commanderPower += active.commander.power;
  }
  if (attackerPower <= 0) return;

  let defenderPower = 0;
  for (const c of target.permanents) {
    if (c.isCreature) defenderPower += c.power;
  }
  if (target.commanderInPlay && target.commander?.isCreature) {
    defenderPower += target.commander.power;
  }
  const damage = Math.max(0, Math.floor(attackerPower - 0.5 * defenderPower));
  if (damage <= 0) return;

  target.life -= damage;
  // Commander damage proportional to commander's share of attack.
  if (commanderPower > 0) {
    const cmdrShare = Math.floor((commanderPower / attackerPower) * damage);
    target.commanderDamageTo[active.id] =
      (target.commanderDamageTo[active.id] ?? 0) + cmdrShare;
  }
  log.push({
    turn,
    playerId: active.id,
    text: `Attacks ${target.id} for ${damage} (life ${target.life})`,
  });
}

function checkLossConditions(p: PlayerState, log: TurnEvent[], turn: number): void {
  if (p.lossReason !== "") return;
  if (p.life <= 0) {
    p.lossReason = "life";
    log.push({ turn, playerId: p.id, text: "Loses (life ≤ 0)" });
    return;
  }
  // Commander damage from any single opponent ≥ 21.
  for (const v of Object.values(p.commanderDamageTo)) {
    if (v >= COMMANDER_DAMAGE_LETHAL) {
      p.lossReason = "commander_damage";
      log.push({ turn, playerId: p.id, text: "Loses (commander damage)" });
      return;
    }
  }
  // We treat library-out as loss-on-next-draw, but the engine counts a
  // failed draw as the trigger.
}

function checkAltWin(
  active: PlayerState,
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): boolean {
  // If the active player attempted a wincon spell this turn AND it
  // resolved (we know because their graveyard has it), they win.
  // Phase 1 simplification: the alt-win triggers immediately when the
  // wincon card is cast. (Thoracle requires library-empty to actually
  // win; we approximate with "if Demonic Consultation or similar was
  // cast same turn", but for now any altWincon cast = win.)
  for (const c of active.graveyard) {
    if (c.isAltWincon) {
      // Find this turn's cast.
      log.push({ turn, playerId: active.id, text: `Wins via ${c.name}` });
      for (const op of others) {
        if (op.lossReason === "") op.lossReason = "alt_win_by_opponent";
      }
      return true;
    }
  }
  return false;
}

export function runGame(opts: RunGameOptions): GameResult {
  const { rng, maxTurns } = opts;

  const players: PlayerState[] = [
    newPlayer("P1", "user", true, opts.userDeck.slice()),
    ...opts.opponents.map((opp, i) =>
      newPlayer(`P${i + 2}`, opp.name, false, opp.deck.slice()),
    ),
  ];
  for (const p of players) {
    shuffle(p.library, rng);
    drawCards(p, STARTING_HAND_SIZE);
    mulligan(p, rng);
  }

  const log: TurnEvent[] = [];
  let turn = 0;

  while (turn < maxTurns) {
    turn += 1;
    for (let pi = 0; pi < players.length; pi += 1) {
      const active = players[pi]!;
      if (active.lossReason !== "") continue;

      // Untap + draw.
      const drewCount = drawCards(active, turn === 1 && pi === 0 ? 0 : 1);
      if (drewCount === 0 && turn > 1) {
        active.lossReason = "library";
        log.push({ turn, playerId: active.id, text: "Loses (library out)" });
      }
      if (active.lossReason !== "") continue;

      // Land drop.
      const landIdx = pickLandToPlay(active.hand);
      if (landIdx >= 0) {
        const land = active.hand.splice(landIdx, 1)[0]!;
        active.lands.push(land);
      }

      const manaPool = { value: availableMana(active) };

      // Commander first if affordable.
      const others = players.filter((p) => p !== active);
      castCommanderIfAble(active, manaPool, others, log, turn, rng);
      // Then everything else.
      castSpellsFromHand(active, manaPool, others, log, turn, rng);

      // Combat.
      combatPhase(active, players, log, turn);

      // Check loss conditions for everyone.
      for (const p of players) checkLossConditions(p, log, turn);
      // Alt-win check.
      if (checkAltWin(active, others, log, turn)) {
        return finalize(active, players, log, turn);
      }

      const alive = alivePlayers(players);
      if (alive.length <= 1) {
        return finalize(alive[0] ?? null, players, log, turn);
      }
    }
  }
  // Stalemate — nobody won by maxTurns.
  return finalize(null, players, log, turn);
}

function finalize(
  winner: PlayerState | null,
  players: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): GameResult {
  const lossReasons: Record<string, string> = {};
  for (const p of players) lossReasons[p.id] = p.lossReason;
  const user = players.find((p) => p.isUser);
  return {
    winner: winner ? winner.id : null,
    turns: turn,
    log,
    lossReasons,
    userCommanderTurn: user?.commanderCastTurn ?? null,
    userFirstWinconTurn: user?.firstWinconAttemptTurn ?? null,
    userMulligans: user?.mulligansTaken ?? 0,
  };
}

export function runGameWithSeed(opts: {
  userDeck: CardProfile[];
  opponents: PlayerArchetype[];
  seed: number;
  maxTurns?: number;
}): GameResult {
  return runGame({
    userDeck: opts.userDeck,
    opponents: opts.opponents,
    rng: makeRng(opts.seed),
    maxTurns: opts.maxTurns ?? 15,
  });
}
