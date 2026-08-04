import { describe, expect, it } from "vitest";
import { cardCatalogQuerySchema } from "./index";

describe("cardCatalogQuerySchema", () => {
  it.each([
    "LEVEL_ASC",
    "LEVEL_DESC",
    "ATK_ASC",
    "ATK_DESC",
    "DEF_ASC",
    "DEF_DESC",
    "TYPE_ASC",
    "ATTRIBUTE_ASC",
  ] as const)("akzeptiert die stabile Sortierung %s", (sort) => {
    expect(cardCatalogQuerySchema.parse({ sort }).sort).toBe(sort);
  });

  it("parst Stufe-, ATK- und DEF-Bereiche aus URL-Parametern", () => {
    expect(cardCatalogQuerySchema.parse({
      levelRankLinkMin: "3",
      levelRankLinkMax: "10",
      atkMin: "1200",
      defMax: "2800",
      includeFacets: "true",
    })).toMatchObject({
      levelRankLinkMin: 3,
      levelRankLinkMax: 10,
      atkMin: 1200,
      defMax: 2800,
      includeFacets: "true",
    });
  });
});
