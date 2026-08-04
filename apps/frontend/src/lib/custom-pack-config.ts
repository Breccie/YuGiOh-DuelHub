import type { CustomPackEra, UpdateCustomPackDraftRequest } from "@ygo/contracts";

export type CustomPackRarityOption = {
  rarity: string;
  weight: number;
};

export type CustomPackSlotDraft = UpdateCustomPackDraftRequest["slots"][number] & {
  rarityOptions: CustomPackRarityOption[];
};

const ERA_PRESETS: Record<CustomPackEra, CustomPackRarityOption[][]> = {
  EARLY_TCG: [
    [{ rarity: "Common", weight: 100 }],
    [
      { rarity: "Rare", weight: 64 },
      { rarity: "Super Rare", weight: 17 },
      { rarity: "Ultra Rare", weight: 7 },
      { rarity: "Secret Rare", weight: 3 },
    ],
  ],
  GX_5DS: [
    [{ rarity: "Common", weight: 100 }],
    [{ rarity: "Rare", weight: 100 }],
    [
      { rarity: "Common", weight: 18 },
      { rarity: "Super Rare", weight: 4 },
      { rarity: "Ultra Rare", weight: 1 },
      { rarity: "Secret Rare", weight: 1 },
    ],
  ],
  MODERN_CORE: [
    [{ rarity: "Common", weight: 100 }],
    [
      { rarity: "Super Rare", weight: 8 },
      { rarity: "Ultra Rare", weight: 2 },
      { rarity: "Secret Rare", weight: 1 },
    ],
  ],
  PROMO_CUSTOM: [[{ rarity: "Promo", weight: 100 }]],
};

const ERA_COUNTS: Record<CustomPackEra, number[]> = {
  EARLY_TCG: [8, 1],
  GX_5DS: [7, 1, 1],
  MODERN_CORE: [8, 1],
  PROMO_CUSTOM: [1],
};

export function getCustomPackEraPreset(era: CustomPackEra): CustomPackSlotDraft[] {
  return ERA_PRESETS[era].map((rarityOptions, slotIndex) => ({
    slotIndex,
    count: ERA_COUNTS[era][slotIndex] ?? 1,
    rarityOptions: rarityOptions.map((option) => ({ ...option })),
    allowedRarities: rarityOptions.map((option) => option.rarity),
    weight: rarityOptions[1]?.weight ?? 1,
  }));
}

export function normalizeCustomPackRarityOptions(slot: {
  allowedRarities: unknown;
  weight: number;
  rarityWeights?: unknown;
  rarityOptions?: unknown;
}): CustomPackRarityOption[] {
  const candidate = Array.isArray(slot.rarityOptions)
    ? slot.rarityOptions
    : Array.isArray(slot.rarityWeights)
      ? slot.rarityWeights
      : null;

  if (candidate) {
    const normalized = candidate.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const rarity = "rarity" in value && typeof value.rarity === "string"
        ? value.rarity.trim()
        : "";
      const weight = "weight" in value && typeof value.weight === "number"
        ? Math.max(1, Math.round(value.weight))
        : 0;
      return rarity && weight ? [{ rarity, weight }] : [];
    });
    if (normalized.length > 0) return normalized;
  }

  const allowedRarities = Array.isArray(slot.allowedRarities)
    ? slot.allowedRarities.filter((rarity): rarity is string => typeof rarity === "string" && Boolean(rarity.trim()))
    : [];
  return allowedRarities.map((rarity, index) => ({
    rarity,
    weight: index === 0 ? 100 : Math.max(1, slot.weight),
  }));
}

export function toPersistedCustomPackSlot(slot: CustomPackSlotDraft) {
  const rarityOptions = slot.rarityOptions.map((option) => ({
    rarity: option.rarity,
    weight: Math.max(1, Math.round(option.weight)),
  }));
  return {
    slotIndex: slot.slotIndex,
    count: slot.count,
    rarityOptions,
    allowedRarities: rarityOptions.map((option) => option.rarity),
    weight: rarityOptions[1]?.weight ?? 1,
  };
}

export function getCustomPackRarityPercentage(options: CustomPackRarityOption[], rarity: string) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  if (total <= 0) return 0;
  return ((options.find((option) => option.rarity === rarity)?.weight ?? 0) / total) * 100;
}

export function getCustomPackRarityPercentageInputValue(
  options: CustomPackRarityOption[],
  rarity: string,
) {
  return Number(getCustomPackRarityPercentage(options, rarity).toFixed(1));
}
