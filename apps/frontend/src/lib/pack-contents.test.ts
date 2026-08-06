import { describe, expect, it } from "vitest";
import { comparePackRarities, groupPackContents } from "@/lib/pack-contents";

describe("pack contents", () => {
  it("sorts rarities from the rarest group to common", () => {
    const rarities = [
      "Common",
      "Rare",
      "Secret Rare",
      "Super Rare",
      "Ultra Rare",
      "Ultimate Rare",
    ];

    expect(rarities.sort(comparePackRarities)).toEqual([
      "Ultimate Rare",
      "Secret Rare",
      "Ultra Rare",
      "Super Rare",
      "Rare",
      "Common",
    ]);
  });

  it("groups printings by their exact rarity and sorts cards by name", () => {
    const base = {
      cardId: "card-1",
      imageUrl: null,
      setCode: "TEST-EN001",
      collectorNumber: null,
    };
    const groups = groupPackContents([
      { ...base, printingId: "p1", name: "Zulu", rarity: "Common" },
      { ...base, printingId: "p2", name: "Beta", rarity: "Secret Rare" },
      { ...base, printingId: "p3", name: "Alpha", rarity: "Secret Rare" },
    ]);

    expect(groups.map((group) => group.rarity)).toEqual([
      "Secret Rare",
      "Common",
    ]);
    expect(groups[0]?.cards.map((card) => card.name)).toEqual(["Alpha", "Beta"]);
  });
});
