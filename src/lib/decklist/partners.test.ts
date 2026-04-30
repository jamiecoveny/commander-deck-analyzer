import { describe, expect, it } from "vitest";

import {
  canPairAsCommanders,
  getPartnerWith,
  hasFriendsForever,
  hasPartner,
  isBackground,
  isLegendary,
} from "./partners";
import type { CardLookupRow } from "./types";

function row(over: Partial<CardLookupRow>): CardLookupRow {
  return {
    name: "Test Card",
    oracleId: "id",
    typeLine: "Legendary Creature — Human",
    oracleText: "",
    colorIdentity: "",
    ...over,
  };
}

describe("partner helpers", () => {
  it("hasPartner detects bare 'Partner'", () => {
    expect(hasPartner(row({ oracleText: "Partner (You can have two...)" }))).toBe(true);
    expect(hasPartner(row({ oracleText: "Partner with Tymna the Weaver (...)" }))).toBe(false);
  });

  it("getPartnerWith extracts the named partner", () => {
    const t = row({ oracleText: "Partner with Tymna the Weaver (When this creature...)" });
    expect(getPartnerWith(t)).toBe("Tymna the Weaver");
  });

  it("hasFriendsForever finds the keyword", () => {
    expect(hasFriendsForever(row({ oracleText: "Friends forever" }))).toBe(true);
    expect(hasFriendsForever(row({ oracleText: "Lifelink" }))).toBe(false);
  });

  it("isBackground checks the type line", () => {
    expect(isBackground(row({ typeLine: "Legendary Enchantment — Background" }))).toBe(true);
    expect(isBackground(row({ typeLine: "Creature — Human" }))).toBe(false);
  });

  it("isLegendary recognizes legendary type lines", () => {
    expect(isLegendary(row({ typeLine: "Legendary Creature — Human" }))).toBe(true);
    expect(isLegendary(row({ typeLine: "Creature — Human" }))).toBe(false);
  });
});

describe("canPairAsCommanders", () => {
  const partnerOnly = row({ name: "Tana, the Bloodsower", oracleText: "Partner (...)" });
  const partnerOnly2 = row({ name: "Sidar Kondo of Jamuraa", oracleText: "Partner (...)" });
  const partnerWithA = row({
    name: "Bruse Tarl, Boorish Herder",
    oracleText: "Partner with Tymna the Weaver (...)",
  });
  const partnerWithB = row({
    name: "Tymna the Weaver",
    oracleText: "Partner with Bruse Tarl, Boorish Herder (...)",
  });
  const friendsA = row({ name: "Anara, Wolvid Familiar", oracleText: "Friends forever (...)" });
  const friendsB = row({ name: "Brinelin, the Moon Kraken", oracleText: "Friends forever (...)" });
  const cmdrWithBackground = row({
    name: "Wilson, Refined Grizzly",
    oracleText: "Choose a Background (...)",
  });
  const background = row({
    name: "Cultist of the Absolute",
    typeLine: "Legendary Enchantment — Background",
    oracleText: "Commander creature gets +3/+3 (...)",
  });
  const lone = row({ name: "Krark, the Thumbless", oracleText: "If you cast..." });

  it("ok for vanilla Partner + Partner", () => {
    expect(canPairAsCommanders(partnerOnly, partnerOnly2).ok).toBe(true);
  });

  it("ok for reciprocal Partner with X", () => {
    expect(canPairAsCommanders(partnerWithA, partnerWithB).ok).toBe(true);
  });

  it("rejects non-reciprocal Partner with X", () => {
    const notMatched = row({
      name: "Random",
      oracleText: "Partner with Someone Else (...)",
    });
    expect(canPairAsCommanders(partnerWithA, notMatched).ok).toBe(false);
  });

  it("ok for Friends forever + Friends forever", () => {
    expect(canPairAsCommanders(friendsA, friendsB).ok).toBe(true);
  });

  it("ok for Choose a Background + Background (either order)", () => {
    expect(canPairAsCommanders(cmdrWithBackground, background).ok).toBe(true);
    expect(canPairAsCommanders(background, cmdrWithBackground).ok).toBe(true);
  });

  it("rejects two Backgrounds", () => {
    expect(canPairAsCommanders(background, background).ok).toBe(false);
  });

  it("rejects two Partner-less commanders", () => {
    expect(canPairAsCommanders(lone, lone).ok).toBe(false);
  });
});
