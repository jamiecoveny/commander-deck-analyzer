# cda-sim — Commander Deck Analyzer Simulator Service

FastAPI microservice that runs heuristic playtests for the Commander Deck
Analyzer. **Approximate simulation, not a true MTG rules engine** — see the
project root brief for the design constraints.

## Status

**Phase 1 skeleton.** `/health` works; `/simulate` returns an empty,
deterministic placeholder so the front-end can wire up the request shape.
The actual engine lands in Phase 2 once the Next.js analytics pipeline is
producing card profiles for the top ~1000 EDH cards.

## Requirements

- Python **3.11+** (not yet installed on the dev box — install before Phase 2).
- A virtualenv tool (`venv` is fine).

## Setup

```bash
cd sim
python -m venv .venv
source .venv/bin/activate    # macOS/Linux
.venv\Scripts\activate       # Windows
pip install -e ".[dev]"
```

## Run

```bash
uvicorn app.main:app --reload --port 8001
```

Then `GET http://localhost:8001/health`.

## Test

```bash
pytest
ruff check .
black --check .
mypy app
```

## API

- `GET  /health` → `{"status": "ok", "version": "..."}`
- `POST /simulate` — see `app/schemas.py` for the request/response shape.
  Mirror these in `src/lib/sim/types.ts` on the Next.js side.
