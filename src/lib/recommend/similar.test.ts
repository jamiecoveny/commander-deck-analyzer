import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearEdhrecCache } from "@/lib/edhrec";
import type { EdhrecData } from "@/lib/edhrec";

import { similarDeckRecommendations } from "./similar";

// Build EDHrec data fixture for a peer commander.
function peerData(
  cards: ReadonlyArray<{ name: string; pct: number; section?: string }>,
): EdhrecData {
  return {
    numDecks: 1000,
    averageTypeCounts: {
      creature: 0,
      instant: 0,
      sorcery: 0,
      artifact: 0,
      enchantment: 0,
      planeswalker: 0,
      land: 0,
      basic: 0,
      nonbasic: 0,
    },
    topCards: cards.map((c) => ({
      name: c.name,
      inclusionPct: c.pct,
      numDecks: Math.round(c.pct * 1000),
      potentialDecks: 1000,
      synergy: 0,
      section: c.section ?? "Top Cards",
    })),
    similarCommanders: [],
  };
}

const userCommanderData: EdhrecData = {
  numDecks: 5000,
  averageTypeCounts: {
    creature: 24,
    instant: 9,
    sorcery: 8,
    artifact: 9,
    enchantment: 7,
    planeswalker: 6,
    land: 36,
    basic: 13,
    nonbasic: 23,
  },
  topCards: [],
  similarCommanders: ["Peer A", "Peer B", "Peer C"],
};

beforeEach(() => clearEdhrecCache());
afterEach(() => clearEdhrecCache());

describe("similarDeckRecommendations", () => {
  it("returns empty array when there's no commanderEdhrec", async () => {
    const r = await similarDeckRecommendations({
      ownedCardNames: [],
      commanderEdhrec: null,
      excludeNames: new Set(),
    });
    expect(r).toEqual([]);
  });

  it("recommends cards appearing in 2+ similar commanders, sorted by score", async () => {
    // Stub global fetch — Peer A has Sol Ring 80%, Arcane Signet 60%.
    // Peer B has Sol Ring 90%, Lightning Bolt 50%.
    // Peer C has Arcane Signet 70%.
    // Sol Ring: 2 hits (A 80, B 90) — recommended.
    // Arcane Signet: 2 hits (A 60, C 70) — recommended.
    // Lightning Bolt: 1 hit — below MIN_SIMILAR_HITS, skipped.
    const responses: Record<string, EdhrecData> = {
      "Peer A": peerData([
        { name: "Sol Ring", pct: 0.8 },
        { name: "Arcane Signet", pct: 0.6 },
      ]),
      "Peer B": peerData([
        { name: "Sol Ring", pct: 0.9 },
        { name: "Lightning Bolt", pct: 0.5 },
      ]),
      "Peer C": peerData([{ name: "Arcane Signet", pct: 0.7 }]),
    };
    const fetchSpy = vi.fn(
      async (url: string | URL): Promise<Response> => {
        const u = String(url);
        for (const [name, data] of Object.entries(responses)) {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          if (u.includes(slug)) {
            // Re-build a Scryfall-style raw response (top-level numbers
            // and container.json_dict.cardlists). Simpler: write a fake
            // 200 with the data fields the EDHrec parser tolerates.
            const raw = {
              creature: 0,
              instant: 0,
              sorcery: 0,
              artifact: 0,
              enchantment: 0,
              battle: 0,
              planeswalker: 0,
              land: 0,
              basic: 0,
              nonbasic: 0,
              num_decks_avg: data.numDecks,
              similar: [],
              container: {
                json_dict: {
                  cardlists: [
                    {
                      tag: "topcards",
                      header: "Top Cards",
                      cardviews: data.topCards.map((c) => ({
                        name: c.name,
                        inclusion: c.numDecks,
                        num_decks: c.numDecks,
                        potential_decks: c.potentialDecks,
                        synergy: 0,
                      })),
                    },
                  ],
                },
              },
            };
            return new Response(JSON.stringify(raw), { status: 200 });
          }
        }
        return new Response("not found", { status: 404 });
      },
    );
    const realFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const recs = await similarDeckRecommendations({
        ownedCardNames: [],
        commanderEdhrec: userCommanderData,
        excludeNames: new Set(),
      });
      const names = recs.map((r) => r.addCard);
      expect(names).toContain("Sol Ring");
      expect(names).toContain("Arcane Signet");
      expect(names).not.toContain("Lightning Bolt");
      // Sol Ring should be first — higher combined score (0.8 + 0.9 vs 0.6 + 0.7).
      expect(names[0]).toBe("Sol Ring");
    } finally {
      global.fetch = realFetch;
    }
  });

  it("excludes cards already owned", async () => {
    const realFetch = global.fetch;
    global.fetch = (vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            creature: 0,
            instant: 0,
            sorcery: 0,
            artifact: 0,
            enchantment: 0,
            battle: 0,
            planeswalker: 0,
            land: 0,
            basic: 0,
            nonbasic: 0,
            num_decks_avg: 1000,
            similar: [],
            container: {
              json_dict: {
                cardlists: [
                  {
                    tag: "topcards",
                    header: "Top",
                    cardviews: [
                      {
                        name: "Sol Ring",
                        inclusion: 800,
                        num_decks: 800,
                        potential_decks: 1000,
                        synergy: 0,
                      },
                    ],
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
    ) as unknown) as typeof fetch;
    try {
      const recs = await similarDeckRecommendations({
        ownedCardNames: ["Sol Ring"],
        commanderEdhrec: userCommanderData,
        excludeNames: new Set(),
      });
      expect(recs.find((r) => r.addCard === "Sol Ring")).toBeUndefined();
    } finally {
      global.fetch = realFetch;
    }
  });

  it("degrades to [] if all similar fetches fail", async () => {
    const realFetch = global.fetch;
    global.fetch = (vi.fn(
      async () => new Response("err", { status: 500 }),
    ) as unknown) as typeof fetch;
    try {
      const recs = await similarDeckRecommendations({
        ownedCardNames: [],
        commanderEdhrec: userCommanderData,
        excludeNames: new Set(),
      });
      expect(recs).toEqual([]);
    } finally {
      global.fetch = realFetch;
    }
  });
});
