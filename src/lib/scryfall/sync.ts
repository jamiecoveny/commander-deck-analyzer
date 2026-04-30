// Scryfall bulk-data sync.
//
// 1. Hit /bulk-data, find the `oracle_cards` entry.
// 2. If `updated_at` matches our manifest, no-op.
// 3. Stream-download the bulk JSON to a temp file (it's ~500 MB; we don't
//    want to buffer it in memory).
// 4. Stream-parse the JSON array, normalize each entry, batch-upsert into
//    the Card table.
// 5. Persist a manifest with the new `updated_at`.
//
// We separate I/O from logic by accepting a `fetcher` and a `prisma`-like
// upserter via dependency injection — the streaming parser is unit-testable
// without touching the network or the DB.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { chain } from "stream-chain";
// stream-json's package.json exports use a `"./*": "./src/*"` wildcard
// without a `.js` suffix, and TS bundler resolution doesn't auto-append
// the extension on the matched target. Importing with the explicit `.js`
// suffix lets the wildcard expand cleanly to `./src/parser.js`.
import parser from "stream-json/parser.js";
import streamArray from "stream-json/streamers/stream-array.js";

import { normalize, type NormalizedCard } from "./normalize";
import {
  BulkDataListSchema,
  ScryfallCardSchema,
  type BulkDataListItem,
} from "./types";

export const SCRYFALL_BULK_DATA_URL = "https://api.scryfall.com/bulk-data";

const DEFAULT_USER_AGENT =
  "commander-deck-analyzer/0.1 (+https://github.com/local; contact: dev@example.com)";

const DEFAULT_BATCH_SIZE = 500;

export interface SyncManifest {
  oracleCardsUpdatedAt: string; // ISO from Scryfall
  syncedAt: string; // ISO of our last successful sync
  cardCount: number;
  bytes: number;
}

export interface SyncResult {
  status: "skipped" | "synced";
  manifest: SyncManifest;
  cardsProcessed: number;
  cardsSkipped: number;
}

export interface CardUpserter {
  upsertBatch(batch: NormalizedCard[]): Promise<void>;
}

export interface SyncOptions {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  upserter: CardUpserter;
  batchSize?: number;
  userAgent?: string;
  log?: (msg: string) => void;
  // For tests: skip the real network and use this local file as the bulk
  // data source instead.
  bulkSourceFile?: string;
  // For tests: skip the manifest comparison and force a re-sync.
  force?: boolean;
}

const DEFAULT_LOG = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[scryfall] ${msg}`);
};

async function readManifest(path: string): Promise<SyncManifest | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as SyncManifest;
  } catch {
    return null;
  }
}

async function writeManifest(path: string, m: SyncManifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(m, null, 2), "utf8");
}

async function fetchOracleCardsItem(
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<BulkDataListItem> {
  const r = await fetchImpl(SCRYFALL_BULK_DATA_URL, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    throw new Error(`scryfall bulk-data list failed: ${r.status} ${r.statusText}`);
  }
  const json = (await r.json()) as unknown;
  const list = BulkDataListSchema.parse(json);
  const item = list.data.find((d) => d.type === "oracle_cards");
  if (!item) {
    throw new Error('scryfall bulk-data list did not include "oracle_cards"');
  }
  return item;
}

async function downloadToFile(
  url: string,
  dest: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<number> {
  const r = await fetchImpl(url, {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!r.ok || !r.body) {
    throw new Error(`scryfall bulk download failed: ${r.status} ${r.statusText}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  // Atomic-ish write via .tmp then rename.
  const tmp = `${dest}.partial`;
  await pipeline(
    Readable.fromWeb(r.body as never),
    createWriteStream(tmp),
  );
  const s = await stat(tmp);
  await rename(tmp, dest);
  return s.size;
}

/**
 * Stream-parse a Scryfall bulk JSON file and feed normalized cards to the
 * upserter in fixed-size batches. Yields counts for the caller to log.
 */
export async function streamAndUpsert(
  filePath: string,
  upserter: CardUpserter,
  opts: { batchSize?: number; log?: (msg: string) => void } = {},
): Promise<{ processed: number; skipped: number }> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const log = opts.log ?? ((): void => {});

  let processed = 0;
  let skipped = 0;
  let batch: NormalizedCard[] = [];

  const stream = chain([
    createReadStream(filePath),
    parser(),
    streamArray(),
  ]);

  for await (const chunk of stream) {
    const value: unknown = (chunk as { value: unknown }).value;
    const parsed = ScryfallCardSchema.safeParse(value);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const normalized = normalize(parsed.data);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    batch.push(normalized);
    if (batch.length >= batchSize) {
      await upserter.upsertBatch(batch);
      processed += batch.length;
      if (processed % (batchSize * 10) === 0) {
        log(`upserted ${processed} cards (${skipped} skipped)`);
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    await upserter.upsertBatch(batch);
    processed += batch.length;
  }

  return { processed, skipped };
}

/**
 * Top-level orchestrator: check manifest, download if stale, stream-upsert,
 * persist new manifest.
 */
export async function syncBulkData(opts: SyncOptions): Promise<SyncResult> {
  const cacheDir = opts.cacheDir ?? join(process.cwd(), "data", "scryfall");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const userAgent =
    opts.userAgent ?? process.env.HTTP_USER_AGENT ?? DEFAULT_USER_AGENT;
  const log = opts.log ?? DEFAULT_LOG;
  const manifestPath = join(cacheDir, "manifest.json");
  const bulkPath = join(cacheDir, "oracle-cards.json");

  let item: BulkDataListItem | null = null;
  let bulkFile = bulkPath;

  if (opts.bulkSourceFile) {
    bulkFile = opts.bulkSourceFile;
    log(`using local bulk source: ${bulkFile}`);
  } else {
    item = await fetchOracleCardsItem(fetchImpl, userAgent);
    log(`scryfall oracle_cards updated_at=${item.updated_at}`);
  }

  if (!opts.force && item) {
    const existing = await readManifest(manifestPath);
    if (existing && existing.oracleCardsUpdatedAt === item.updated_at) {
      log("manifest is current; skipping download");
      return {
        status: "skipped",
        manifest: existing,
        cardsProcessed: 0,
        cardsSkipped: 0,
      };
    }
  }

  let bytes = 0;
  if (item) {
    log(`downloading ${item.download_uri}`);
    bytes = await downloadToFile(item.download_uri, bulkPath, fetchImpl, userAgent);
    log(`downloaded ${bytes} bytes to ${bulkPath}`);
  } else if (opts.bulkSourceFile) {
    const s = await stat(opts.bulkSourceFile);
    bytes = s.size;
  }

  const { processed, skipped } = await streamAndUpsert(
    bulkFile,
    opts.upserter,
    { batchSize: opts.batchSize, log },
  );

  const manifest: SyncManifest = {
    oracleCardsUpdatedAt: item?.updated_at ?? "local-fixture",
    syncedAt: new Date().toISOString(),
    cardCount: processed,
    bytes,
  };
  await writeManifest(manifestPath, manifest);

  log(`done: processed=${processed} skipped=${skipped}`);
  return { status: "synced", manifest, cardsProcessed: processed, cardsSkipped: skipped };
}
