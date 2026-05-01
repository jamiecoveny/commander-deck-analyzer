import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { clearEdhrecCache, fetchEdhrecCommander } from "./api";

const FIXTURE = join(__dirname, "__fixtures__", "sample-response.json");

async function loadFixture(): Promise<unknown> {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

function mockFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe("fetchEdhrecCommander", () => {
  afterEach(() => clearEdhrecCache());

  it("projects average type counts and top cards", async () => {
    const fixture = await loadFixture();
    const r = await fetchEdhrecCommander("Atraxa, Praetors' Voice", {
      fetchImpl: mockFetch(fixture),
    });
    expect(r).not.toBeNull();
    expect(r!.numDecks).toBe(40720);
    expect(r!.averageTypeCounts.creature).toBe(24);
    expect(r!.averageTypeCounts.basic).toBe(13);
    expect(r!.similarCommanders).toContain("Atraxa, Grand Unifier");
  });

  it("excludes the newcards section but includes manaartifacts and topcards", async () => {
    const fixture = await loadFixture();
    const r = await fetchEdhrecCommander("Atraxa, Praetors' Voice", {
      fetchImpl: mockFetch(fixture),
    });
    const names = r!.topCards.map((c) => c.name);
    expect(names).toContain("Sol Ring");
    expect(names).toContain("Swords to Plowshares");
    expect(names).not.toContain("Some New Card");
  });

  it("computes inclusion percentage correctly", async () => {
    const fixture = await loadFixture();
    const r = await fetchEdhrecCommander("Atraxa, Praetors' Voice", {
      fetchImpl: mockFetch(fixture),
    });
    const sol = r!.topCards.find((c) => c.name === "Sol Ring");
    expect(sol!.inclusionPct).toBeCloseTo(34662 / 40720, 4);
  });

  it("sorts top cards by inclusion percentage descending", async () => {
    const fixture = await loadFixture();
    const r = await fetchEdhrecCommander("Atraxa, Praetors' Voice", {
      fetchImpl: mockFetch(fixture),
    });
    for (let i = 1; i < r!.topCards.length; i += 1) {
      expect(r!.topCards[i - 1]!.inclusionPct).toBeGreaterThanOrEqual(
        r!.topCards[i]!.inclusionPct,
      );
    }
  });

  it("returns null on 404 (commander not on EDHrec) and caches it", async () => {
    const fetchImpl = mockFetch({}, 404);
    const r = await fetchEdhrecCommander("Made Up Commander", { fetchImpl });
    expect(r).toBeNull();
    // Second call should be cached and not refetch.
    const r2 = await fetchEdhrecCommander("Made Up Commander", { fetchImpl });
    expect(r2).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null on schema drift", async () => {
    const r = await fetchEdhrecCommander("X", {
      fetchImpl: mockFetch({ unexpected: "shape" }),
    });
    expect(r).toBeNull();
  });

  it("caches successful responses by slug", async () => {
    const fixture = await loadFixture();
    const fetchImpl = mockFetch(fixture);
    await fetchEdhrecCommander("Atraxa, Praetors' Voice", { fetchImpl });
    await fetchEdhrecCommander("Atraxa, Praetors' Voice", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
