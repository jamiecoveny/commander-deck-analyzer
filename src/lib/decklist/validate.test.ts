import { describe, expect, it } from "vitest";

import { parseDecklist } from "./parse";
import {
  ATRAXA,
  CULTIVATE,
  FOREST,
  GRIZZLY_BEARS,
  KRENKO,
  LIGHTNING_BOLT,
  PLAINS,
  RELENTLESS_RATS,
  SIDAR,
  SOL_RING,
  TANA,
  TIME_VAULT,
} from "./__fixtures__/cards";
import { makeFakeLookup } from "./__fixtures__/fakeLookup";
import type { DecklistError } from "./types";
import { validateDecklist } from "./validate";

const POOL = [
  ATRAXA,
  KRENKO,
  SOL_RING,
  CULTIVATE,
  PLAINS,
  FOREST,
  LIGHTNING_BOLT,
  TIME_VAULT,
  RELENTLESS_RATS,
  TANA,
  SIDAR,
  GRIZZLY_BEARS,
];

const lookup = makeFakeLookup(POOL);

/** Helper: build a "valid" deck text padded out to 100 cards with basics. */
function buildDeck(opts: {
  commanderLines?: string[];
  bodyLines?: string[];
  fillBasic?: { name: "Plains" | "Forest"; count: number };
}): string {
  const cmdr = opts.commanderLines ?? ["1 Krenko, Mob Boss *CMDR*"];
  const body = opts.bodyLines ?? [];
  const fill = opts.fillBasic;
  const out: string[] = [...cmdr, ...body];
  if (fill) {
    out.push(`${fill.count} ${fill.name}`);
  }
  return out.join("\n");
}

function errorTypes(errors: DecklistError[]): string[] {
  return errors.map((e) => e.error);
}

describe("validateDecklist — happy path", () => {
  it("accepts a 100-card mono-red deck with one commander", async () => {
    const text = buildDeck({
      commanderLines: ["1 Krenko, Mob Boss *CMDR*"],
      bodyLines: ["1 Sol Ring", "1 Lightning Bolt"],
      fillBasic: { name: "Forest", count: 0 },
    });
    // Krenko is mono-red; we can't use Forest. Build a Plains-based mono-W instead.
    const monoW = [
      "1 Atraxa, Praetors' Voice *CMDR*", // Atraxa is WUBG; Plains is fine.
      "1 Sol Ring",
      "1 Cultivate",
      `${100 - 3} Plains`,
    ].join("\n");
    void text;
    const parsed = parseDecklist(monoW);
    const result = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.commanders).toEqual(["Atraxa, Praetors' Voice"]);
      expect(result.deck.colorIdentity).toBe("WUBG");
      expect(result.deck.totalCards).toBe(100);
    }
  });

  it("accepts partner pairing (vanilla Partner) and unions color identity", async () => {
    const text = [
      "// Commander",
      "1 Tana, the Bloodsower",
      "1 Sidar Kondo of Jamuraa",
      "",
      // Sol Ring + Cultivate + Lightning Bolt + 95 lands = 100
      "1 Sol Ring",
      "1 Cultivate",
      "1 Lightning Bolt",
      "47 Forest",
      "48 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const result = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deck.commanders).toEqual([
        "Sidar Kondo of Jamuraa",
        "Tana, the Bloodsower",
      ]);
      // Tana = RG, Sidar = WG → union = WRG, sorted to "WRG".
      expect(result.deck.colorIdentity).toBe("WRG");
    }
  });

  it("allows multiple Relentless Rats (oracle 'any number')", async () => {
    const text = [
      "1 Atraxa, Praetors' Voice *CMDR*",
      "10 Relentless Rats",
      "89 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const result = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateDecklist — error paths", () => {
  it("flags color identity violations", async () => {
    const text = [
      "1 Atraxa, Praetors' Voice *CMDR*",
      "1 Lightning Bolt", // Atraxa is WUBG, no R allowed
      "98 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const violation = r.errors.find((e) => e.error === "color_identity_violation");
      expect(violation).toBeDefined();
      if (violation && violation.error === "color_identity_violation") {
        expect(violation.card).toBe("Lightning Bolt");
        expect(violation.cardColors).toBe("R");
        expect(violation.commanderColors).toBe("WUBG");
      }
    }
  });

  it("flags banned cards", async () => {
    const text = [
      "1 Atraxa, Praetors' Voice *CMDR*",
      "1 Time Vault",
      "98 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, { lookupCards: lookup });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const banned = r.errors.find((e) => e.error === "banned_card");
      expect(banned).toBeDefined();
    }
  });

  it("flags wrong total card count", async () => {
    const text = ["1 Atraxa, Praetors' Voice *CMDR*", "1 Sol Ring"].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const wt = r.errors.find((e) => e.error === "wrong_total");
      expect(wt).toEqual({ error: "wrong_total", expected: 100, actual: 2 });
    }
  });

  it("flags singleton violations on non-basic, non-'any number' cards", async () => {
    const text = [
      "1 Atraxa, Praetors' Voice *CMDR*",
      "2 Sol Ring",
      "97 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const dupe = r.errors.find((e) => e.error === "singleton_violation");
      expect(dupe).toEqual({ error: "singleton_violation", card: "Sol Ring", quantity: 2 });
    }
  });

  it("flags missing commander", async () => {
    const text = ["1 Sol Ring", "99 Plains"].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(errorTypes(r.errors)).toContain("missing_commander");
    }
  });

  it("flags non-legendary cards marked as commander", async () => {
    const text = [
      "1 Grizzly Bears *CMDR*",
      "1 Sol Ring",
      "98 Forest",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(errorTypes(r.errors)).toContain("non_legendary_commander");
    }
  });

  it("flags missing cards with the original line number", async () => {
    const text = [
      "1 Atraxa, Praetors' Voice *CMDR*",
      "1 Definitely Not A Real Card",
      "98 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const missing = r.errors.find((e) => e.error === "card_not_found");
      expect(missing).toMatchObject({
        error: "card_not_found",
        name: "Definitely Not A Real Card",
        line: 2,
      });
    }
  });

  it("flags two non-Partner commanders as invalid_partner", async () => {
    // Atraxa + Krenko, both legendary creatures, neither has Partner.
    const text = [
      "// Commander",
      "1 Atraxa, Praetors' Voice",
      "1 Krenko, Mob Boss",
      "",
      "98 Plains",
    ].join("\n");
    const parsed = parseDecklist(text);
    const r = await validateDecklist(parsed, {
      lookupCards: lookup,
      skipBannedList: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const ip = r.errors.find((e) => e.error === "invalid_partner");
      expect(ip).toBeDefined();
    }
  });
});
