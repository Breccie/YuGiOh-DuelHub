export type RarityTier = "none" | "rare" | "super" | "ultra" | "secret";

function normalizeRarity(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function getRarityTier(value: string | null | undefined): RarityTier {
  const rarity = normalizeRarity(value);

  if (
    rarity.includes("SECRET") ||
    rarity.includes("SCR")
  ) {
    return "secret";
  }

  if (
    rarity.includes("ULTRA") ||
    rarity === "UR" ||
    rarity.includes("ULTIMATE")
  ) {
    return "ultra";
  }

  if (rarity.includes("SUPER") || rarity === "SR") {
    return "super";
  }

  if (rarity.includes("RARE") || rarity === "R") {
    return "rare";
  }

  return "none";
}

export function getRarityAbbreviation(value: string | null | undefined) {
  const rarity = normalizeRarity(value);

  if (!rarity) {
    return "C";
  }

  if (rarity === "UR" || rarity.includes("ULTRA")) {
    return "UR";
  }

  if (rarity === "SR" || rarity.includes("SUPER")) {
    return "SR";
  }

  if (
    rarity === "SCR" ||
    rarity.includes("SECRET")
  ) {
    return "ScR";
  }

  if (rarity === "R" || rarity.includes("RARE")) {
    return "R";
  }

  return "C";
}

export function getRarityLabel(value: string | null | undefined) {
  const rarity = normalizeRarity(value);

  if (!rarity) {
    return "Common";
  }

  if (rarity === "UR") {
    return "Ultra Rare";
  }

  if (rarity === "SR") {
    return "Super Rare";
  }

  if (rarity === "R") {
    return "Rare";
  }

  if (rarity === "SCR") {
    return "Secret Rare";
  }

  return value?.trim() || "Common";
}

export function getHighestRarityTier(
  values: Array<string | null | undefined>,
): RarityTier {
  const rank: Record<RarityTier, number> = {
    none: 0,
    rare: 1,
    super: 2,
    ultra: 3,
    secret: 4,
  };

  return values.reduce<RarityTier>((currentHighest, currentValue) => {
    const nextTier = getRarityTier(currentValue);
    return rank[nextTier] > rank[currentHighest] ? nextTier : currentHighest;
  }, "none");
}
