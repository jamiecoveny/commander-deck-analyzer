import { describe, expect, it } from "vitest";

import { parseDecklist } from "./parse";

describe("parseDecklist", () => {
  it("parses bare names with default quantity 1", () => {
    const r = parseDecklist("Sol Ring\nCultivate\n");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ name: "Sol Ring", quantity: 1, isCommander: false });
    expect(r.lines[1]).toMatchObject({ name: "Cultivate", quantity: 1 });
  });

  it("parses '1x ' and '4 ' prefixes", () => {
    const r = parseDecklist("1x Sol Ring\n4 Plains\n");
    expect(r.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Sol Ring", quantity: 1 }),
        expect.objectContaining({ name: "Plains", quantity: 4 }),
      ]),
    );
  });

  it("strips set codes and collector numbers in any common order", () => {
    const r = parseDecklist(
      [
        "1 Sol Ring (CMR) 263",
        "1 Sol Ring [CMR]",
        "1 Sol Ring (CMR) 263 *F*",
        "Cultivate (M21) 177",
      ].join("\n"),
    );
    expect(r.lines.map((l) => l.name)).toEqual([
      "Sol Ring",
      "Sol Ring",
      "Sol Ring",
      "Cultivate",
    ]);
  });

  it("recognizes *CMDR* on a line", () => {
    const r = parseDecklist("*CMDR* Atraxa, Praetors' Voice\n1 Sol Ring\n");
    expect(r.lines[0]).toMatchObject({
      name: "Atraxa, Praetors' Voice",
      isCommander: true,
    });
    expect(r.lines[1]).toMatchObject({ isCommander: false });
  });

  it("recognizes a `// Commander` block until a blank line", () => {
    const r = parseDecklist(
      [
        "// Commander",
        "1 Atraxa, Praetors' Voice",
        "",
        "// Mainboard",
        "1 Sol Ring",
      ].join("\n"),
    );
    const atraxa = r.lines.find((l) => l.name === "Atraxa, Praetors' Voice");
    const sol = r.lines.find((l) => l.name === "Sol Ring");
    expect(atraxa?.isCommander).toBe(true);
    expect(sol?.isCommander).toBe(false);
  });

  it("ignores lines after a sideboard marker", () => {
    const r = parseDecklist(
      [
        "1 Sol Ring",
        "// Sideboard",
        "1 Force of Will",
        "1 Mana Crypt",
      ].join("\n"),
    );
    expect(r.lines.map((l) => l.name)).toEqual(["Sol Ring"]);
  });

  it("ignores SB: prefix lines as well", () => {
    const r = parseDecklist("1 Sol Ring\nSB:\n1 Force of Will\n");
    expect(r.lines.map((l) => l.name)).toEqual(["Sol Ring"]);
  });

  it("handles CRLF line endings", () => {
    const r = parseDecklist("1 Sol Ring\r\n1 Cultivate\r\n");
    expect(r.lines.map((l) => l.name)).toEqual(["Sol Ring", "Cultivate"]);
  });

  it("preserves apostrophes and commas in names", () => {
    const r = parseDecklist("1 Krark, the Thumbless\n1 Lim-Dûl's Vault\n");
    expect(r.lines.map((l) => l.name)).toEqual([
      "Krark, the Thumbless",
      "Lim-Dûl's Vault",
    ]);
  });

  it("warns on invalid quantities", () => {
    const r = parseDecklist("0 Sol Ring\n");
    expect(r.lines).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.message).toMatch(/invalid quantity/);
  });

  it("returns 1-indexed line numbers", () => {
    const r = parseDecklist("\n1 Sol Ring\n\n1 Cultivate\n");
    expect(r.lines.map((l) => l.lineNumber)).toEqual([2, 4]);
  });
});
