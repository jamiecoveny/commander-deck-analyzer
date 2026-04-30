// Production CardUpserter that talks to Prisma. Kept in its own module so
// the streaming layer in sync.ts can be unit-tested without pulling Prisma
// into the test graph.

import type { PrismaClient } from "@prisma/client";

import type { NormalizedCard } from "./normalize";
import type { CardUpserter } from "./sync";

export class PrismaCardUpserter implements CardUpserter {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertBatch(batch: NormalizedCard[]): Promise<void> {
    if (batch.length === 0) return;

    // We use a transaction of upserts. createMany would be faster but
    // doesn't support upsert semantics on Postgres without `skipDuplicates`,
    // and that loses updated price/edhrecRank/text data on existing rows.
    await this.prisma.$transaction(
      batch.map((c) =>
        this.prisma.card.upsert({
          where: { oracleId: c.oracleId },
          create: {
            oracleId: c.oracleId,
            name: c.name,
            manaCost: c.manaCost,
            cmc: c.cmc,
            typeLine: c.typeLine,
            oracleText: c.oracleText,
            colorIdentity: c.colorIdentity,
            edhrecRank: c.edhrecRank,
            priceUsd: c.priceUsd,
            priceUpdatedAt: c.priceUsd != null ? new Date() : null,
            // categoriesJson left as default '[]' — populated by the
            // classifier in step 4, not by the Scryfall sync.
          },
          update: {
            name: c.name,
            manaCost: c.manaCost,
            cmc: c.cmc,
            typeLine: c.typeLine,
            oracleText: c.oracleText,
            colorIdentity: c.colorIdentity,
            edhrecRank: c.edhrecRank,
            priceUsd: c.priceUsd,
            priceUpdatedAt: c.priceUsd != null ? new Date() : undefined,
          },
        }),
      ),
    );
  }
}
