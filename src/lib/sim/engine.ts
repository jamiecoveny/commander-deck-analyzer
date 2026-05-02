// Heuristic playtest engine.
//
// Honest about what this is: a coarse approximation, not a real MTG
// rules engine. We model:
//   - Card draw, mulligan (London, 1 mull cap), land drops
//   - Color-aware mana pool (lands + rocks; colored pip allocation)
//   - Casting from hand by priority (ramp > cheap > threats > wincons)
//     with bracket-aware win-mix bias from config/bracket-profiles.json
//   - Reactive interaction: counters / spot removal at probabilistic
//     rates that scale with the defender's bracket
//   - Combat: per-creature damage assignment with blocking, deaths,
//     death triggers, commander damage tracking
//   - Death triggers: drain (Aristocrats), draw (Yawgmoth)
//   - ETB triggers: draw, ramp, kill-on-enter
//   - Sac outlets: end-of-turn free conversions of spare creatures
//   - Win checks: life ≤ 0, library out, 21 commander damage,
//     alt-wincon resolved (Thoracle / Approach), bracket-aware turn cap.
//
// What we still do NOT model:
//   - Stack interactions, instants on opponents' turns
//   - Hexproof, indestructible, replacement effects
//   - Discard, mill targeting beyond library-out
//   - Tutoring chains beyond the basic "ramps lands" effect
//
// Result: the simulator gives a directional read on how often the deck
// stabilizes / closes, not a deterministic match prediction.

import { getBracketProfile } from "./bracket";
import {
  shouldKeepHand,
  sortByPriority,
  pickLandToPlay,
  chooseCombatTarget,
  pickInteraction,
} from "./decisions";
import { buildManaPool, ManaPool } from "./mana";
import { makeRng, shuffle, type Rng } from "./rng";
import { chooseRemovalTargets, reservedReactiveMana } from "./threats";
import type {
  BracketProfile,
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
  userBracket?: 1 | 2 | 3 | 4 | 5;
  opponents: PlayerArchetype[];
  rng: Rng;
  maxTurns: number;
}

function newPlayer(
  id: string,
  archetype: string,
  bracket: 1 | 2 | 3 | 4 | 5,
  isUser: boolean,
  deck: CardProfile[],
): PlayerState {
  const cmdrIdx = deck.findIndex((c) => c.isCommander);
  const commander = cmdrIdx >= 0 ? deck[cmdrIdx] ?? null : null;
  const library = deck.filter((c) => !c.isCommander);
  return {
    id,
    isUser,
    archetype,
    bracket,
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
    if (!top) break;
    p.hand.push(top);
    drawn += 1;
  }
  return drawn;
}

/**
 * London mulligan with bracket-aware strictness. cEDH players mull
 * harder for combo pieces; B1 players keep funkier hands.
 */
function mulligan(p: PlayerState, profile: BracketProfile, rng: Rng): void {
  const cap = profile.mulliganStrictness >= 1.3 ? 2 : 1;
  for (let depth = 0; depth <= cap; depth += 1) {
    p.library.push(...p.hand);
    p.hand = [];
    shuffle(p.library, rng);
    drawCards(p, STARTING_HAND_SIZE);
    if (shouldKeepHand(p.hand, depth, profile)) {
      p.mulligansTaken = depth;
      return;
    }
  }
  p.mulligansTaken = cap;
}

function alivePlayers(players: readonly PlayerState[]): PlayerState[] {
  return players.filter((p) => p.lossReason === "");
}

// ---------- Triggers ----------

/**
 * Fire death triggers across all players when `killed` creatures die.
 * Each creature's controller is encoded so we can fire "your creature
 * dies" triggers correctly.
 */
