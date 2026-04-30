#!/usr/bin/env tsx
// CLI entry: `npm run classify`
//
// Streams all rows from the Card table, runs the classifier, and writes
// the resulting categories back into Card.categoriesJson. Idempotent —
// safe to re-run after editing rules.ts or classifier-overrides.json.
//
// Flags:
//   --limit=N      Classify only the first N rows (smoke testing).
//   --dry-run      Don't write back; print the changes-by-category table.

import { parseArgs } from "node:util";

import {
  classify,
  loadClassifierOverrides,
  type ClassifyOptions,
} from "@/lib/classifier";
import { serializeCategories } from "@/lib/db/card";
import { prisma } from "@/lib/db/client";

const PAGE_SIZE = 1000;

interface RunStats {
  scanned: number;
  changed: number;
  byCategory: Record<string, number>;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      limit: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const limit = values.limit ? Number.parseInt(values.limit, 10) : Infinity;
  if (Number.isNaN(limit) || limit < 0) {
    throw new Error(`--limit must be a non-negative integer, got ${values.limit}`);
  }
  const dryRun = Boolean(values["dry-run"]);

  const overrides = await loadClassifierOverrides();
  const opts: ClassifyOptions = { overrides };

  const stats: RunStats = { scanned: 0, changed: 0, byCategory: {} };
  let cursor: string | undefined;
  let pageNumber = 0;

  while (stats.scanned < limit) {
    const take = Math.min(PAGE_SIZE, limit - stats.scanned);
    const page = await prisma.card.findMany({
      take,
      ...(cursor ? { cursor: { oracleId: cursor }, skip: 1 } : {}),
      orderBy: { oracleId: "asc" },
      select: {
        oracleId: true,
        name: true,
        typeLine: true,
        oracleText: true,
        categoriesJson: true,
      },
    });
    if (page.length === 0) break;

    pageNumber += 1;
    const updates: Array<{ oracleId: string; categoriesJson: string }> = [];

    for (const row of page) {
      stats.scanned += 1;
      const cats = classify(row, opts);
      for (const c of cats) {
        stats.byCategory[c] = (stats.byCategory[c] ?? 0) + 1;
      }
      const next = serializeCategories(cats);
      if (next !== row.categoriesJson) {
        updates.push({ oracleId: row.oracleId, categoriesJson: next });
      }
    }

    if (!dryRun && updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.card.update({
            where: { oracleId: u.oracleId },
            data: { categoriesJson: u.categoriesJson },
          }),
        ),
      );
    }
    stats.changed += updates.length;

    cursor = page[page.length - 1]?.oracleId;
    // eslint-disable-next-line no-console
    console.log(
      `[classify] page=${pageNumber} scanned=${stats.scanned} changed=${stats.changed}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ...stats, dryRun }, null, 2));
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[classify] failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
