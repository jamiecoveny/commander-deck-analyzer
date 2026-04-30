"""FastAPI entry point for the heuristic playtest simulator.

This is a Phase 1 skeleton. The real /simulate logic lands in Phase 2 once
the analytics pipeline on the Next.js side is producing card profiles.
"""

from __future__ import annotations

from fastapi import FastAPI

from . import __version__
from .schemas import (
    AggregateReport,
    GameResult,
    SimulateRequest,
    SimulateResponse,
)

app = FastAPI(
    title="Commander Deck Analyzer — Sim Service",
    version=__version__,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest) -> SimulateResponse:
    """Phase 1 stub.

    Returns an empty aggregate so the front-end can integration-test the
    request/response shape end-to-end before Phase 2 fills in the engine.
    """

    placeholder_games: list[GameResult] = [
        GameResult(winner=None, turns=0, log=[], failure_mode=None)
        for _ in range(req.games)
    ]

    aggregate = AggregateReport(
        games=req.games,
        win_rate=0.0,
        avg_turns=0.0,
        mulligan_rate=0.0,
        avg_commander_turn=None,
        avg_first_wincon_turn=None,
        failure_modes={},
    )

    return SimulateResponse(
        games=placeholder_games,
        aggregate=aggregate,
        notes=[
            "Phase 1 skeleton: simulator engine not yet implemented.",
            "Returns deterministic empty results for wiring/integration tests.",
        ],
    )
