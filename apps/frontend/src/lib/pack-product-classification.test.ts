import { describe, expect, it } from "vitest";
import {
  isStandardProgressionPack,
  isTournamentRewardPack,
} from "@/lib/pack-product-classification";

function makeSet(
  code: string,
  name: string,
  productType = "CORE_BOOSTER",
) {
  return {
    code,
    name,
    productType,
    isOpenable: true,
  };
}

describe("pack product classification", () => {
  it("keeps chronological core boosters in the standard progression pool", () => {
    expect(
      isStandardProgressionPack(makeSet("LOB", "Legend of Blue Eyes White Dragon")),
    ).toBe(true);
    expect(isStandardProgressionPack(makeSet("IOC", "Invasion of Chaos"))).toBe(
      true,
    );
  });

  it("keeps promo and special packs out of the standard progression pool", () => {
    const promoLikeSets = [
      makeSet("DB1", "Dark Beginning 1"),
      makeSet("DR1", "Dark Revelation Volume 1"),
      makeSet("DP1", "Duelist Pack: Jaden Yuki", "BOOSTER"),
      makeSet("PP01", "Premium Pack (TCG)", "BOOSTER"),
      makeSet("BP01", "Battle Pack: Epic Dawn", "BOOSTER"),
      makeSet("SP13", "Star Pack 2013", "BOOSTER"),
      makeSet("SBLS", "Speed Duel: Arena of Lost Souls"),
      makeSet("YAP1", "Anniversary Pack"),
      makeSet("WCPP", "World Championship 2010 Card Pack"),
      makeSet("PGLD", "Premium Gold"),
      makeSet("RYMP", "Ra Yellow Mega Pack"),
      makeSet("NKRT", "Noble Knights of the Round Table Box Set"),
      makeSet("TBC1", "The Pot Collection"),
      makeSet("KC01", "25th Anniversary Ultimate Kaiba Set"),
      makeSet("25LP", "Limited Pack World Championship 2025"),
    ];

    for (const set of promoLikeSets) {
      expect(isStandardProgressionPack(set)).toBe(false);
    }
  });

  it("classifies tournament packs separately for rewards", () => {
    expect(isTournamentRewardPack(makeSet("TP1", "Tournament Pack: 1st Season", "BOOSTER"))).toBe(true);
    expect(isTournamentRewardPack(makeSet("CP01", "Champion Pack: Game One", "BOOSTER"))).toBe(true);
    expect(isTournamentRewardPack(makeSet("OP01", "OTS Tournament Pack 1", "BOOSTER"))).toBe(true);
    expect(isTournamentRewardPack(makeSet("LOB", "Legend of Blue Eyes White Dragon"))).toBe(false);
  });
});
