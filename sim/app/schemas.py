"""Pydantic schemas for the simulator API.

These are the wire types the Next.js side will POST. Keep them in sync with
the TypeScript types in src/lib/sim/types.ts.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SimDeckCard(BaseModel):
    name: str
    oracle_id: str
    quantity: int = 1
    is_commander: bool = False


class SimDeck(BaseModel):
    name: str
    commander: str
    color_identity: str  # subset of "WUBRG"
    cards: list[SimDeckCard]
    bracket: int | None = None
    archetype: str | None = None


class SimulateRequest(BaseModel):
    deck: SimDeck
    opponents: list[SimDeck] = Field(default_factory=list)
    games: int = 1
    seed: int | None = None
    pod_size: Literal[2, 3, 4] = 4
    max_turns: int = 15


class TurnEvent(BaseModel):
    turn: int
    player: str
    text: str  # short, e.g. "Played Sol Ring + Arcane Signet"


class GameResult(BaseModel):
    winner: str | None  # None = stalemate / max turns reached
    turns: int
    log: list[TurnEvent]
    failure_mode: str | None = None  # for the user's deck only


class AggregateReport(BaseModel):
    games: int
    win_rate: float
    avg_turns: float
    mulligan_rate: float
    avg_commander_turn: float | None
    avg_first_wincon_turn: float | None
    failure_modes: dict[str, int]


class SimulateResponse(BaseModel):
    games: list[GameResult]
    aggregate: AggregateReport
    notes: list[str] = Field(default_factory=list)
