import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSpellbookCache, findCombos, spellbookComboUrl } from "./api";

const FIXTURE = join(__dirname, "__fixtures__", "sample-response.json");

async function loadFixture(): Promise<unknown> {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

function mockFetch(payload: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe("findCombos", () => {
  afterEach(() => clearSpellbookCache());

  it("projects Spellbook results to the DetectedCombo domain shape", async () => {
    const fixture = await loadFixture();
    const fetchImpl = mockFetch(fixture);

    const combos = await findCombos({
      cardNames: ["Thassa's Oracle", "Demonic Consultation"],
      commanderNames: ["Atraxa, Praetors' Voice"],
      fetchImpl,
    });

    expect(combos).toHaveLength(2);
    const inDeck = combos.find((c) => c.completeness === "in_deck");
    const almost = combos.find((c) => c.completeness === "almost_in_deck");
    expect(inDeck).toBeDefined();
    expect(almost).toBeDefined();
    expect(inDeck?.cards).toEqual([
      "Thassa's Oracle",
      "Demonic Consultation",
    ]);
    expect(inDeck?.results).toEqual(["Win the game"]);
    expect(inDeck?.notablePrerequisites).toMatch(/Library has at least/);
    expect(almost?.missing).toEqual([
      "Permanent that can be cast using {C}",
    ]);
  });

  it("orders in_deck combos before almost_in_deck", async () => {
    const fixture = await loadFixture();
    const combos = await findCombos({
      cardNames: ["X"],
      commanderNames: ["Y"],
      fetchImpl: mockFetch(fixture),
    });
    expect(combos[0]?.completeness).toBe("in_deck");
    expect(combos[1]?.completeness).toBe("almost_in_deck");
  });

  it("caches by decklist hash and skips re-fetch", async () => {
    const fixture = await loadFixture();
    const fetchImpl = mockFetch(fixture);
    const args = {
      cardNames: ["Thassa's Oracle", "Demonic Consultation"],
      commanderNames: ["Atraxa, Praetors' Voice"],
      fetchImpl,
    };
    await findCombos(args);
    await findCombos(args);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when force=true", async () => {
    const fixture = await loadFixture();
    const fetchImpl = mockFetch(fixture);
    const args = {
      cardNames: ["Thassa's Oracle"],
      commanderNames: ["X"],
      fetchImpl,
    };
    await findCombos(args);
    await findCombos({ ...args, force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list on schema drift instead of throwing", async () => {
    const combos = await findCombos({
      cardNames: ["X"],
      commanderNames: ["Y"],
      fetchImpl: mockFetch({ unexpected: "shape" }),
    });
    expect(combos).toEqual([]);
  });

  it("throws on transport failure", async () => {
    await expect(
      findCombos({
        cardNames: ["X"],
        commanderNames: ["Y"],
        fetchImpl: mockFetch({}, false),
      }),
    ).rejects.toThrow(/spellbook find-my-combos failed/);
  });
});

describe("spellbookComboUrl", () => {
  it("builds a URL with the combo id encoded", () => {
    expect(spellbookComboUrl("1234-5678")).toBe(
      "https://commanderspellbook.com/combo/1234-5678/",
    );
  });
});