function fireDeathTriggers(
  killed: ReadonlyArray<{ card: CardProfile; controller: PlayerState }>,
  allPlayers: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  if (killed.length === 0) return;

  for (const player of allPlayers) {
    // "Whenever any creature dies, each opponent loses N life"
    // — fires for each death. Source must be in play (permanents).
    const drainSources = player.permanents.filter(
      (c) => (c.triggers.onAnyCreatureDiesDrain ?? 0) > 0,
    );
    if (drainSources.length > 0) {
      const totalPerDeath = drainSources.reduce(
        (sum, s) => sum + (s.triggers.onAnyCreatureDiesDrain ?? 0),
        0,
      );
      const totalDrain = totalPerDeath * killed.length;
      if (totalDrain > 0) {
        for (const opp of allPlayers) {
          if (opp === player || opp.lossReason !== "") continue;
          opp.life -= totalDrain;
        }
        // Heal the controller per death (Blood Artist / Zulaport
        // Cutthroat both gain 1 to controller too — approximate).
        player.life += totalDrain;
        log.push({
          turn,
          playerId: player.id,
          text: `Death triggers drain ${totalDrain} from each opponent (${killed.length} death${killed.length === 1 ? "" : "s"})`,
        });
      }
    }

    // "Whenever another creature you control dies, draw a card."
    const drawSources = player.permanents.filter(
      (c) => (c.triggers.onYourCreatureDiesDraw ?? 0) > 0,
    );
    if (drawSources.length > 0) {
      const ownDeaths = killed.filter((k) => k.controller === player).length;
      // "another" excludes the trigger source itself dying — approximate
      // by counting all your creature deaths.
      if (ownDeaths > 0) {
        const drawPerDeath = drawSources.reduce(
          (sum, s) => sum + (s.triggers.onYourCreatureDiesDraw ?? 0),
          0,
        );
        const totalDraw = drawPerDeath * ownDeaths;
        drawCards(player, totalDraw);
        log.push({
          turn,
          playerId: player.id,
          text: `Death triggers draw ${totalDraw} (${ownDeaths} own creature death${ownDeaths === 1 ? "" : "s"})`,
        });
      }
    }
  }
}

function fireEtbTriggers(
  card: CardProfile,
  caster: PlayerState,
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  const t = card.triggers;
  if (t.onEtbDraw) {
    drawCards(caster, t.onEtbDraw);
    log.push({
      turn,
      playerId: caster.id,
      text: `${card.name} ETB: draws ${t.onEtbDraw}`,
    });
  }
  if (t.onEtbRamps) {
    let placed = 0;
    for (let i = caster.library.length - 1; i >= 0 && placed < t.onEtbRamps; i -= 1) {
      const c = caster.library[i];
      if (c?.isLand) {
        caster.library.splice(i, 1);
        caster.lands.push(c);
        placed += 1;
      }
    }
    if (placed > 0) {
      log.push({
        turn,
        playerId: caster.id,
        text: `${card.name} ETB: ramps ${placed}`,
      });
    }
  }
  if (t.onEtbKills) {
    const killed = killOpposingCreaturesSmart(caster, others, t.onEtbKills);
    if (killed.length > 0) {
      log.push({
        turn,
        playerId: caster.id,
        text: `${card.name} ETB kills ${killed.length} creature${killed.length === 1 ? "" : "s"}`,
      });
      fireDeathTriggers(killed, [caster, ...others], log, turn);
    }
  }
}

/**
 * Kill `count` creatures via spot removal — Phase D smart targeting.
 * Uses chooseRemovalTargets which prioritizes wincons, commanders,
 * sac engines, value engines, then biggest power.
 */
function killOpposingCreaturesSmart(
  caster: PlayerState,
  others: readonly PlayerState[],
  count: number,
): Array<{ card: CardProfile; controller: PlayerState }> {
  void caster;
  const targets = chooseRemovalTargets(others, count);
  const killed: Array<{ card: CardProfile; controller: PlayerState }> = [];
  for (const t of targets) {
    // Commander on the battlefield: removing it sends to graveyard
    // (in real MTG it could go to command zone; we approximate with
    // grave + commanderInPlay = false for the upkeep tax bump).
    if (t.card === t.controller.commander) {
      if (t.controller.commanderInPlay) {
        t.controller.commanderInPlay = false;
        t.controller.graveyard.push(t.card);
        killed.push({ card: t.card, controller: t.controller });
      }
      continue;
    }
    const idx = t.controller.permanents.indexOf(t.card);
    if (idx >= 0) {
      t.controller.permanents.splice(idx, 1);
      t.controller.graveyard.push(t.card);
      killed.push({ card: t.card, controller: t.controller });
    }
  }
  return killed;
}

