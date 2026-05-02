// Public surface for the heuristic playtest simulator.

export { runGame, runGameWithSeed } from "./engine";
export { simulate, type SimulateOptions } from "./aggregate";
export { buildProfile, expandProfiles, type ProfileInput } from "./profiles";
export {
  bracket2Core,
  bracket3Midrange,
  bracket4Optimized,
  bracket5CEDH,
} from "./opponents";
export { getBracketProfile } from "./bracket";
export type {
  AggregateReport,
  BracketProfile,
  CardProfile,
  GameResult,
  PlayerArchetype,
  PlayerState,
  SimulateRequest,
  SimulateResponse,
  TriggerProfile,
  TurnEvent,
} from "./types";
