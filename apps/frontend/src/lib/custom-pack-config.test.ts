import { describe, expect, it } from "vitest";
import {
  getCustomPackEraPreset,
  getCustomPackRarityPercentage,
  getCustomPackRarityPercentageInputValue,
  normalizeCustomPackRarityOptions,
  toPersistedCustomPackSlot,
} from "@/lib/custom-pack-config";

describe("custom pack era presets", () => {
  it.each([
    ["EARLY_TCG", [8, 1], [["Common"], ["Rare", "Super Rare", "Ultra Rare", "Secret Rare"]]],
    ["GX_5DS", [7, 1, 1], [["Common"], ["Rare"], ["Common", "Super Rare", "Ultra Rare", "Secret Rare"]]],
    ["MODERN_CORE", [8, 1], [["Common"], ["Super Rare", "Ultra Rare", "Secret Rare"]]],
    ["PROMO_CUSTOM", [1], [["Promo"]]],
  ] as const)("creates the %s distribution", (era, counts, rarities) => {
    const preset = getCustomPackEraPreset(era);
    expect(preset.map((slot) => slot.count)).toEqual(counts);
    expect(preset.map((slot) => slot.rarityOptions.map((option) => option.rarity))).toEqual(rarities);
  });

  it("shows modern foil weights as normalized percentages", () => {
    const foil = getCustomPackEraPreset("MODERN_CORE")[1]!;
    expect(getCustomPackRarityPercentage(foil.rarityOptions, "Super Rare")).toBeCloseTo(72.727, 2);
    expect(getCustomPackRarityPercentage(foil.rarityOptions, "Ultra Rare")).toBeCloseTo(18.181, 2);
    expect(getCustomPackRarityPercentage(foil.rarityOptions, "Secret Rare")).toBeCloseTo(9.09, 2);
  });

  it.each([
    ["EARLY_TCG", [[100], [70.3, 18.7, 7.7, 3.3]]],
    ["GX_5DS", [[100], [100], [75, 16.7, 4.2, 4.2]]],
    ["MODERN_CORE", [[100], [72.7, 18.2, 9.1]]],
    ["PROMO_CUSTOM", [[100]]],
  ] as const)("provides browser-safe default percentages for %s", (era, expected) => {
    const preset = getCustomPackEraPreset(era);
    expect(preset.map((slot) => slot.rarityOptions.map((option) => (
      getCustomPackRarityPercentageInputValue(slot.rarityOptions, option.rarity)
    )))).toEqual(expected);
  });

  it("preserves legacy base and upgrade weights", () => {
    const normalized = normalizeCustomPackRarityOptions({
      allowedRarities: ["Rare", "Super Rare", "Ultra Rare"],
      weight: 8,
    });
    expect(normalized).toEqual([
      { rarity: "Rare", weight: 100 },
      { rarity: "Super Rare", weight: 8 },
      { rarity: "Ultra Rare", weight: 8 },
    ]);
    expect(toPersistedCustomPackSlot({
      slotIndex: 0,
      count: 1,
      allowedRarities: [],
      weight: 1,
      rarityOptions: normalized,
    })).toMatchObject({
      allowedRarities: ["Rare", "Super Rare", "Ultra Rare"],
      weight: 8,
      rarityOptions: normalized,
    });
  });
});