/** Sac outlets: at end of turn the active player may convert spare
 *  creatures into mana / draws via in-play sac outlets. Heuristic:
 *  if we have a sac outlet and ≥2 creatures, sac the smallest and
 *  fire death triggers. */
function activateSacOutlets(
  active: PlayerState,
  allPlayers: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  const outlets = active.permanents.filter(
    (c) => (c.triggers.sacForMana ?? 0) > 0 || (c.triggers.sacForDraw ?? 0) > 0,
  );
  if (outlets.length === 0) return;

  // Active player's drain triggers — outlets become win pieces here.
  const hasDrain = active.permanents.some(
    (c) => (c.triggers.onAnyCreatureDiesDrain ?? 0) > 0,
  );

  const fodder = active.permanents
    .filter((c) => c.isCreature && !outlets.includes(c))
    .sort((a, b) => a.power - b.power);

  // Only sac if we have drain triggers (otherwise sac'ing is value-neutral
  // for our heuristic — we don't model the +1 mana toward another spell
  // this turn).
  if (!hasDrain) return;

  // Sac up to 4 fodder creatures per turn — represents the burst potential.
  const toSac = fodder.slice(0, Math.min(4, fodder.length));
  if (toSac.length === 0) return;

  const killed: Array<{ card: CardProfile; controller: PlayerState }> = [];
  for (const f of toSac) {
    const idx = active.permanents.indexOf(f);
    if (idx >= 0) {
      active.permanents.splice(idx, 1);
      active.graveyard.push(f);
      killed.push({ card: f, controller: active });
    }
  }
  if (killed.length > 0) {
    log.push({
      turn,
      playerId: active.id,
      text: `Sac outlet activates ${killed.length} time${killed.length === 1 ? "" : "s"}`,
    });
    fireDeathTriggers(killed, allPlayers, log, turn);
  }
}

// ---------- Cast resolution ----------

function meetsPrerequisites(
  caster: PlayerState,
  others: readonly PlayerState[],
  card: CardProfile,
): boolean {
  const p = card.prerequisites;
  if (p.sacCreatures > 0) {
    const onBoard = caster.permanents.filter((c) => c.isCreature).length;
    const cmdr =
      caster.commanderInPlay && caster.commander?.isCreature ? 1 : 0;
    if (onBoard + cmdr < p.sacCreatures) return false;
  }
  if (p.sacLands > 0 && caster.lands.length < p.sacLands) return false;
  if (p.discardCards > 0) {
    if (caster.hand.length - 1 < p.discardCards) return false;
  }
  if (p.payLife > 0 && caster.life <= p.payLife) return false;
  if (p.ownGraveCreatures > 0) {
    const n = caster.graveyard.filter((c) => c.isCreature).length;
    if (n < p.ownGraveCreatures) return false;
  }
  if (p.anyGraveCreatures > 0) {
    let n = caster.graveyard.filter((c) => c.isCreature).length;
    for (const o of others) {
      n += o.graveyard.filter((c) => c.isCreature).length;
    }
    if (n < p.anyGraveCreatures) return false;
  }
  return true;
}

