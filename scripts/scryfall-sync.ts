#!/usr/bin/env tsx
// CLI entry: `npm run scryfall:sync`
//
// Pulls the latest oracle-cards bulk file from Scryfall (skipping the
// download if our cached manifest already matches), then stream-upserts
// every card into the local DB.
//
// Flags:
//   --force         Re-sync even if the manifest is current.
//   --source=PATH   Read from a local JSON file instead of Scryfall (dev/test).
//   --batch=N       Override default batch size (500).

import { parseArgs } from "node:util";

import { prisma } from "@/lib/db/client";
import { PrismaCardUpserter } from "@/lib/scryfall/prismaUpserter";
import { syncBulkData } from "@/lib/scryfall/sync";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      force: { type: "boolean", default: false },
      source: { type: "string" },
      batch: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const batchSize = values.batch ? Number.parseInt(values.batch, 10) : undefined;
  if (batchSize !== undefined && (!Number.isFinite(batchSize) || batchSize <= 0)) {
    throw new Error(`--batch must be a positive integer, got ${values.batch}`);
  }

  const result = await syncBulkData({
    upserter: new PrismaCardUpserter(prisma),
    force: Boolean(values.force),
    bulkSourceFile: values.source,
    batchSize,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[scryfall:sync] failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
