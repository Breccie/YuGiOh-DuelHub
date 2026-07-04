import { SetProductType } from "@prisma/client";

export type SetLike = {
  code: string;
  name: string;
  releaseDate: Date;
  productType?: SetProductType | string;
  isOpenable?: boolean;
  packSize?: number;
};

export type SetCardLike = {
  id?: string;
  cardId: string;
  setCode: string;
  rarity: string;
};

export type PackCollationKey =
  | "tcg-core-2002"
  | "tcg-core-2008"
  | "tcg-core-2016"
  | "tcg-core-2020"
  | "legacy-core"
  | "modern-core"
  | "rare-plus-foil"
  | "deck-build"
  | "all-foil-4plus1"
  | "all-foil-4ultra-1secret"
  | "battle-pack-2"
  | "rarity-collection-1"
  | "rarity-collection-2"
  | "mega-pack-2020+"
  | "five-card-classic"
  | "fallback";

type RarityBucket =
  | "common"
  | "rare"
  | "super"
  | "ultra"
  | "secret"
  | "prismatic-secret"
  | "platinum-secret"
  | "quarter-century-secret"
  | "collector"
  | "ultimate"
  | "starlight"
  | "ghost"
  | "mosaic"
  | "other";

type DedupeMode = "pack" | "group" | "none";

type SlotDefinition = {
  count: number;
  dedupe: DedupeMode;
  groupKey: string;
  fixedBuckets?: RarityBucket[];
  weightedBuckets?: Array<{
    buckets: RarityBucket[];
    weight: number;
  }>;
};

export type EffectiveSetConfiguration = {
  isOpenable: boolean;
  packSize: number;
  productType: SetProductType;
  collationKey: PackCollationKey;
};

const BOOSTER_WORD_PATTERNS = [
  "tournament pack",
  "champion pack",
  "turbo pack",
  "astral pack",
  "ots tournament pack",
  "star pack",
  "duelist pack",
  "battle pack",
  "premium pack",
  "movie pack",
  "exclusive pack",
  "legendary duelists",
];

const SPECIAL_PRODUCT_PATTERNS = [
  "legendary collection",
  "legendary decks",
  "duel devastator",
  "duel overload",
  "duel power",
  "gold series",
  "maximum gold",
  "hidden arsenal",
  "battles of legend",
  "brothers of legend",
  "dragons of legend",
  "number hunters",
  "hidden summoners",
  "the secret forces",
  "destiny soldiers",
  "fists of the gadgets",
  "world superstars",
  "rarity collection",
  "quarter century",
  "bonanza",
  "stampede",
  "ghosts from the past",
];

const OPENABLE_SPECIAL_PATTERNS = [
  "hidden arsenal",
  "battles of legend",
  "brothers of legend",
  "dragons of legend",
  "number hunters",
  "hidden summoners",
  "the secret forces",
  "destiny soldiers",
  "fists of the gadgets",
  "world superstars",
  "rarity collection",
  "quarter century",
  "bonanza",
  "stampede",
  "maze of",
  "amazing defenders",
  "justice hunters",
  "tactical masters",
  "ancient guardians",
  "the grand creators",
  "wild survivors",
  "crossover breakers",
  "king's court",
  "high-speed riders",
  "wing raiders",
];

const DECK_BUILD_PATTERNS = [
  "amazing defenders",
  "justice hunters",
  "tactical masters",
  "maze of memories",
  "maze of millennia",
  "maze of the master",
  "maze of",
  "ancient guardians",
  "the grand creators",
  "wild survivors",
  "crossover breakers",
  "king's court",
];

const DECK_PRODUCT_PATTERNS = [
  "egyptian god deck",
  "legendary dragon decks",
  "legendary hero decks",
  "legendary 5d",
  "legendary modern decks",
  "the chronicles deck",
];

const FIXED_PROMO_PRODUCT_PATTERNS = [
  "adidas collaboration card",
  "advent calendar",
  "collector box",
  "duel disk",
  "elemental hero collection",
  "event pack speed duel",
  "forbidden legacy",
  "gx next generation",
  "light and darkness power pack",
  "limited collector's edition",
  "limited edition",
  "master collection volume",
  "power-up",
  "samurai assault",
  "special edition",
  "starter chronicles",
  "sweepstakes",
  "twilight edition",
  "ultimate beginner's pack",
  "ultimate edition",
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(value: string, word: string) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(value);
}

