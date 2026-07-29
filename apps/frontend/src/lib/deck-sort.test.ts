import { describe, expect, it } from "vitest";
import { sortDeckCards } from "@/lib/deck-sort";

const cards = [
  { cardName: "Beta", kind: "SPELL" as const, monsterType: null, levelRankLink: null, atk: null },
  { cardName: "Alpha", kind: "MONSTER" as const, monsterType: "Effect", levelRankLink: 4, atk: 1600 },
  { cardName: "Gamma", kind: "MONSTER" as const, monsterType: "Effect", levelRankLink: 4, atk: 2400 },
  { cardName: "Delta", kind: "TRAP" as const, monsterType: null, levelRankLink: null, atk: null },
];

describe("deck sorting", () => {
  it("sorts by type and level without mutating the stored order", () => {
    const original = [...cards];
    const sorted = sortDeckCards(cards, "TYPE_LEVEL");

    expect(sorted.map((card) => card.cardName)).toEqual([
      "Alpha",
      "Gamma",
      "Beta",
      "Delta",
    ]);
    expect(cards).toEqual(original);
  });

  it("supports name and attack sorting with stable ties", () => {
    expect(sortDeckCards(cards, "NAME_DESC").map((card) => card.cardName)).toEqual([
      "Gamma",
      "Delta",
      "Beta",
      "Alpha",
    ]);
    expect(sortDeckCards(cards, "ATK_DESC").map((card) => card.cardName)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
      "Delta",
    ]);
  });
});
