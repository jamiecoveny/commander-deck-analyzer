import { describe, expect, it } from "vitest";

import { normalize } from "./normalize";
import { ScryfallCardSchema } from "./types";

function parse(raw: unknown) {
  const r = ScryfallCardSchema.safeParse(raw);
  if (!r.success) throw new Error(`fixture parse failed: ${r.error.message}`);
  return r.data;
}

describe("normalize", () => {
  it("normalizes a vanilla card", () => {
    const n = normalize(
      parse({
        id: "x",
        oracle_id: "abc",
        name: "Sol Ring",
        layout: "normal",
        mana_cost: "{1}",
        cmc: 1,
        type_line: "Artifact",
        oracle_text: "{T}: Add {C}{C}.",
        color_identity: [],
        edhrec_rank: 1,
        prices: { usd: "1.99" },
      }),
    );
    expect(n).not.toBeNull();
    expect(n!.oracleId).toBe("abc");
    expect(n!.name).toBe("Sol Ring");
    expect(n!.cmc).toBe(1);
    expect(n!.colorIdentity).toBe("");
    expect(n!.priceUsd).toBe(1.99);
    expect(n!.edhrecRank).toBe(1);
  });

  it("sorts color identity into WUBRG order", () => {
    const n = normalize(
      parse({
        id: "x",
        oracle_id: "atraxa",
        name: "Atraxa, Praetors' Voice",
        layout: "normal",
        mana_cost: "{G}{W}{U}{B}",
        cmc: 4,
        type_line: "Legendary Creature",
        oracle_text: "...",
        color_identity: ["g", "w", "b", "u"],
      }),
    );
    expect(n!.colorIdentity).toBe("WUBG");
  });

  it("joins multi-face oracle text and types for adventure layout", () => {
    const n = normalize(
      parse({
        id: "x",
        oracle_id: "borrower",
        name: "Brazen Borrower // Petty Theft",
        layout: "adventure",
        cmc: 3,
        color_identity: ["U"],
        card_faces: [
          {
            name: "Brazen Borrower",
            mana_cost: "{1}{U}{U}",
            type_line: "Creature — Faerie Rogue",
            oracle_text: "Flash\nFlying",
          },
          {
            name: "Petty Theft",
            mana_cost: "{1}{U}",
            type_line: "Instant — Adventure",
            oracle_text:
              "Return target nonland permanent an opponent controls to its owner's hand.",
          },
        ],
      }),
    );
    expect(n!.typeLine).toContain("Faerie Rogue");
    expect(n!.typeLine).toContain("Adventure");
    expect(n!.oracleText).toContain("Flash");
    expect(n!.oracleText).toContain("Return target nonland");
    // Front face mana cost wins.
    expect(n!.manaCost).toBe("{1}{U}{U}");
  });

  it("returns null for tokens and cards lacking an oracle_id", () => {
    const token = normalize(
      parse({
        id: "tok",
        name: "Treasure Token",
        layout: "token",
        cmc: 0,
        type_line: "Token Artifact",
        color_identity: [],
      }),
    );
    expect(token).toBeNull();

    const noOracle = normalize(
      parse({
        id: "nope",
        name: "Some Art Series",
        layout: "art_series",
        cmc: 0,
        type_line: "Card",
        color_identity: [],
      }),
    );
    expect(noOracle).toBeNull();
  });

  it("treats null prices.usd as null priceUsd", () => {
    const n = normalize(
      parse({
        id: "x",
        oracle_id: "borrower2",
        name: "Brazen Borrower // Petty Theft",
        layout: "adventure",
        cmc: 3,
        color_identity: ["U"],
        card_faces: [
          { name: "A", type_line: "Creature", mana_cost: "{1}{U}{U}", oracle_text: "F" },
          { name: "B", type_line: "Instant", mana_cost: "{1}{U}", oracle_text: "B" },
        ],
        prices: { usd: null },
      }),
    );
    expect(n!.priceUsd).toBeNull();
  });
});
