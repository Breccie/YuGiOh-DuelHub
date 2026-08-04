import { describe, expect, it } from "vitest";
import {
  buildCardCatalogFilterQuery,
  emptyCardCatalogFilters,
} from "@/components/card-catalog-controls";

describe("buildCardCatalogFilterQuery", () => {
  it("normalisiert leere Filter, ohne leere Bereichswerte an die API zu senden", () => {
    expect(buildCardCatalogFilterQuery(emptyCardCatalogFilters)).toEqual({
      ownership: "ALL",
      kind: undefined,
      banlistStatus: "ALL",
      monsterType: undefined,
      attribute: undefined,
      levelRankLinkMin: undefined,
      levelRankLinkMax: undefined,
      atkMin: undefined,
      atkMax: undefined,
      defMin: undefined,
      defMax: undefined,
      rarity: undefined,
      setCode: undefined,
    });
  });

  it("überträgt die erweiterten Karten- und Wertefilter gemeinsam", () => {
    expect(buildCardCatalogFilterQuery({
      ownership: "OWNED",
      kind: "MONSTER",
      banlistStatus: "LIMITED",
      monsterType: "Drache",
      attribute: "DARK",
      levelMin: "4",
      levelMax: "8",
      atkMin: "1500",
      atkMax: "3000",
      defMin: "0",
      defMax: "2500",
      rarity: "Ultra Rare",
      setCode: "LOB",
    })).toMatchObject({
      ownership: "OWNED",
      kind: "MONSTER",
      banlistStatus: "LIMITED",
      monsterType: "Drache",
      attribute: "DARK",
      levelRankLinkMin: 4,
      levelRankLinkMax: 8,
      atkMin: 1500,
      atkMax: 3000,
      defMin: 0,
      defMax: 2500,
      rarity: "Ultra Rare",
      setCode: "LOB",
    });
  });
});
