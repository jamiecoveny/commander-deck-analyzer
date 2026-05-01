// Heuristic playtest simulator types.
//
// The simulator is intentionally not a full MTG rules engine — see
// docs/PLAN.md and the brief's §9. The card profile is a coarse model
// that captures: how much mana the card produces per turn (rocks/dorks),
// how many lands it ramps, how many cards it draws on cast, how many
// creatures it kills, plus combat stats.

import type { CardCategory } from "@/lib/db/card";

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
}

export interface PlayerState {
  id: string;
  isUser: boolean;
  archetype: string;
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
}

export interface SimulateResponse {
  games: GameResult[];
  aggregate: AggregateReport;
  /** Caveats / honest disclaimers about the heuristic model. */
  notes: string[];
}