function consumePrerequisites(
  caster: PlayerState,
  card: CardProfile,
  allPlayers: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): void {
  const p = card.prerequisites;
  const killed: Array<{ card: CardProfile; controller: PlayerState }> = [];

  if (p.sacCreatures > 0) {
    const creatures = caster.permanents
      .filter((c) => c.isCreature)
      .sort((a, b) => a.power - b.power);
    let remaining = p.sacCreatures;
    for (const c of creatures) {
      if (remaining <= 0) break;
      const idx = caster.permanents.indexOf(c);
      if (idx >= 0) {
        caster.permanents.splice(idx, 1);
        caster.graveyard.push(c);
        killed.push({ card: c, controller: caster });
        remaining -= 1;
        log.push({
          turn,
          playerId: caster.id,
          text: `${card.name}: sacrifices ${c.name}`,
        });
      }
    }
    if (remaining > 0 && caster.commanderInPlay && caster.commander?.isCreature) {
      caster.commanderInPlay = false;
      log.push({
        turn,
        playerId: caster.id,
        text: `${card.name}: sacrifices commander (${caster.commander.name})`,
      });
    }
  }
  if (p.sacLands > 0) {
    let remaining = p.sacLands;
    while (remaining > 0 && caster.lands.length > 0) {
      const land = caster.lands.shift();
      if (!land) break;
      caster.graveyard.push(land);
      remaining -= 1;
    }
  }
  if (p.discardCards > 0) {
    const ordered = [...caster.hand]
      .filter((c) => c !== card)
      .sort((a, b) => b.cmc - a.cmc);
    for (let n = 0; n < p.discardCards && n < ordered.length; n += 1) {
      const target = ordered[n]!;
      const idx = caster.hand.indexOf(target);
      if (idx >= 0) {
        caster.hand.splice(idx, 1);
        caster.graveyard.push(target);
      }
    }
  }
  if (p.payLife > 0) {
    caster.life -= p.payLife;
  }

  // Sacrifices fire death triggers.
  if (killed.length > 0) {
    fireDeathTriggers(killed, allPlayers, log, turn);
  }
}

interface CastContext {
  caster: PlayerState;
  pool: ManaPool;
  allPlayers: PlayerState[];
  others: PlayerState[];
  log: TurnEvent[];
  turn: number;
  rng: Rng;
}

function tryCast(card: CardProfile, ctx: CastContext): boolean {
  if (!ctx.pool.pay(card)) return false;

  if (!meetsPrerequisites(ctx.caster, ctx.others, card)) {
    // Refund mana — we already paid above. The simplest correct
    // refund: rebuild the pool from current state. But that loses
    // any existing taps. Easier: re-construct the pool after a
    // failed cast at the next iteration. For now we re-tap by
    // marking sources available.
    for (const s of ctx.pool.sources) s.available = true;
    return false;
  }

  // Probabilistic counter check across opponents.
  const isWincon = card.isAltWincon;
  let countered = false;
  for (const op of ctx.others) {
    if (op.lossReason !== "") continue;
    const profile = getBracketProfile(op.bracket);
    const idx = pickInteraction(op, ctx.caster, card.power, isWincon, profile, ctx.rng);
    if (idx < 0) continue;
    const reactCard = op.hand[idx];
    if (!reactCard) continue;
    if (reactCard.isCounter) {
      op.hand.splice(idx, 1);
      op.graveyard.push(reactCard);
      ctx.caster.graveyard.push(card);
      ctx.log.push({
        turn: ctx.turn,
        playerId: ctx.caster.id,
        text: `${card.name} countered by ${op.id} (${reactCard.name})`,
      });
      countered = true;
      break;
    }
  }
  if (countered) return true;

  consumePrerequisites(ctx.caster, card, ctx.allPlayers, ctx.log, ctx.turn);

  if (card.isCommander) {
    ctx.caster.commanderInPlay = true;
    ctx.caster.commanderCastTurn = ctx.caster.commanderCastTurn ?? ctx.turn;
    ctx.caster.permanents.push(card);
    ctx.log.push({ turn: ctx.turn, playerId: ctx.caster.id, text: `Cast ${card.name} (commander)` });
  } else if (card.isPermanent) {
    if (card.isLand) ctx.caster.lands.push(card);
    else ctx.caster.permanents.push(card);
    ctx.log.push({ turn: ctx.turn, playerId: ctx.caster.id, text: `Cast ${card.name}` });
  } else {
    ctx.caster.graveyard.push(card);
    ctx.log.push({ turn: ctx.turn, playerId: ctx.caster.id, text: `Cast ${card.name}` });
  }

  if (isWincon) {
    ctx.caster.firstWinconAttemptTurn = ctx.caster.firstWinconAttemptTurn ?? ctx.turn;
  }

  applyOnCast(card, ctx);
  if (card.isPermanent) fireEtbTriggers(card, ctx.caster, ctx.others, ctx.log, ctx.turn);
  return true;
}

