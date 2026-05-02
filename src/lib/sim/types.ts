// Heuristic playtest simulator types.
//
// The simulator is intentionally not a full MTG rules engine — see
// docs/PLAN.md and the brief's §9. The card profile is a coarse model
// that captures: how much mana the card produces per turn (rocks/dorks),
// how many lands it ramps, how many cards it draws on cast, how many
// creatures it kills, plus combat stats.

import type { CardCategory } from "@/lib/db/card";

/**
 * Pre-cast requirements that aren't part of the mana cost. The engine
 * blocks the cast when any of these aren't satisfiable; meeting them
 * also consumes the listed resources (sac the creature, discard the
 * card, pay the life).
 *
 * Examples:
 *   - Culling the Weak: { sacCreatures: 1 }
 *   - Diabolic Intent:  { sacCreatures: 1 }
 *   - Reanimate:        { discardCards: 0, anyGraveCreatures: 1 }
 *                       (cost is "pay life equal to..."; we approximate
 *                        with anyGraveCreatures since that's the real
 *                        gating constraint for whether you cast it)
 *   - Victimize:        { ownGraveCreatures: 1 }
 *                       (text reads "two creature cards" but it's
 *                        castable with 1 — second is optional)
 */
export interface CastPrerequisites {
  sacCreatures: number;
  sacLands: number;
  /** Cards in hand other than this spell required as discard cost. */
  discardCards: number;
  /** Caller life must be greater than this value. */
  payLife: number;
  /** Creature cards in caster's own graveyard. */
  ownGraveCreatures: number;
  /** Creature cards in any graveyard (caster + opponents). */
  anyGraveCreatures: number;
}

export const NO_PREREQUISITES: CastPrerequisites = {
  sacCreatures: 0,
  sacLands: 0,
  discardCards: 0,
  payLife: 0,
  ownGraveCreatures: 0,
  anyGraveCreatures: 0,
};

/**
 * On-cast / on-death / repeatable triggers that the engine fires when
 * the relevant event occurs. Heuristic — we don't model the full set,
 * just the patterns that drive most EDH game shape: death drains, ETB
 * value, and sac outlets.
 */
export interface TriggerProfile {
  /** Whenever any creature dies (caster or opponent), drain N from
   *  each opponent. (Zulaport Cutthroat-style.) */
  onAnyCreatureDiesDrain?: number;
  /** Whenever another creature you control dies, draw a card.
   *  (Yawgmoth-style with payment caveats elided.) */
  onYourCreatureDiesDraw?: number;
  /** When this enters the battlefield, draw N cards. */
  onEtbDraw?: number;
  /** When this enters the battlefield, kill N creatures. (Reclamation
   *  Sage-style — we approximate to "destroy a permanent".) */
  onEtbKills?: number;
  /** When this enters the battlefield, ramp N lands from library. */
  onEtbRamps?: number;
  /** Sacrifice a creature: add N mana of any color. (Phyrexian Altar,
   *  Ashnod's Altar.) Used as a free mana source on the active player's
   *  turn after they have spare creatures. */
  sacForMana?: number;
  /** Sacrifice a creature: draw a card / scry. (Viscera Seer
   *  approximated as a draw.) */
  sacForDraw?: number;
}

export interface CardProfile {
  oracleId: string;
  name: string;
  cmc: number;
  /** WUBRG-sorted color identity letters needed to cast (subset). */
  manaCostColors: string;
  categories: readonly CardCategory[];
  isLand: boolean;
  isCreature: boolean;
  isPermanent: boolean;
  isCommander: boolean;
  power: number;
  toughness: number;
  /** WUBRG colors this land/rock can produce. "C" for colorless-only.
   *  "" for non-mana sources. (Sol Ring → "C", Forest → "G",
   *  Watery Grave → "UB", City of Brass → "WUBRG"). */
  producesColors: string;
  /** Net mana per turn this provides while in play (Sol Ring=2, Signet=1, Cultivate=0 — Cultivate ramps a land). */
  manaPerTurn: number;
  /** Lands gained when cast (Cultivate=1, Three Visits=1, Skyshroud Claim=2). */
  rampsLands: number;
  /** Cards drawn when cast (Divination=2, Wheel="hand"). */
  drawsCards: number;
  /** Creatures killed when cast. 99 = wipe. */
  killsCreatures: number;
  /** True if this card alt-wins (Approach, Thoracle, Lab Maniac, Coalition Victory). */
  isAltWincon: boolean;
  /** True if this is a counterspell. */
  isCounter: boolean;
  /** Non-mana costs and graveyard requirements (Phase A). */
  prerequisites: CastPrerequisites;
  /** Death / ETB / sac-outlet triggers (Phase C). */
  triggers: TriggerProfile;
}

