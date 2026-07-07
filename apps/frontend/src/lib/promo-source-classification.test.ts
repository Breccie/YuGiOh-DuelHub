import { describe, expect, it } from "vitest";
import { classifyPromoSource } from "@/lib/promo-source-classification";

function makeSet(name: string, overrides: Partial<Parameters<typeof classifyPromoSource>[0]> = {}) {
  return {
    code: overrides.code ?? "TEST",
    name,
    releaseDate: overrides.releaseDate ?? new Date("2002-01-01T00:00:00.000Z"),
    productType: overrides.productType ?? "PROMO",
    isOpenable: overrides.isOpenable ?? false,
  } satisfies Parameters<typeof classifyPromoSource>[0];
}

describe("promo source classification", () => {
  it("keeps tournament-style packs out of free promo sources", () => {
    expect(
      classifyPromoSource(
        makeSet("Tournament Pack 1", {
          productType: "BOOSTER",
          isOpenable: true,
        }),
      ),
    ).toBeNull();
    expect(
      classifyPromoSource(
        makeSet("OTS Tournament Pack 1", {
          productType: "BOOSTER",
          isOpenable: true,
        }),
      ),
    ).toBeNull();
  });

  it("classifies familiar historical promo access sources", () => {
    expect(classifyPromoSource(makeSet("McDonald's Promotional Cards"))).toEqual(
      expect.objectContaining({
        sourceType: "PROMO_CHOICE",
        claimMode: "CHOOSE",
      }),
    );
    expect(classifyPromoSource(makeSet("Video Game Promotional Cards"))).toEqual(
      expect.objectContaining({
        sourceType: "FIXED_PROMO_GRANT",
        claimMode: "FIXED",
      }),
    );
  });

  it("keeps prize cards organizer-only", () => {
    expect(classifyPromoSource(makeSet("World Championship Prize Cards"))).toEqual(
      expect.objectContaining({
        sourceType: "PRIZE_PROMO",
        claimMode: "ORGANIZER_ONLY",
      }),
    );
  });
});