function hasAnyPattern(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function isMegaPackName(value: string) {
  return value.includes("mega pack") || value.includes("mega-pack");
}

function pickRandom<T>(items: T[]) {
  if (items.length === 0) {
    throw new Error("Tried to pick a random item from an empty array.");
  }

  return items[Math.floor(Math.random() * items.length)]!;
}

function pickWeightedChoice<T extends { weight: number }>(choices: T[]) {
  const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const choice of choices) {
    roll -= choice.weight;

    if (roll <= 0) {
      return choice;
    }
  }

  return choices.at(-1)!;
}

export function getSetCodeLanguagePriority(setCode: string) {
  const collectorToken = setCode.split("-").at(-1)?.toUpperCase() ?? "";
  const languageToken = collectorToken.replace(/\d+$/g, "");

  if (languageToken.startsWith("EN")) {
    return 0;
  }

  if (!languageToken) {
    return 1;
  }

  if (languageToken === "E") {
    return 2;
  }

  return 3;
}

export function compareSetCodePreference(leftSetCode: string, rightSetCode: string) {
  const priorityDelta =
    getSetCodeLanguagePriority(leftSetCode) - getSetCodeLanguagePriority(rightSetCode);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const lengthDelta = leftSetCode.length - rightSetCode.length;

  if (lengthDelta !== 0) {
    return lengthDelta;
  }

  return leftSetCode.localeCompare(rightSetCode, "en");
}

export function getCanonicalSetCards<
  T extends {
    cardId: string;
    rarity: string;
    setCode: string;
  },
>(setCards: T[]) {
  const canonicalRows = new Map<string, T>();

  for (const setCard of setCards) {
    const key = `${setCard.cardId}::${setCard.rarity}`;
    const existing = canonicalRows.get(key);

    if (
      !existing ||
      compareSetCodePreference(setCard.setCode, existing.setCode) < 0
    ) {
      canonicalRows.set(key, setCard);
    }
  }

  return Array.from(canonicalRows.values());
}

export function inferSetProductType(setName: string) {
  const name = normalizeName(setName);

  if (
    name.includes("starter deck") ||
    name.includes("structure deck") ||
    name.includes("starter set") ||
    name === "2-player starter set" ||
    hasAnyPattern(name, DECK_PRODUCT_PATTERNS)
  ) {
    return SetProductType.DECK;
  }

  if (hasWord(name, "tin") || hasWord(name, "tins")) {
    return SetProductType.TIN;
  }

  if (
    name.includes("promo") ||
    name.includes("promotional") ||
    name.includes("prize card") ||
    name.includes("shonen jump") ||
    name.includes("video game promotional") ||
    name.includes("demo deck") ||
    name.includes("participation card") ||
    name.includes("participation cards") ||
    name.includes("duelist league") ||
    hasAnyPattern(name, FIXED_PROMO_PRODUCT_PATTERNS)
  ) {
    return SetProductType.PROMO;
  }

  if (name.includes("duel terminal")) {
    return SetProductType.BOOSTER;
  }

  if (hasAnyPattern(name, BOOSTER_WORD_PATTERNS)) {
    return SetProductType.BOOSTER;
  }

  if (
    hasAnyPattern(name, SPECIAL_PRODUCT_PATTERNS) ||
    hasAnyPattern(name, DECK_BUILD_PATTERNS) ||
    name.includes("riders")
  ) {
    return SetProductType.SPECIAL;
  }

  return SetProductType.CORE_BOOSTER;
}

export function inferOpenableStatus(setName: string, productType: SetProductType) {
  const name = normalizeName(setName);

  if (productType === SetProductType.DECK || productType === SetProductType.PROMO) {
    return false;
  }

  if (productType === SetProductType.TIN) {
    return isMegaPackName(name);
  }

  if (
    productType === SetProductType.CORE_BOOSTER ||
    productType === SetProductType.BOOSTER
  ) {
    return true;
  }

  return hasAnyPattern(name, OPENABLE_SPECIAL_PATTERNS);
}

