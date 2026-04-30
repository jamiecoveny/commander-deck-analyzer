import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { NormalizedCard } from "./normalize";
import { streamAndUpsert, syncBulkData, type CardUpserter } from "./sync";

const FIXTURE = join(__dirname, "__fixtures__", "mini-bulk.json");

class CollectingUpserter implements CardUpserter {
  public batches: NormalizedCard[][] = [];
  async upsertBatch(batch: NormalizedCard[]): Promise<void> {
    // Defensive copy so test assertions see the snapshot at call time.
    this.batches.push([...batch]);
  }
  get flat(): NormalizedCard[] {
    return this.batches.flat();
  }
}

describe("streamAndUpsert", () => {
  it("streams the fixture and upserts only valid playable cards", async () => {
    const upserter = new CollectingUpserter();
    const result = await streamAndUpsert(FIXTURE, upserter, { batchSize: 3 });

    // The fixture has 7 entries; 1 is a token and 0 lack oracle_id, so 6
    // are real cards. (Treasure Token also has no oracle_id, so it gets
    // skipped twice over — schema validation catches it as zod-unparseable
    // because oracle_id is optional, but normalize() rejects layout: 'token'.)
    expect(result.processed).toBe(6);
    expect(result.skipped).toBe(1);
    expect(upserter.flat).toHaveLength(6);

    const names = upserter.flat.map((c) => c.name).sort();
    expect(names).toEqual([
      "Atraxa, Praetors' Voice",
      "Brain Freeze",
      "Brazen Borrower // Petty Theft",
      "Cultivate",
      "Sol Ring",
      "Wear // Tear",
    ]);
  });

  it("respects the batchSize parameter", async () => {
    const upserter = new CollectingUpserter();
    await streamAndUpsert(FIXTURE, upserter, { batchSize: 2 });
    // 6 processed cards / 2 per batch = 3 batches.
    expect(upserter.batches).toHaveLength(3);
    expect(upserter.batches[0]).toHaveLength(2);
    expect(upserter.batches[1]).toHaveLength(2);
    expect(upserter.batches[2]).toHaveLength(2);
  });
});

describe("syncBulkData (with bulkSourceFile)", () => {
  it("uses the local file, upserts, and writes a manifest", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "cda-scryfall-"));
    try {
      const upserter = new CollectingUpserter();
      const result = await syncBulkData({
        upserter,
        cacheDir,
        bulkSourceFile: FIXTURE,
      });
      expect(result.status).toBe("synced");
      expect(result.cardsProcessed).toBe(6);
      expect(result.manifest.oracleCardsUpdatedAt).toBe("local-fixture");

      const manifest = JSON.parse(
        await readFile(join(cacheDir, "manifest.json"), "utf8"),
      ) as { cardCount: number };
      expect(manifest.cardCount).toBe(6);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