function applyOnCast(card: CardProfile, ctx: CastContext): void {
  if (card.drawsCards > 0) {
    drawCards(ctx.caster, card.drawsCards);
  }
  if (card.rampsLands > 0) {
    let placed = 0;
    for (let i = ctx.caster.library.length - 1; i >= 0 && placed < card.rampsLands; i -= 1) {
      const c = ctx.caster.library[i];
      if (c?.isLand) {
        ctx.caster.library.splice(i, 1);
        ctx.caster.lands.push(c);
        placed += 1;
      }
    }
  }
  if (card.killsCreatures > 0) {
    if (card.killsCreatures >= 99) {
      // Wipe — kill every creature (caster's and opponents').
      const killed: Array<{ card: CardProfile; controller: PlayerState }> = [];
      for (const owner of ctx.allPlayers) {
        const remaining: CardProfile[] = [];
        for (const c of owner.permanents) {
          if (c.isCreature) {
            owner.graveyard.push(c);
            killed.push({ card: c, controller: owner });
          } else {
            remaining.push(c);
          }
        }
        owner.permanents = remaining;
      }
      if (killed.length > 0) {
        ctx.log.push({
          turn: ctx.turn,
          playerId: ctx.caster.id,
          text: `${card.name} wipes ${killed.length} creature${killed.length === 1 ? "" : "s"}`,
        });
        fireDeathTriggers(killed, ctx.allPlayers, ctx.log, ctx.turn);
      }
    } else {
      const killed = killOpposingCreaturesSmart(ctx.caster, ctx.others, card.killsCreatures);
      if (killed.length > 0) {
        ctx.log.push({
          turn: ctx.turn,
          playerId: ctx.caster.id,
          text: `${card.name} kills ${killed.length} creature${killed.length === 1 ? "" : "s"}`,
        });
        fireDeathTriggers(killed, ctx.allPlayers, ctx.log, ctx.turn);
      }
    }
  }
}

function castCommanderIfAble(ctx: CastContext): void {
  if (ctx.caster.commanderInPlay) return;
  const cmdr = ctx.caster.commander;
  if (!cmdr) return;
  // Pay tax separately from mana cost: model as additional generic
  // mana taps from the pool before the regular cast.
  let taxToPay = ctx.caster.commanderTax;
  while (taxToPay > 0) {
    const src = ctx.pool.sources.find((s) => s.available);
    if (!src) return; // can't afford tax
    src.available = false;
    taxToPay -= 1;
  }
  const cmdrCopy: CardProfile = { ...cmdr, isCommander: true };
  const wasCast = tryCast(cmdrCopy, ctx);
  if (wasCast) ctx.caster.commanderTax += 2;
}

function castSpellsFromHand(ctx: CastContext, profile: BracketProfile): void {
  // Phase D: reserve mana for reactive interaction. cEDH players
  // always hold up their cheapest counter; B3-4 hold up when there's
  // a real threat or combo risk on the table.
  const reserve = reservedReactiveMana(
    ctx.caster,
    ctx.others,
    profile.bracket,
  );

  // Bracket-aware ordering — combo decks tutor + cast wincons earlier;
  // combat decks prefer threats.
  while (ctx.pool.available > 0) {
    const ordered = sortByPriority(ctx.caster.hand, ctx.turn, profile);
    let cast = false;
    const usableMana = ctx.pool.available - reserve;
    for (const card of ordered) {
      if (card.isLand) continue;
      // Skip if casting this would dip below the reserve. Counterspells
      // are exempt — they ARE the reserve.
      const ceiling = card.isCounter ? ctx.pool.available : usableMana;
      if (card.cmc > ceiling) continue;
      const idx = ctx.caster.hand.indexOf(card);
      if (idx < 0) continue;
      ctx.caster.hand.splice(idx, 1);
      const ok = tryCast(card, ctx);
      if (ok) {
        cast = true;
        break;
      }
      // tryCast returned false (mana-color screwed or prereqs failed).
      // Put the card back and try the next priority.
      ctx.caster.hand.push(card);
    }
    if (!cast) break;
  }
}