export function inferPackSize(setName: string, productType: SetProductType) {
  const name = normalizeName(setName);

  if (!inferOpenableStatus(setName, productType)) {
    return 1;
  }

  if (isMegaPackName(name)) {
    return 16;
  }

  if (name.includes("duel terminal")) {
    return 1;
  }

  if (name.includes("speed duel tournament pack")) {
    return 2;
  }

  if (name.includes("movie pack")) {
    return 4;
  }

  if (name.includes("anniversary pack") || name.includes("exclusive pack")) {
    return 8;
  }

  if (
    name.includes("tournament pack") ||
    name.includes("champion pack") ||
    name.includes("turbo pack") ||
    name.includes("astral pack") ||
    name.includes("ots tournament pack") ||
    name.includes("star pack")
  ) {
    return 3;
  }

  if (name.includes("rarity collection ii")) {
    return 9;
  }

  if (
    name.includes("rarity collection") ||
    name.includes("bonanza") ||
    name.includes("stampede") ||
    name.includes("battle pack") ||
    name.includes("duelist pack") ||
    name.includes("legendary duelists") ||
    name.includes("premium pack") ||
    name.includes("hidden arsenal") ||
    name.includes("battles of legend") ||
    name.includes("brothers of legend") ||
    name.includes("dragons of legend") ||
    name.includes("movie pack") ||
    name.includes("exclusive pack") ||
    name.includes("number hunters") ||
    name.includes("hidden summoners") ||
    name.includes("destiny soldiers") ||
    name.includes("the secret forces") ||
    name.includes("fists of the gadgets") ||
    name.includes("world superstars") ||
    name.includes("ghosts from the past")
  ) {
    return 5;
  }

  if (hasAnyPattern(name, DECK_BUILD_PATTERNS)) {
    return 7;
  }

  return 9;
}

function getRarityBucket(rarity: string): RarityBucket {
  const normalizedRarity = normalizeName(rarity);

  if (normalizedRarity.includes("quarter century secret")) {
    return "quarter-century-secret";
  }

  if (normalizedRarity.includes("platinum secret")) {
    return "platinum-secret";
  }

  if (normalizedRarity.includes("prismatic secret")) {
    return "prismatic-secret";
  }

  if (normalizedRarity.includes("starlight")) {
    return "starlight";
  }

  if (normalizedRarity.includes("collector")) {
    return "collector";
  }

  if (normalizedRarity.includes("ultimate")) {
    return "ultimate";
  }

  if (normalizedRarity.includes("ghost")) {
    return "ghost";
  }

  if (normalizedRarity.includes("mosaic")) {
    return "mosaic";
  }

  if (normalizedRarity.includes("secret")) {
    return "secret";
  }

  if (normalizedRarity.includes("ultra")) {
    return "ultra";
  }

  if (normalizedRarity.includes("super")) {
    return "super";
  }

  if (normalizedRarity === "rare" || normalizedRarity.endsWith(" rare")) {
    return "rare";
  }

  if (
    normalizedRarity.includes("common") ||
    normalizedRarity.includes("short print")
  ) {
    return "common";
  }

  return "other";
}

function getBucketSet(setCards: SetCardLike[]) {
  return new Set(setCards.map((setCard) => getRarityBucket(setCard.rarity)));
}

function getUniqueBucketCount(setCards: SetCardLike[]) {
  const counts = new Map<string, Set<RarityBucket>>();

  for (const setCard of setCards) {
    const buckets = counts.get(setCard.cardId) ?? new Set<RarityBucket>();
    buckets.add(getRarityBucket(setCard.rarity));
    counts.set(setCard.cardId, buckets);
  }

  return Math.max(
    0,
    ...Array.from(counts.values(), (buckets) => buckets.size),
  );
}

