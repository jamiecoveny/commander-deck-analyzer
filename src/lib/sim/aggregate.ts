// Run N games and roll the results into an AggregateReport.

import { runGame } from "./engine";
import { makeRng } from "./rng";
import type {
  AggregateReport,
  GameResult,
  PlayerArchetype,
  CardProfile,
  SimulateResponse,
} from "./types";

const DEFAULT_NOTES = [
  "Heuristic simulator — coarse approximation, not a deterministic match prediction.",
  "Color screws are not modeled; lands are treated as colorless mana.",
  "Combat: damage = max(0, attacker_power - 0.5 * defender_power); blockers are not chosen individually.",
  "Reactive interaction (counters / spot removal) fires probabilistically — politics, not optimal play.",
];

export interface SimulateOptions {
  userDeck: CardProfile[];
  opponents: PlayerArchetype[];
  games: number;
  seed?: number;
  maxTurns?: number;
}

export function simulate(opts: SimulateOptions): SimulateResponse {
  const games: GameResult[] = [];
  const baseSeed =
    opts.seed === undefined ? Math.floor(Math.random() * 0x7fffffff) : opts.seed;
  for (let i = 0; i < opts.games; i += 1) {
    // Per-game seed so a single SimulateRequest is reproducible end to end.
    const rng = makeRng(baseSeed + i);
    games.push(
      runGame({
        userDeck: opts.userDeck,
        opponents: opts.opponents,
        rng,
        maxTurns: opts.maxTurns ?? 15,
      }),
    );
  }
  return {
    games,
    aggregate: aggregate(games, opts.opponents),
    notes: DEFAULT_NOTES,
  };
}

function aggregate(
  games: readonly GameResult[],
  opponents: readonly PlayerArchetype[],
): AggregateReport {
  const winsByArchetype: Record<string, number> = { user: 0 };
  for (const op of opponents) winsByArchetype[op.name] = 0;
  let userWins = 0;
  let userMulligans = 0;
  const userCmdrTurns: number[] = [];
  const userWinconTurns: number[] = [];
  let totalTurns = 0;
  const failureModes: Record<string, number> = {};

  for (const g of games) {
    totalTurns += g.turns;
    userMulligans += g.userMulligans;
    if (g.userCommanderTurn != null) userCmdrTurns.push(g.userCommanderTurn);
    if (g.userFirstWinconTurn != null) userWinconTurns.push(g.userFirstWinconTurn);
    if (g.winner === "P1") {
      userWins += 1;
      winsByArchetype.user = (winsByArchetype.user ?? 0) + 1;
    } else if (g.winner) {
      // P2 -> opponents[0], P3 -> opponents[1], etc.
      const idx = Number.parseInt(g.winner.slice(1), 10) - 2;
      const archName = opponents[idx]?.name ?? "unknown";
      winsByArchetype[archName] = (winsByArchetype[archName] ?? 0) + 1;
    }
    const userLoss = g.lossReasons.P1;
    if (userLoss && userLoss !== "" && g.winner !== "P1") {
      failureModes[userLoss] = (failureModes[userLoss] ?? 0) + 1;
    }
  }

  const avg = (xs: readonly number[]): number | null =>
    xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;

  return {
    games: games.length,
    userWins,
    winRate: games.length > 0 ? userWins / games.length : 0,
    winsByArchetype,
    avgTurns: games.length > 0 ? totalTurns / games.length : 0,
    avgCommanderTurn: avg(userCmdrTurns),
    avgFirstWinconTurn: avg(userWinconTurns),
    mulliganRate: games.length > 0 ? userMulligans / games.length : 0,
    failureModes,
  };
}