// ---------- Combat ----------

interface Combatant {
  card: CardProfile;
  /** True if currently alive (not yet died this combat). */
  alive: boolean;
}

/**
 * Build the active player's attacker list. Includes commander when it's
 * a creature on the board.
 */
function listAttackers(active: PlayerState): Combatant[] {
  const out: Combatant[] = active.permanents
    .filter((c) => c.isCreature)
    .map((c) => ({ card: c, alive: true }));
  if (active.commanderInPlay && active.commander?.isCreature) {
    out.push({ card: active.commander, alive: true });
  }
  return out;
}

function listBlockers(target: PlayerState): Combatant[] {
  const out: Combatant[] = target.permanents
    .filter((c) => c.isCreature)
    .map((c) => ({ card: c, alive: true }));
  if (target.commanderInPlay && target.commander?.isCreature) {
    out.push({ card: target.commander, alive: true });
  }
  return out;
}

/**
 * Per-creature combat with blocker assignment. Defender uses the
 * biggest blockers against the smallest unblocked attackers (leaves
 * big attackers through to the face). Excess attacker damage goes to
 * the defender's life.
 */
function combatPhase(
  active: PlayerState,
  allPlayers: readonly PlayerState[],
  profile: BracketProfile,
  log: TurnEvent[],
  turn: number,
): Array<{ card: CardProfile; controller: PlayerState }> {
  void profile; // bracket may shape combat aggression in Phase D

  const target = chooseCombatTarget(active.id, allPlayers);
  if (!target) return [];

  const attackers = listAttackers(active);
  if (attackers.length === 0) return [];
  const blockers = listBlockers(target);

  // Sort attackers descending by power (biggest swing first; smallest
  // are the ones most likely to be blocked).
  attackers.sort((a, b) => b.card.power - a.card.power);
  // Sort blockers descending by toughness — defender uses the biggest.
  blockers.sort((a, b) => b.card.toughness - a.card.toughness);

  const deaths: Array<{ card: CardProfile; controller: PlayerState }> = [];

  // Simple block plan: defender blocks half their creatures (rounded
  // down) against the smallest attackers. The smallest attackers are
  // at the END of the (descending) attacker list.
  const blockerCount = Math.floor(blockers.length / 2);
  const blocked = attackers.slice(-blockerCount); // smallest N attackers
  const unblocked = attackers.slice(0, attackers.length - blockerCount);

  // Resolve blocks pairwise.
  for (let i = 0; i < blockerCount; i += 1) {
    const att = blocked[i];
    const def = blockers[i];
    if (!att || !def) continue;
    if (att.card.power >= def.card.toughness) {
      // Blocker dies.
      const idx = target.permanents.indexOf(def.card);
      if (idx >= 0) {
        target.permanents.splice(idx, 1);
        target.graveyard.push(def.card);
        deaths.push({ card: def.card, controller: target });
      } else if (target.commander === def.card) {
        target.commanderInPlay = false;
        deaths.push({ card: def.card, controller: target });
      }
      def.alive = false;
    }
    if (def.card.power >= att.card.toughness) {
      // Attacker dies.
      const idx = active.permanents.indexOf(att.card);
      if (idx >= 0) {
        active.permanents.splice(idx, 1);
        active.graveyard.push(att.card);
        deaths.push({ card: att.card, controller: active });
      } else if (active.commander === att.card) {
        active.commanderInPlay = false;
        deaths.push({ card: att.card, controller: active });
      }
      att.alive = false;
    }
  }

  // Unblocked attackers deal damage to the defender's life. Commander
  // damage tracked separately for the 21-point rule.
  let damage = 0;
  let cmdrDamage = 0;
  for (const a of unblocked) {
    if (!a.alive) continue;
    damage += a.card.power;
    if (active.commander === a.card) {
      cmdrDamage += a.card.power;
    }
  }
  if (damage > 0) {
    target.life -= damage;
    if (cmdrDamage > 0) {
      target.commanderDamageTo[active.id] =
        (target.commanderDamageTo[active.id] ?? 0) + cmdrDamage;
    }
    log.push({
      turn,
      playerId: active.id,
      text: `Attacks ${target.id} for ${damage} (life ${target.life})`,
    });
  }

  if (deaths.length > 0) {
    log.push({
      turn,
      playerId: active.id,
      text: `${deaths.length} creature${deaths.length === 1 ? "" : "s"} died in combat`,
    });
    fireDeathTriggers(deaths, allPlayers, log, turn);
  }

  return deaths;
}