function getPackCollationKey(
  set: SetLike,
  setCards: SetCardLike[],
): PackCollationKey {
  const name = normalizeName(set.name);
  const inferredProductType = inferSetProductType(set.name);
  const inferredPackSize = inferPackSize(set.name, inferredProductType);
  const buckets = getBucketSet(setCards);
  const hasCommon = buckets.has("common");
  const hasRare = buckets.has("rare");
  const hasSuper = buckets.has("super");
  const hasUltra = buckets.has("ultra");
  const hasSecret =
    buckets.has("secret") ||
    buckets.has("prismatic-secret") ||
    buckets.has("platinum-secret") ||
    buckets.has("quarter-century-secret");
  const maxRarityVariantsPerCard = getUniqueBucketCount(setCards);
  const isCoreBoosterLike =
    inferredProductType === SetProductType.CORE_BOOSTER &&
    inferredPackSize === 9 &&
    hasCommon &&
    (hasRare || hasSuper || hasUltra || hasSecret);

  if (inferredPackSize === 3) {
    return "fallback";
  }

  if (inferredPackSize < 5 || inferredPackSize === 8) {
    return "fallback";
  }

  if (name.includes("rarity collection ii")) {
    return "rarity-collection-2";
  }

  if (name.includes("rarity collection")) {
    return "rarity-collection-1";
  }

  if (isMegaPackName(name)) {
    return "mega-pack-2020+";
  }

  if (buckets.has("mosaic")) {
    return "battle-pack-2";
  }

  if (
    !hasCommon &&
    !hasRare &&
    hasSuper &&
    hasSecret
  ) {
    return "all-foil-4plus1";
  }

  if (
    !hasCommon &&
    !hasRare &&
    !hasSuper &&
    hasUltra &&
    hasSecret
  ) {
    return "all-foil-4ultra-1secret";
  }

  if (
    !hasCommon &&
    hasRare &&
    (hasSuper || hasUltra || hasSecret || buckets.has("collector") || buckets.has("starlight"))
  ) {
    if (maxRarityVariantsPerCard >= 5) {
      return "rarity-collection-2";
    }

    return "deck-build";
  }

  if (isCoreBoosterLike) {
    if (!hasRare || set.releaseDate >= new Date("2020-04-30T00:00:00.000Z")) {
      return "tcg-core-2020";
    }

    if (set.releaseDate >= new Date("2016-01-14T00:00:00.000Z")) {
      return "tcg-core-2016";
    }

    if (set.releaseDate >= new Date("2008-09-02T00:00:00.000Z")) {
      return "tcg-core-2008";
    }

    return "tcg-core-2002";
  }

  if (
    hasCommon &&
    hasRare &&
    (hasSuper || hasUltra || hasSecret) &&
    (name.includes("riders") || set.releaseDate >= new Date("2015-07-01T00:00:00.000Z"))
  ) {
    return "rare-plus-foil";
  }

  if (hasCommon && !hasRare && (hasSuper || hasUltra || hasSecret)) {
    return "modern-core";
  }

  if (hasCommon && hasRare && (hasSuper || hasUltra || hasSecret)) {
    return inferredPackSize === 5 ? "five-card-classic" : "legacy-core";
  }

  return "fallback";
}

function buildWeightedFoilChoices(setCards: SetCardLike[]) {
  const buckets = getBucketSet(setCards);
  const choices: SlotDefinition["weightedBuckets"] = [];
  const pushChoice = (bucket: RarityBucket, weight: number) => {
    if (buckets.has(bucket)) {
      choices.push({
        buckets: [bucket],
        weight,
      });
    }
  };

  pushChoice("ghost", 1);
  pushChoice("starlight", 1);
  pushChoice("quarter-century-secret", 1);
  pushChoice("platinum-secret", 1);
  pushChoice("prismatic-secret", 2);
  pushChoice("collector", 2);
  pushChoice("ultimate", 2);
  pushChoice("secret", 8);
  pushChoice("ultra", 18);
  pushChoice("super", 40);

  return choices;
}

function buildRareOrBetterChoices(setCards: SetCardLike[]) {
  const buckets = getBucketSet(setCards);
  const choices: SlotDefinition["weightedBuckets"] = [];
  const pushChoice = (bucket: RarityBucket, weight: number) => {
    if (buckets.has(bucket)) {
      choices.push({
        buckets: [bucket],
        weight,
      });
    }
  };

  pushChoice("ghost", 1);
  pushChoice("starlight", 1);
  pushChoice("quarter-century-secret", 1);
  pushChoice("platinum-secret", 1);
  pushChoice("prismatic-secret", 2);
  pushChoice("collector", 2);
  pushChoice("ultimate", 2);
  pushChoice("secret", 3);
  pushChoice("ultra", 7);
  pushChoice("super", 17);
  pushChoice("rare", 64);

  return choices;
}

function buildLegacyCoreFoilOrCommonChoices(setCards: SetCardLike[]) {
  const buckets = getBucketSet(setCards);
  const choices: SlotDefinition["weightedBuckets"] = [];

  if (buckets.has("common")) {
    choices.push({
      buckets: ["common"],
      weight: 18,
    });
  }

  if (buckets.has("super")) {
    choices.push({
      buckets: ["super"],
      weight: 4,
    });
  }

  if (buckets.has("ultra")) {
    choices.push({
      buckets: ["ultra"],
      weight: 1,
    });
  }

  if (buckets.has("secret")) {
    choices.push({
      buckets: ["secret"],
      weight: 1,
    });
  }

  return choices;
}

