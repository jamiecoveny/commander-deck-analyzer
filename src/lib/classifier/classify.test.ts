import { describe, expect, it } from "vitest";

import { classify } from "./classify";
import type { ClassifierInput, OverrideMap } from "./types";

const card = (
  name: string,
  typeLine: string,
  oracleText: string,
): ClassifierInput => ({ name, typeLine, oracleText });

describe("classify — single-category cards", () => {
  it("classifies a mana rock as ramp", () => {
    expect(
      classify(card("Sol Ring", "Artifact", "{T}: Add {C}{C}.")),
    ).toEqual(["ramp"]);
  });

  it("classifies a basic-land tutor as ramp (not tutor)", () => {
    const cats = classify(
      card(
        "Cultivate",
        "Sorcery",
        "Search your library for up to two basic land cards. Reveal them, put one onto the battlefield tapped and the other into your hand. Then shuffle.",
      ),
    );
    expect(cats).toContain("ramp");
    expect(cats).not.toContain("tutor");
  });

  it("classifies a non-land tutor as tutor (not ramp)", () => {
    const cats = classify(
      card(
        "Demonic Tutor",
        "Sorcery",
        "Search your library for a card, put it into your hand, then shuffle.",
      ),
    );
    expect(cats).toContain("tutor");
    expect(cats).not.toContain("ramp");
  });

  it("classifies a vanilla draw spell as draw", () => {
    expect(
      classify(card("Divination", "Sorcery", "Draw two cards.")),
    ).toEqual(["draw"]);
  });

  it("classifies a counterspell", () => {
    expect(
      classify(
        card(
          "Counterspell",
          "Instant",
          "Counter target spell.",
        ),
      ),
    ).toEqual(["counterspell"]);
  });

  it("classifies a board wipe", () => {
    expect(
      classify(
        card(
          "Wrath of God",
          "Sorcery",
          "Destroy all creatures. They can't be regenerated.",
        ),
      ),
    ).toEqual(["wipe"]);
  });

  it("classifies targeted removal (destroy creature)", () => {
    expect(
      classify(
        card("Doom Blade", "Instant", "Destroy target nonblack creature."),
      ),
    ).toEqual(["removal"]);
  });

  it("classifies targeted removal (damage)", () => {
    const cats = classify(
      card(
        "Lightning Bolt",
        "Instant",
        "Lightning Bolt deals 3 damage to any target.",
      ),
    );
    expect(cats).toContain("removal");
  });

  it("classifies recursion (graveyard return)", () => {
    expect(
      classify(
        card(
          "Regrowth",
          "Sorcery",
          "Return target card from your graveyard to your hand.",
        ),
      ),
    ).toEqual(["recursion"]);
  });

  it("classifies stax (cost increase)", () => {
    const cats = classify(
      card(
        "Thalia, Guardian of Thraben",
        "Legendary Creature",
        "First strike. Noncreature spells cost {1} more to cast.",
      ),
    );
    // Our regex tolerates a bit of slack — "spells ... cost {1} more" matches.
    expect(cats).toContain("stax");
  });

  it("classifies wincon ('you win the game')", () => {
    const cats = classify(
      card(
        "Test Wincon",
        "Sorcery",
        "If you have 50 or more life, you win the game.",
      ),
    );
    expect(cats).toContain("wincon");
  });
});

describe("classify — multi-category cards", () => {
  it("Cyclonic Rift is removal AND wipe", () => {
    const cats = classify(
      card(
        "Cyclonic Rift",
        "Instant",
        "Return target nonland permanent you don't control to its owner's hand. Overload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of 'target' with 'each.') If overloaded: Return all nonland permanents you don't control to their owners' hands.",
      ),
    );
    expect(cats).toContain("removal");
    expect(cats).toContain("wipe");
  });
});

describe("classify — lands", () => {
  it("a basic land is just `land`", () => {
    const cats = classify(
      card("Forest", "Basic Land — Forest", "{T}: Add {G}."),
    );
    expect(cats).toEqual(["land"]);
  });

  it("a utility land that draws is land + draw", () => {
    const cats = classify(
      card(
        "Bonders' Enclave",
        "Land",
        "{T}: Add {C}.\n{3}, {T}: Draw a card. Activate this ability only if you control a creature with power 4 or greater.",
      ),
    );
    expect(cats).toContain("land");
    expect(cats).toContain("draw");
    expect(cats).not.toContain("ramp");
  });
});

describe("classify — utility fallback", () => {
  it("a vanilla creature with no matched text is utility", () => {
    expect(
      classify(card("Grizzly Bears", "Creature — Bear", "")),
    ).toEqual(["utility"]);
  });
});

describe("classify — overrides", () => {
  it("override fully replaces auto-classification", () => {
    const overrides: OverrideMap = new Map([
      ["Smothering Tithe", { categories: ["ramp", "draw"] }],
    ]);
    const cats = classify(
      card(
        "Smothering Tithe",
        "Enchantment",
        "Whenever an opponent draws a card, unless that player pays {2}, you create a Treasure token.",
      ),
      { overrides },
    );
    expect(cats.sort()).toEqual(["draw", "ramp"]);
  });

  it("override beats land short-circuit if listed", () => {
    const overrides: OverrideMap = new Map([
      ["Strange Land", { categories: ["wincon"] }],
    ]);
    const cats = classify(
      card("Strange Land", "Land", "{T}: Add {C}."),
      { overrides },
    );
    expect(cats).toEqual(["wincon"]);
  });
});
