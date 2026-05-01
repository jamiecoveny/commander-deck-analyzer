# Implementation plan

Mirrors the brief's "First Tasks" section. **Pause for review after step 5.**

| # | Task | Status |
|---|------|--------|
| 1 | Scaffold Next.js + Prisma + Tailwind; FastAPI service skeleton | ✅ Done |
| 2 | Scryfall bulk-data downloader + local card cache | ✅ Done |
| 3 | Decklist parser + validator (paste → structured Deck) | ✅ Done |
| 4 | Rules-based card classifier with overrides table | ✅ Done |
| 5 | Analytics dashboard route + UI | ✅ Done (PAUSE for review) |
| 6 | Spellbook combo integration | ✅ Done |
| 7 | Simulator skeleton w/ one archetype-template opponent | ⏳ Next |
| 8 | Recommendations engine (no pricing) | |
| 9 | Face à Face price scraper + integrate into recommendations | |
| 10 | Auth, saved decks, comparison page | |

## Phase boundaries

- **Phase 1 (MVP)**: steps 1–5, 8 (no pricing). End: a user can paste a deck
  and see analytics + recommendations.
- **Phase 2 (Playtest)**: step 7 with real engine; card profiles for top 500.
- **Phase 3 (Polish)**: step 9 + auth + URL ingestion + comparison.
- **Phase 4 (Stretch)**: bracket-matched opponent pool, pod evaluator, PDF.

## Open decisions logged so far

- **Postgres vs SQLite**: schema is portable, Postgres is the prod target,
  SQLite is the zero-setup local-dev option. See `docs/DEV_DB.md`.
- **`categoriesJson` vs `String[]`**: stored as JSON-encoded text for
  cross-DB portability. Typed accessor in `src/lib/db/card.ts`.
- **Banned list / Game Changers list**: hardcoded JSON in `config/`,
  marked `lastVerified: null` until cross-checked against the live WotC
  source. Re-verify on every Scryfall bulk-data sync.
- **Python**: not yet installed on dev box. Sim service skeleton is in
  place but cannot be run/tested until Python 3.11+ is installed. This is
  fine — Phase 1 doesn't depend on the sim.
- **stream-json import path**: bundler-mode TS doesn't auto-append `.js`
  to the resolved target of stream-json's `"./*": "./src/*"` exports
  wildcard, so we use `stream-json/parser.js` and
  `stream-json/streamers/stream-array.js` explicitly. (Aside: the legacy
  `@types/stream-json` from DefinitelyTyped was uninstalled — v2 ships
  its own bundled types.)
