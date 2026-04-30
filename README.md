# Commander Deck Analyzer

Web app that analyzes and playtests **Magic: The Gathering Commander (EDH)**
decks. Paste a decklist, get curve / category breakdown / EDHrec comparison /
combo detection / bracket estimate, then run a heuristic playtest sim against
opponents in your bracket. Pricing in CAD via Face à Face Games.

> Mid-bracket EDH (2–3) by default. Not cEDH-only.

## Status

**Phase 1 — MVP scaffold.** Step 1 of 10 (project skeleton) is complete.
Next: Scryfall bulk-data downloader + local card cache.

See `docs/PLAN.md` and the original brief for the full roadmap.

## Stack

| Layer    | Choice                                       |
| -------- | -------------------------------------------- |
| Frontend | Next.js 14 (App Router) + TypeScript strict  |
| Styling  | Tailwind CSS                                 |
| DB / ORM | Prisma + PostgreSQL (SQLite for local dev)   |
| Sim      | Python FastAPI microservice (`sim/`)         |
| Hosting  | Vercel (web) + Railway/Fly.io (sim)          |

## Repo layout

```
commander-deck-analyzer/
├── src/
│   ├── app/                 Next.js App Router pages
│   └── lib/
│       └── db/              Prisma client + typed accessors
├── prisma/
│   └── schema.prisma        Postgres-targeted schema, SQLite-portable
├── sim/                     Python FastAPI playtest simulator
│   ├── app/
│   ├── tests/
│   └── pyproject.toml
├── config/
│   ├── banned-list.json     Commander banned list (verify before prod)
│   └── game-changers.json   WotC Game Changers + fast mana + tutors
├── docs/
│   └── DEV_DB.md            Postgres vs SQLite for local dev
└── public/
```

## Getting started

```bash
npm install
cp .env.example .env         # fill in DATABASE_URL etc.
npm run dev                  # http://localhost:3000
```

For the simulator service (Phase 2 — skeleton only right now):

```bash
cd sim
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
```

## Conventions

- **TypeScript strict mode**, `noUncheckedIndexedAccess` on. No `any`.
- **Python**: type hints, ruff + black + mypy strict.
- **Card names** must match Scryfall canonical capitalization exactly.
- **Card data** is always verified against Scryfall — never trust model
  memory for oracle text or legality.
- **External attribution** — cite "via Scryfall / EDHrec / Spellbook"
  anywhere their data is shown. Never reproduce paragraphs of their
  content verbatim.

## Data sources

| Source        | Use                                          |
| ------------- | -------------------------------------------- |
| Scryfall      | Card text, mana cost, color identity, prices |
| EDHrec        | Inclusion %, average decks per commander     |
| Spellbook     | Combo detection (`/find-my-combos/`)         |
| Moxfield API  | Decklist URL ingestion                       |
| Archidekt API | Decklist URL ingestion                       |
| Face à Face   | CAD pricing (Phase 3, scraper)               |
