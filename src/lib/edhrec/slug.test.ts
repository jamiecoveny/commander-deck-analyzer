import { describe, expect, it } from "vitest";

import { commanderSlug, edhrecCommanderUrl } from "./slug";

describe("commanderSlug", () => {
  it("handles a typical legendary creature name", () => {
    expect(commanderSlug("Atraxa, Praetors' Voice")).toBe(
      "atraxa-praetors-voice",
    );
  });

  it("strips multiple punctuation marks", () => {
    expect(commanderSlug("Krenko, Mob Boss")).toBe("krenko-mob-boss");
    expect(commanderSlug("Jhoira, Weatherlight Captain")).toBe(
      "jhoira-weatherlight-captain",
    );
  });

  it("strips diacritics", () => {
    expect(commanderSlug("Lim-Dûl's Vault")).toBe("lim-dul-s-vault");
  });

  it("collapses dashes and trims", () => {
    expect(commanderSlug("  Foo,, Bar—Baz  ")).toBe("foo-bar-baz");
  });

  it("returns empty string for empty input", () => {
    expect(commanderSlug("")).toBe("");
  });

  it("only slugs the front commander when given a partner pair", () => {
    expect(commanderSlug("Sidar Kondo // Tana, the Bloodsower")).toBe(
      "sidar-kondo",
    );
  });
});

describe("edhrecCommanderUrl", () => {
  it("builds the JSON URL", () => {
    expect(edhrecCommanderUrl("Atraxa, Praetors' Voice")).toBe(
      "https://json.edhrec.com/pages/commanders/atraxa-praetors-voice.json",
    );
  });
});
