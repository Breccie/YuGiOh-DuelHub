import type { PromoClaimMode, PromoSourceType, SetProductType } from "@prisma/client";

type PromoSourceOverride = {
  label?: string;
  sourceType?: PromoSourceType;
  claimMode?: PromoClaimMode;
  availableFrom?: string | null;
  description?: string | null;
};

type PromoSetInput = {
  code: string;
  name: string;
  releaseDate: Date;
  productType: SetProductType;
  isOpenable: boolean;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTournamentPackProduct(name: string) {
  return (
    name.includes("tournament pack") ||
    name.includes("champion pack") ||
    name.includes("turbo pack") ||
    name.includes("astral pack") ||
    name.includes("ots tournament pack")
  );
}

export function classifyPromoSource(
  set: PromoSetInput,
  override?: PromoSourceOverride,
) {
  const name = normalize(set.name);

  if (override?.sourceType) {
    return {
      code: `promo-${slugify(set.code || set.name)}`,
      name: override.label ?? set.name,
      description: override.description ?? null,
      sourceType: override.sourceType,
      claimMode: override.claimMode ?? "CHOOSE",
      availableFrom: override.availableFrom
        ? new Date(override.availableFrom)
        : set.releaseDate,
    };
  }

  if (set.isOpenable || isTournamentPackProduct(name)) {
    return null;
  }

  if (name.includes("prize card") || name.includes("world championship prize")) {
    return {
      code: `promo-${slugify(set.code || set.name)}`,
      name: set.name,
      description: "Historische Preis-Promo; nur durch Organizer vergebbar.",
      sourceType: "PRIZE_PROMO" as PromoSourceType,
      claimMode: "ORGANIZER_ONLY" as PromoClaimMode,
      availableFrom: set.releaseDate,
    };
  }

  if (
    name.includes("mcdonald") ||
    name.includes("shonen jump") ||
    name.includes("jump") ||
    name.includes("manga") ||
    name.includes("volume") ||
    name.includes("video game") ||
    name.includes("game promotional") ||
    name.includes("movie") ||
    name.includes("dvd") ||
    name.includes("duelist league") ||
    name.includes("hobby league") ||
    name.includes("sneak peek") ||
    set.productType === "PROMO"
  ) {
    const fixed =
      name.includes("video game") ||
      name.includes("manga") ||
      name.includes("volume") ||
      name.includes("dvd");

    return {
      code: `promo-${slugify(set.code || set.name)}`,
      name: set.name,
      description: fixed
        ? "Historische feste Promo-Beilage; Access wird nicht verbraucht."
        : "Historische Promo-Quelle; Karten können unbegrenzt geclaimt werden.",
      sourceType: fixed
        ? ("FIXED_PROMO_GRANT" as PromoSourceType)
        : ("PROMO_CHOICE" as PromoSourceType),
      claimMode: fixed
        ? ("FIXED" as PromoClaimMode)
        : ("CHOOSE" as PromoClaimMode),
      availableFrom: set.releaseDate,
    };
  }

  return null;
}