function buildModernCoreFoilChoices(setCards: SetCardLike[]) {
  const buckets = getBucketSet(setCards);
  const choices: SlotDefinition["weightedBuckets"] = [];

  if (buckets.has("super")) {
    choices.push({
      buckets: ["super"],
      weight: 8,
    });
  }

  if (buckets.has("ultra")) {
    choices.push({
      buckets: ["ultra"],
      weight: 2,
    });
  }

  if (buckets.has("secret")) {
    choices.push({
      buckets: ["secret"],
      weight: 1,
    });
  }

  if (buckets.has("starlight")) {
    choices.push({
      buckets: ["starlight"],
      weight: 0.05,
    });
  }

  if (buckets.has("quarter-century-secret")) {
    choices.push({
      buckets: ["quarter-century-secret"],
      weight: 0.05,
    });
  }

  return choices;
}

function getSlotDefinitions(
  configuration: EffectiveSetConfiguration,
  collationKey: PackCollationKey,
  setCards: SetCardLike[],
): SlotDefinition[] {
  switch (collationKey) {
    case "rarity-collection-1":
      return [
        {
          count: 2,
          dedupe: "group",
          groupKey: "ra01-super",
          fixedBuckets: ["super"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "ra01-secret",
          weightedBuckets: [
            { buckets: ["secret"], weight: 6 },
            { buckets: ["platinum-secret"], weight: 1 },
            { buckets: ["quarter-century-secret"], weight: 1 },
          ],
        },
        {
          count: 2,
          dedupe: "group",
          groupKey: "ra01-ultra",
          weightedBuckets: [
            { buckets: ["ultra"], weight: 10 },
            { buckets: ["collector"], weight: 1 },
            { buckets: ["ultimate"], weight: 1 },
          ],
        },
      ];
    case "rarity-collection-2":
      return [
        {
          count: 3,
          dedupe: "group",
          groupKey: "ra02-super",
          fixedBuckets: ["super"],
        },
        {
          count: 2,
          dedupe: "group",
          groupKey: "ra02-secret",
          weightedBuckets: [
            { buckets: ["secret"], weight: 6 },
            { buckets: ["platinum-secret"], weight: 1 },
            { buckets: ["quarter-century-secret"], weight: 1 },
          ],
        },
        {
          count: 4,
          dedupe: "group",
          groupKey: "ra02-ultra",
          weightedBuckets: [
            { buckets: ["ultra"], weight: 10 },
            { buckets: ["collector"], weight: 1 },
            { buckets: ["ultimate"], weight: 1 },
          ],
        },
      ];
    case "battle-pack-2":
      return [
        {
          count: 1,
          dedupe: "group",
          groupKey: "bp-rare",
          fixedBuckets: ["rare"],
        },
        {
          count: 3,
          dedupe: "group",
          groupKey: "bp-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "bp-mosaic",
          fixedBuckets: ["mosaic"],
        },
      ];
    case "all-foil-4plus1":
      return [
        {
          count: 4,
          dedupe: "group",
          groupKey: "foil-super",
          fixedBuckets: ["super"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "foil-secret",
          fixedBuckets: ["secret"],
        },
      ];
    case "all-foil-4ultra-1secret":
      return [
        {
          count: 4,
          dedupe: "group",
          groupKey: "foil-ultra",
          fixedBuckets: ["ultra"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "foil-secret",
          fixedBuckets: ["secret"],
        },
      ];
    case "deck-build":
      return [
        {
          count: 6,
          dedupe: "group",
          groupKey: "deck-build-rare",
          fixedBuckets: ["rare"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "deck-build-foil",
          weightedBuckets: buildWeightedFoilChoices(setCards),
        },
      ];
    case "mega-pack-2020+":
      return [
        {
          count: 12,
          dedupe: "pack",
          groupKey: "mega-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "mega-rare",
          fixedBuckets: ["rare"],
        },
        {
          count: 2,
          dedupe: "pack",
          groupKey: "mega-super",
          fixedBuckets: ["super"],
        },
        {
          count: 2,
          dedupe: "pack",
          groupKey: "mega-ultra",
          fixedBuckets: ["ultra"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "mega-secret",
          fixedBuckets: ["prismatic-secret", "secret"],
        },
      ];
    case "rare-plus-foil":
    case "tcg-core-2016":
      return [
        {
          count: 7,
          dedupe: "pack",
          groupKey: "rare-plus-foil-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "rare-plus-foil-rare",
          fixedBuckets: ["rare"],
        },
        {
          count: 1,
          dedupe: "group",
          groupKey: "rare-plus-foil-foil",
          weightedBuckets: buildWeightedFoilChoices(setCards),
        },
      ];
    case "modern-core":
    case "tcg-core-2020":
      return [
        {
          count: 8,
          dedupe: "pack",
          groupKey: "modern-core-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "modern-core-foil",
          weightedBuckets: buildModernCoreFoilChoices(setCards),
        },
      ];
    case "tcg-core-2008":
      return [
        {
          count: 7,
          dedupe: "pack",
          groupKey: "tcg-core-2008-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "tcg-core-2008-rare",
          fixedBuckets: ["rare"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "tcg-core-2008-common-or-foil",
          weightedBuckets: buildLegacyCoreFoilOrCommonChoices(setCards),
        },
      ];
    case "five-card-classic":
      return [
        {
          count: 4,
          dedupe: "pack",
          groupKey: "classic-five-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "classic-five-rare",
          weightedBuckets: buildRareOrBetterChoices(setCards),
        },
      ];
    case "legacy-core":
    case "tcg-core-2002":
      return [
        {
          count: 8,
          dedupe: "pack",
          groupKey: "legacy-core-common",
          fixedBuckets: ["common"],
        },
        {
          count: 1,
          dedupe: "pack",
          groupKey: "legacy-core-rare",
          weightedBuckets: buildRareOrBetterChoices(setCards),
        },
      ];
    default: {
      const hasCommon = getBucketSet(setCards).has("common");
      const hasRareOrBetter = setCards.some((setCard) => {
        return getRarityBucket(setCard.rarity) !== "common";
      });

      if (hasCommon) {
        return [
          {
            count: hasRareOrBetter ? Math.max(configuration.packSize - 1, 0) : configuration.packSize,
            dedupe: "pack",
            groupKey: "fallback-common",
            fixedBuckets: ["common"],
          },
          ...(hasRareOrBetter
            ? [
                {
                  count: 1,
                  dedupe: "pack" as const,
                  groupKey: "fallback-rare",
                  weightedBuckets: buildRareOrBetterChoices(setCards),
                },
              ]
            : []),
        ];
      }

      return [
        {
          count: configuration.packSize,
          dedupe: "pack",
          groupKey: "fallback-all",
          fixedBuckets: [
            "rare",
            "super",
            "ultra",
            "secret",
            "prismatic-secret",
            "platinum-secret",
            "quarter-century-secret",
            "collector",
            "ultimate",
            "starlight",
            "ghost",
            "mosaic",
            "other",
          ],
        },
      ];
    }
  }
}

export function getEffectiveSetConfiguration(
  set: SetLike,
  setCards: SetCardLike[],
): EffectiveSetConfiguration {
  const inferredProductType = inferSetProductType(set.name);
  const inferredIsOpenable = inferOpenableStatus(set.name, inferredProductType);
  const inferredPackSize = inferPackSize(set.name, inferredProductType);
  const collationKey = getPackCollationKey(set, setCards);

  if (!inferredIsOpenable) {
    return {
      isOpenable: false,
      packSize: inferredPackSize,
      productType: inferredProductType,
      collationKey: "fallback",
    };
  }

  switch (collationKey) {
    case "rarity-collection-1":
      return {
        isOpenable: true,
        packSize: 5,
        productType: SetProductType.SPECIAL,
        collationKey,
      };
    case "rarity-collection-2":
      return {
        isOpenable: true,
        packSize: 9,
        productType: SetProductType.SPECIAL,
        collationKey,
      };
    case "battle-pack-2":
      return {
        isOpenable: true,
        packSize: 5,
        productType: SetProductType.BOOSTER,
        collationKey,
      };
    case "all-foil-4plus1":
      return {
        isOpenable: true,
        packSize: 5,
        productType: SetProductType.SPECIAL,
        collationKey,
      };
    case "all-foil-4ultra-1secret":
      return {
        isOpenable: true,
        packSize: 5,
        productType: SetProductType.SPECIAL,
        collationKey,
      };
    case "deck-build":
      return {
        isOpenable: true,
        packSize: 7,
        productType: SetProductType.BOOSTER,
        collationKey,
      };
    case "mega-pack-2020+":
      return {
        isOpenable: true,
        packSize: 16,
        productType: SetProductType.TIN,
        collationKey,
      };
    case "rare-plus-foil":
    case "tcg-core-2016":
      return {
        isOpenable: true,
        packSize: 9,
        productType: inferredProductType === SetProductType.CORE_BOOSTER
          ? SetProductType.BOOSTER
          : inferredProductType,
        collationKey,
      };
    case "modern-core":
    case "tcg-core-2020":
      return {
        isOpenable: true,
        packSize: 9,
        productType: SetProductType.CORE_BOOSTER,
        collationKey,
      };
    case "five-card-classic":
      return {
        isOpenable: true,
        packSize: 5,
        productType: inferredProductType,
        collationKey,
      };
    case "legacy-core":
    case "tcg-core-2002":
    case "tcg-core-2008":
      return {
        isOpenable: true,
        packSize: 9,
        productType: SetProductType.CORE_BOOSTER,
        collationKey,
      };
    default:
      return {
        isOpenable: inferredIsOpenable,
        packSize: inferredPackSize,
        productType: inferredProductType,
        collationKey,
      };
  }
}

function getEligibleCards(
  setCards: SetCardLike[],
  buckets: RarityBucket[],
  dedupe: DedupeMode,
  usedPackCardIds: Set<string>,
  usedGroupCardIds: Set<string>,
) {
  const matchingCards = setCards.filter((setCard) => {
    return buckets.includes(getRarityBucket(setCard.rarity));
  });

  const dedupedCards = matchingCards.filter((setCard) => {
    if (dedupe === "pack") {
      return !usedPackCardIds.has(setCard.cardId);
    }

    if (dedupe === "group") {
      return !usedGroupCardIds.has(setCard.cardId);
    }

    return true;
  });

  return dedupedCards.length > 0 ? dedupedCards : matchingCards;
}

function generateCardsFromSlots(
  setName: string,
  setCards: SetCardLike[],
  collationKey: PackCollationKey,
  slots: SlotDefinition[],
) {
  const pulledCards: SetCardLike[] = [];
  const usedPackCardIds = new Set<string>();
  const usedCardIdsByGroup = new Map<string, Set<string>>();

  for (const slot of slots) {
    const usedGroupCardIds =
      usedCardIdsByGroup.get(slot.groupKey) ?? new Set<string>();

    for (let slotIndex = 0; slotIndex < slot.count; slotIndex += 1) {
      const buckets =
        slot.weightedBuckets && slot.weightedBuckets.length > 0
          ? pickWeightedChoice(
              slot.weightedBuckets.filter((choice) => {
                return (
                  getEligibleCards(
                    setCards,
                    choice.buckets,
                    slot.dedupe,
                    usedPackCardIds,
                    usedGroupCardIds,
                  ).length > 0
                );
              }),
            ).buckets
          : slot.fixedBuckets ?? [];

      const eligibleCards = getEligibleCards(
        setCards,
        buckets,
        slot.dedupe,
        usedPackCardIds,
        usedGroupCardIds,
      );

      if (eligibleCards.length === 0) {
        throw new Error(
          `Set "${setName}" has no eligible cards for ${collationKey} (${slot.groupKey}).`,
        );
      }

      const selectedCard = pickRandom(eligibleCards);
      pulledCards.push(selectedCard);

      if (slot.dedupe === "pack") {
        usedPackCardIds.add(selectedCard.cardId);
      }

      if (slot.dedupe === "group") {
        usedGroupCardIds.add(selectedCard.cardId);
      }
    }

    usedCardIdsByGroup.set(slot.groupKey, usedGroupCardIds);
  }

  return pulledCards;
}

export function generatePackCards(set: SetLike, setCards: SetCardLike[]) {
  const configuration = getEffectiveSetConfiguration(set, setCards);
  const slots = getSlotDefinitions(configuration, configuration.collationKey, setCards);

  return generateCardsFromSlots(
    set.name,
    setCards,
    configuration.collationKey,
    slots,
  );
}