// ---------- Win checks ----------

function checkLossConditions(p: PlayerState, log: TurnEvent[], turn: number): void {
  if (p.lossReason !== "") return;
  if (p.life <= 0) {
    p.lossReason = "life";
    log.push({ turn, playerId: p.id, text: "Loses (life ≤ 0)" });
    return;
  }
  for (const v of Object.values(p.commanderDamageTo)) {
    if (v >= COMMANDER_DAMAGE_LETHAL) {
      p.lossReason = "commander_damage";
      log.push({ turn, playerId: p.id, text: "Loses (commander damage)" });
      return;
    }
  }
}

function checkAltWin(
  active: PlayerState,
  others: readonly PlayerState[],
  log: TurnEvent[],
  turn: number,
): boolean {
  for (const c of active.graveyard) {
    if (c.isAltWincon) {
      log.push({ turn, playerId: active.id, text: `Wins via ${c.name}` });
      for (const op of others) {
        if (op.lossReason === "") op.lossReason = "alt_win_by_opponent";
      }
      return true;
    }
  }
  return false;
}

// ---------- Top-level game ----------

export function runGame(opts: RunGameOptions): GameResult {
  const { rng } = opts;

  const userBracket = opts.userBracket ?? 3;
  const userProfile = getBracketProfile(userBracket);

  const players: PlayerState[] = [
    newPlayer("P1", "user", userBracket, true, opts.userDeck.slice()),
    ...opts.opponents.map((opp, i) =>
      newPlayer(
        `P${i + 2}`,
        opp.name,
        opp.bracket ?? 3,
        false,
        opp.deck.slice(),
      ),
    ),
  ];
  for (const p of players) {
    shuffle(p.library, rng);
    drawCards(p, STARTING_HAND_SIZE);
    mulligan(p, getBracketProfile(p.bracket), rng);
  }

  const log: TurnEvent[] = [];
  let turn = 0;

  // Cap on game length: median of bracket maxTurns + opts.maxTurns
  // floor. Lower-bracket pods drag longer, cEDH pods end fast.
  const allBrackets = players.map((p) => getBracketProfile(p.bracket).maxTurns);
  const dynamicCap = Math.min(opts.maxTurns, Math.max(...allBrackets));

  while (turn < dynamicCap) {
    turn += 1;
    for (let pi = 0; pi < players.length; pi += 1) {
      const active = players[pi]!;
      if (active.lossReason !== "") continue;
      const profile = getBracketProfile(active.bracket);
      void userProfile;

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

      const others = players.filter((p) => p !== active);
      const ctx: CastContext = {
        caster: active,
        pool: buildManaPool(active.lands, active.permanents),
        allPlayers: players,
        others,
        log,
        turn,
        rng,
      };

      castCommanderIfAble(ctx);
      castSpellsFromHand(ctx, profile);
      combatPhase(active, players, profile, log, turn);
      activateSacOutlets(active, players, log, turn);

      for (const p of players) checkLossConditions(p, log, turn);
      if (checkAltWin(active, others, log, turn)) {
        return finalize(active, players, log, turn);
      }

      const alive = alivePlayers(players);
      if (alive.length <= 1) {
        return finalize(alive[0] ?? null, players, log, turn);
      }
    }
  }
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
  userBracket?: 1 | 2 | 3 | 4 | 5;
  opponents: PlayerArchetype[];
  seed: number;
  maxTurns?: number;
}): GameResult {
  return runGame({
    userDeck: opts.userDeck,
    userBracket: opts.userBracket,
    opponents: opts.opponents,
    rng: makeRng(opts.seed),
    maxTurns: opts.maxTurns ?? 15,
  });
}
