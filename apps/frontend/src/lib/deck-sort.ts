import type { DeckSortMode } from "@ygo/contracts";

type SortableDeckCard = {
  cardName: string;
  kind: "MONSTER" | "SPELL" | "TRAP" | "TOKEN";
  monsterType: string | null;
  levelRankLink: number | null;
  atk: number | null;
};

const deckCardCollator = new Intl.Collator("de", {
  sensitivity: "base",
  numeric: true,
});

function getMonsterTypeRank(monsterType: string | null) {
  const value = monsterType?.toLocaleLowerCase("de") ?? "";
  if (value.includes("normal")) return 0;
  if (value.includes("effect")) return 1;
  if (value.includes("ritual")) return 2;
  if (value.includes("fusion")) return 3;
  if (value.includes("synchro")) return 4;
  if (value.includes("xyz")) return 5;
  if (value.includes("link")) return 6;
  return 7;
}

export function sortDeckCards<T extends SortableDeckCard>(
  cards: T[],
  mode: DeckSortMode,
) {
  const kindRank = { MONSTER: 0, SPELL: 1, TRAP: 2, TOKEN: 3 } as const;

  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const a = left.card;
      const b = right.card;
      let comparison = 0;

      if (mode === "NAME_ASC" || mode === "NAME_DESC") {
        comparison = deckCardCollator.compare(a.cardName, b.cardName);
        if (mode === "NAME_DESC") comparison *= -1;
      } else if (mode === "ATK_DESC") {
        comparison =
          (b.atk ?? Number.NEGATIVE_INFINITY) -
            (a.atk ?? Number.NEGATIVE_INFINITY) ||
          deckCardCollator.compare(a.cardName, b.cardName);
      } else {
        comparison =
          kindRank[a.kind] - kindRank[b.kind] ||
          getMonsterTypeRank(a.monsterType) - getMonsterTypeRank(b.monsterType) ||
          (a.levelRankLink ?? Number.POSITIVE_INFINITY) -
            (b.levelRankLink ?? Number.POSITIVE_INFINITY) ||
          deckCardCollator.compare(a.cardName, b.cardName);
      }

      return comparison || left.index - right.index;
    })
    .map(({ card }) => card);
}
