// Public surface for the heuristic playtest simulator.

export { runGame, runGameWithSeed } from "./engine";
export { simulate, type SimulateOptions } from "./aggregate";
export { buildProfile, expandProfiles, type ProfileInput } from "./profiles";
export { bracket3Midrange } from "./opponents";
export type {
  AggregateReport,
  CardProfile,
  GameResult,
  PlayerArchetype,
  PlayerState,
  SimulateRequest,
  SimulateResponse,
  TurnEvent,
} from "./types";
