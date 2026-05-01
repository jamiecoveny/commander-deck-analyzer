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
| 7 | Simulator skeleton w/ one archetype-template opponent | ✅ Done |
| 8 | Recommendations engine + EDHrec inclusion-% comparison (no pricing) | ✅ Done |
| 9 | Face à Face price scraper + integrate into recommendations | ❌ Canceled (user opted to price manually; F2F robots.txt disallows /search) |
| 10 | Saved decks (anonymous session) + library + comparison page | ✅ Done (NextAuth deferred per brief's "optional for MVP" note) |

## Phase boundaries

- **Phase 1 (MVP)**: steps 1–5, 8 — ✅ done.
- **Phase 2 (Playtest)**: step 7 (heuristic sim, TS not Python) — ✅ done.
- **Phase 3 (Polish)**: step 10 (saved decks + library + compare) — ✅ done.
  Step 9 (CAD pricing) canceled by user. URL ingestion (Moxfield/Archidekt)
  not implemented; the parser handles paste-text, which covers most uses.
- **Phase 4 (Stretch)**: bracket-matched opponent pool, pod evaluator,
  PDF export, real auth — not started. None blocked anything in 1–8.

## Future work

- **Real auth**: NextAuth email magic links. Today the app uses an
  anonymous session cookie (`cda_session_id`) → User row binding. To
  migrate, keep the User table, add an `email` field, and let an authed
  user inherit decks owned by their old session id.
- **Postgres in production**: switch the prisma datasource provider
  back to `postgresql` and re-migrate. The schema is portable; the only
  Postgres-only feature in use is the `Json` columns on Analysis /
  Playtest, which Prisma handles transparently on both.
- **URL ingestion**: parse Moxfield + Archidekt deck URLs into the
  paste-text format. Moxfield ToS warns against bulk pulls but
  user-pasted URLs are fine.
- **Bracket estimator**: detect Game Changers / fast mana / MLD / early
  combos and assign Bracket 2–5. The config files are already in place
  (`config/banned-list.json`, `config/game-changers.json`).
- **F2F CAD pricing**: build a name → product-handle index from their
  public sitemap (no `/search`), then use Shopify's `/products/<handle>.json`.
  Robots.txt allows that path. Keep cached 24h.
- **EDHrec category-count comparison**: their JSON exposes type-line
  counts but not "average ramp count." Computing it requires fetching
  the average deck JSON and re-classifying — doable, deferred.

## Open decisions logged so far

- **Postgres vs SQLite**: schema is portable, Postgres is the prod target,
  SQLite is the zero-setup local-dev option. See `docs/DEV_DB.md`.
- **`categoriesJson` vs `String[]`**: stored as JSON-encoded text for
  cross-DB portability. Typed accessor in `src/lib/db/card.ts`.
- **Banned list / Game Changers list**: hardcoded JSON in `config/`,
  marked `lastVerified: null` until cross-checked against the live WotC
  source. Re-verify on every Scryfall bulk-data sync.
- **Python sim service deferred indefinitely.** Step 7 implemented the
  heuristic simulator in TypeScript instead. The sim/ FastAPI scaffold
  stays for future use (a real rules engine via Forge would justify
  Python), but Phase 1's heuristic playtest doesn't need IPC overhead
  or numpy — it's pure decision logic over a coarse game state. The
  Python skeleton remains untested.
- **stream-json import path**: bundler-mode TS doesn't auto-append `.js`
  to the resolved target of stream-json's `"./*": "./src/*"` exports
  wildcard, so we use `stream-json/parser.js` and
  `stream-json/streamers/stream-array.js` explicitly. (Aside: the legacy
  `@types/stream-json` from DefinitelyTyped was uninstalled — v2 ships
  its own bundled types.)
