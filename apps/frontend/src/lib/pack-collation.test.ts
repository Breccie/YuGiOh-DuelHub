import { describe, expect, it, vi } from "vitest";
import { SetProductType } from "@prisma/client";

import {
  generatePackCards,
  getEffectiveSetConfiguration,
  type SetCardLike,
  type SetLike,
} from "./pack-collation";

function makeSet(options: {
  name: string;
  code: string;
  releaseDate: string;
}): SetLike {
  return {
    code: options.code,
    name: options.name,
    releaseDate: new Date(options.releaseDate),
    productType: SetProductType.CORE_BOOSTER,
    isOpenable: true,
    packSize: 9,
  };
}

function makeCards(options?: { includeRare?: boolean }) {
  const cards: SetCardLike[] = [];
  const includeRare = options?.includeRare ?? true;

  for (let index = 0; index < 24; index += 1) {
    cards.push({
      id: `common-${index}`,
      cardId: `common-${index}`,
      setCode: `TST-EN${String(index).padStart(3, "0")}`,
      rarity: "Common",
    });
  }

  if (includeRare) {
    for (let index = 0; index < 12; index += 1) {
      cards.push({
        id: `rare-${index}`,
        cardId: `rare-${index}`,
        setCode: `TST-ENR${String(index).padStart(2, "0")}`,
        rarity: "Rare",
      });
    }
  }

  for (let index = 0; index < 12; index += 1) {
    cards.push({
      id: `super-${index}`,
      cardId: `super-${index}`,
      setCode: `TST-ENS${String(index).padStart(2, "0")}`,
      rarity: "Super Rare",
    });
  }

  for (let index = 0; index < 8; index += 1) {
    cards.push({
      id: `ultra-${index}`,
      cardId: `ultra-${index}`,
      setCode: `TST-ENU${String(index).padStart(2, "0")}`,
      rarity: "Ultra Rare",
    });
  }

  for (let index = 0; index < 4; index += 1) {
    cards.push({
      id: `secret-${index}`,
      cardId: `secret-${index}`,
      setCode: `TST-ENSE${String(index).padStart(2, "0")}`,
      rarity: "Secret Rare",
    });
  }

  return cards;
}

function bucket(card: SetCardLike) {
  if (card.rarity.includes("Secret")) {
    return "secret";
  }

  if (card.rarity.includes("Ultra")) {
    return "ultra";
  }

  if (card.rarity.includes("Super")) {
    return "super";
  }

  if (card.rarity === "Rare") {
    return "rare";
  }

  return "common";
}

function countBuckets(cards: SetCardLike[]) {
  return cards.reduce<Record<string, number>>((counts, card) => {
    const key = bucket(card);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

describe("historical core booster collation", () => {
  it("uses 2002 core booster structure: 8 commons plus one rare-or-better slot", () => {
    const set = makeSet({
      name: "Legend of Blue Eyes White Dragon",
      code: "LOB",
      releaseDate: "2002-03-08T00:00:00.000Z",
    });
    const cards = makeCards();

    expect(getEffectiveSetConfiguration(set, cards).collationKey).toBe(
      "tcg-core-2002",
    );

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const pulledCards = generatePackCards(set, cards);
    vi.mocked(Math.random).mockRestore();
    const counts = countBuckets(pulledCards);

    expect(pulledCards).toHaveLength(9);
    expect(counts.common).toBe(8);
    expect(
      (counts.rare ?? 0) +
        (counts.super ?? 0) +
        (counts.ultra ?? 0) +
        (counts.secret ?? 0),
    ).toBe(1);
  });

  it("uses 2008 core booster structure: 7 commons, one rare, one common-or-foil slot", () => {
    const set = makeSet({
      name: "The Duelist Genesis",
      code: "TDGS",
      releaseDate: "2008-09-02T00:00:00.000Z",
    });
    const cards = makeCards();

    expect(getEffectiveSetConfiguration(set, cards).collationKey).toBe(
      "tcg-core-2008",
    );

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const pulledCards = generatePackCards(set, cards);
    vi.mocked(Math.random).mockRestore();
    const counts = countBuckets(pulledCards);

    expect(pulledCards).toHaveLength(9);
    expect(counts.common).toBe(7);
    expect(counts.rare).toBe(1);
    expect(
      (counts.super ?? 0) + (counts.ultra ?? 0) + (counts.secret ?? 0),
    ).toBe(1);
  });

  it("uses 2016 core booster structure: 7 commons, one rare, one guaranteed foil", () => {
    const set = makeSet({
      name: "Breakers of Shadow",
      code: "BOSH",
      releaseDate: "2016-01-14T00:00:00.000Z",
    });
    const cards = makeCards();

    expect(getEffectiveSetConfiguration(set, cards).collationKey).toBe(
      "tcg-core-2016",
    );

    const pulledCards = generatePackCards(set, cards);
    const counts = countBuckets(pulledCards);

    expect(pulledCards).toHaveLength(9);
    expect(counts.common).toBe(7);
    expect(counts.rare).toBe(1);
    expect(
      (counts.super ?? 0) + (counts.ultra ?? 0) + (counts.secret ?? 0),
    ).toBe(1);
  });

  it("uses 2020 core booster structure: 8 commons and one guaranteed foil without rares", () => {
    const set = makeSet({
      name: "Eternity Code",
      code: "ETCO",
      releaseDate: "2020-04-30T00:00:00.000Z",
    });
    const cards = makeCards({ includeRare: false });

    expect(getEffectiveSetConfiguration(set, cards).collationKey).toBe(
      "tcg-core-2020",
    );

    const pulledCards = generatePackCards(set, cards);
    const counts = countBuckets(pulledCards);

    expect(pulledCards).toHaveLength(9);
    expect(counts.common).toBe(8);
    expect(counts.rare ?? 0).toBe(0);
    expect(
      (counts.super ?? 0) + (counts.ultra ?? 0) + (counts.secret ?? 0),
    ).toBe(1);
  });
});
