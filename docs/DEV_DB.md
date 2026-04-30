# Local dev database

The Prisma schema targets **PostgreSQL** in production. For local dev you
have two options.

## Option A — Postgres (recommended; matches prod)

1. Have a local Postgres running (Docker is easiest):
   ```bash
   docker run --name cda-pg -e POSTGRES_PASSWORD=dev \
     -e POSTGRES_DB=cda -p 5432:5432 -d postgres:16
   ```
2. Set in `.env`:
   ```
   DATABASE_URL="postgresql://postgres:dev@localhost:5432/cda?schema=public"
   ```
3. `npx prisma migrate dev`

## Option B — SQLite (zero-setup)

SQLite has no enum / array support, so the schema's `categoriesJson`
column is already designed to be portable. To use SQLite:

1. Edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   (Also remove or simplify the `Json` columns on `Analysis` / `Playtest`
   if SQLite raises validator errors — Prisma supports `Json` on SQLite
   via `String` mapping but the type is preserved.)
2. Set in `.env`:
   ```
   DATABASE_URL="file:./dev.db"
   ```
3. `npx prisma migrate dev`

The `.gitignore` already excludes `prisma/dev.db` so the SQLite file stays
out of version control.

## Why a JSON-encoded `categoriesJson` instead of `String[]`?

The brief sketch uses `String[]`, which is Postgres-only. A JSON-encoded
string column round-trips cleanly between Postgres and SQLite, and the
typed accessor in `src/lib/db/card.ts` keeps consumers honest. When the
project commits to Postgres for production deploy, we can ship a follow-up
migration that converts to `text[]` if there's a real performance need
(unlikely — the column is small and rarely queried).