/**
 * Bracket profile (Phase B+C). Drives AI behavior per WotC bracket
 * 1–5. Loaded from config/bracket-profiles.json.
 */
export interface BracketProfile {
  bracket: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Turn the engine considers as a stalemate cap (median expected end). */
  expectedEndTurn: number;
  /** Win-mix targets: relative weights for AI hand-priority bias. */
  winMix: {
    combat: number;
    combo: number;
    stax: number;
    other: number;
  };
  /** Probability the AI reacts to an opponent's wincon-priority spell. */
  reactToWinconProb: number;
  /** Probability the AI reacts to an opponent's medium threat (>=6 power). */
  reactToThreatProb: number;
  /** Mulligan strictness multiplier on the keep-hand threshold.
   *  >1 = stricter, <1 = looser. Used by `shouldKeepHand`. */
  mulliganStrictness: number;
  /** Soft cap on max turns a player will let a game drag. */
  maxTurns: number;
}

export interface PlayerState {
  id: string;
  isUser: boolean;
  archetype: string;
  /** WotC bracket — drives this player's AI behavior. */
  bracket: 1 | 2 | 3 | 4 | 5;
  life: number;
  /** Set when this player loses; "" while alive. */
  lossReason: string;

  library: CardProfile[];
  hand: CardProfile[];
  graveyard: CardProfile[];

  lands: CardProfile[];
  permanents: CardProfile[];

  commander: CardProfile | null;
  commanderInPlay: boolean;
  /** Number of times the commander has died/been cast — adds 2 each time. */
  commanderTax: number;
  /** Damage from commander combat dealt to each opponent id. */
  commanderDamageTo: Record<string, number>;

  mulligansTaken: number;
  /** First turn this deck attempted a wincon (cast Thoracle, etc.). */
  firstWinconAttemptTurn: number | null;
  commanderCastTurn: number | null;
}

export interface TurnEvent {
  turn: number;
  playerId: string;
  text: string;
}

export interface GameResult {
  winner: string | null; // player id, or null = stalemate
  turns: number;
  log: TurnEvent[];
  /** Per-player loss reasons (the user's especially). Keyed by player id. */
  lossReasons: Record<string, string>;
  /** User-deck observability: turn the commander first hit play. */
  userCommanderTurn: number | null;
  userFirstWinconTurn: number | null;
  userMulligans: number;
}

export interface AggregateReport {
  games: number;
  /** Win count for the user's deck. */
  userWins: number;
  winRate: number;
  /** Win counts keyed by archetype (user + opponents). */
  winsByArchetype: Record<string, number>;
  avgTurns: number;
  /** Average turn the user's commander first hit play; null = never. */
  avgCommanderTurn: number | null;
  avgFirstWinconTurn: number | null;
  mulliganRate: number;
  /** Histogram of the user's loss reasons. */
  failureModes: Record<string, number>;
}

export interface SimulateRequest {
  /** Player decklist as profiles. The first profile with isCommander=true is the commander. */
  userDeck: CardProfile[];
  /** Bracket the user's deck is treated as (drives the user's own AI behavior). */
  userBracket?: 1 | 2 | 3 | 4 | 5;
  /** One opponent per pod slot. Phase-1 default: 3 generic Bracket-3 templates. */
  opponents: PlayerArchetype[];
  games: number;
  seed?: number;
  /** Cap on turns — beyond this we declare a stalemate. */
  maxTurns?: number;
}

export interface PlayerArchetype {
  name: string;
  /** Pre-built deck profile for this opponent. */
  deck: CardProfile[];
  /** WotC bracket — drives AI behavior. Defaults to 3 if unset. */
  bracket?: 1 | 2 | 3 | 4 | 5;
}

export interface SimulateResponse {
  games: GameResult[];
  aggregate: AggregateReport;
  /** Caveats / honest disclaimers about the heuristic model. */
  notes: string[];
}
