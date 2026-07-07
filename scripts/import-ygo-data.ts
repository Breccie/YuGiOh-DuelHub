import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  CardKind,
  ErrataPolicy,
  FormatType,
  PrismaClient,
  Region,
  SetProductType,
} from "@prisma/client";
import {
  compareSetCodePreference,
  inferOpenableStatus,
  inferPackSize,
  inferSetProductType,
} from "../apps/frontend/src/lib/pack-collation";
import { classifyPromoSource } from "../apps/frontend/src/lib/promo-source-classification";

const prisma = new PrismaClient();

const workspaceRoot = process.cwd();
const setOverridesPath = resolve(
  workspaceRoot,
  "data",
  "import-overrides",
  "set-overrides.json",
);
const errataOverridesPath = resolve(
  workspaceRoot,
  "data",
  "import-overrides",
  "errata-timeline.json",
);
const promoSourceOverridesPath = resolve(
  workspaceRoot,
  "data",
  "import-overrides",
  "promo-sources.json",
);
const localBanlistsDirectory = resolve(workspaceRoot, "data", "banlists");

const fallbackOfficialBanlistFiles = [
  "0TCG.lflist.conf",
  "Rush-Prerelease.lflist.conf",
  "Rush.lflist.conf",
  "Speed.lflist.conf",
  "World.lflist.conf",
  "Traditional.lflist.conf",
  "GOAT.lflist.conf",
  "OCG.lflist.conf",
] as const;
const legacyTcgArchiveUrl =
  "https://raw.githubusercontent.com/purerosefallen/ygopro/master/lflist.conf";

const importedCurrentTextSourceNote =
  "Imported current text from YGOPRODeck v7. Historical errata must be supplied through local overrides.";
const importedSetNote =
  "Imported from YGOPRODeck cardsets/cardinfo data. Pack size and openable status may include local overrides and heuristics.";
const importedBanlistNotePrefix =
  "Imported from Project Ignis LFLists, legacy YGOPro archives, or local .lflist.conf source.";

type SetProductTypeValue = SetProductType;

type CliOptions = {
  limitCards: number | null;
  skipCatalog: boolean;
  skipBanlists: boolean;
};

type YgoSetSummary = {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  tcg_date?: string | null;
  set_image?: string;
};

type YgoCardSetEntry = {
  set_name: string;
  set_code: string;
  set_rarity?: string | null;
  set_rarity_code?: string | null;
};

type YgoCard = {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  race?: string;
  attribute?: string;
  level?: number;
  rank?: number;
  linkval?: number;
  atk?: number;
  def?: number;
  pend_desc?: string;
  card_sets?: YgoCardSetEntry[];
};

type YgoCardResponse = {
  data: YgoCard[];
};

type SetOverrideFile = {
  sets: Record<
    string,
    {
      packSize?: number;
      isOpenable?: boolean;
      productType?: SetProductTypeValue;
      notes?: string | null;
    }
  >;
};

type ErrataOverrideFile = {
  cards: Array<{
    passcode: string | number;
    name?: string;
    versions: Array<{
      label: string;
      effectText: string;
      pendulumText?: string | null;
      effectiveFrom: string;
      effectiveTo?: string | null;
      isErrata?: boolean;
      isCurrent?: boolean;
      sourceNote?: string | null;
    }>;
  }>;
};

type PromoSourceOverrideFile = {
  sources: Record<
    string,
    {
      label?: string;
      sourceType?: "PACK_REWARD" | "PROMO_CHOICE" | "FIXED_PROMO_GRANT" | "PRIZE_PROMO";
      claimMode?: "CHOOSE" | "RANDOM" | "FIXED" | "ORGANIZER_ONLY";
      availableFrom?: string | null;
      description?: string | null;
    }
  >;
};

type ErrataOverride = ErrataOverrideFile["cards"][number];

type ParsedBanlist = {
  formatSlug: string;
  formatName: string;
  formatType: FormatType;
  region: Region;
  name: string;
  effectiveFrom: Date;
  entries: Array<{
    passcode: string;
    allowedCopies: number;
    cardNameHint: string | null;
  }>;
  sourceLabel: string;
};

type GitHubRepositoryEntry = {
  name: string;
  type: "file" | "dir";
};

function parseArgs(argv: string[]): CliOptions {
  let limitCards: number | null = null;
  let skipCatalog = false;
  let skipBanlists = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--skip-catalog") {
      skipCatalog = true;
      continue;
    }

    if (argument === "--skip-banlists") {
      skipBanlists = true;
      continue;
    }

    if (argument === "--limit-cards") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("Missing value after `--limit-cards`.");
      }

      limitCards = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    if (argument.startsWith("--limit-cards=")) {
      limitCards = Number.parseInt(argument.split("=")[1] ?? "", 10);
      continue;
    }
  }

  if (limitCards !== null && (!Number.isFinite(limitCards) || limitCards < 1)) {
    throw new Error("`--limit-cards` must be a positive integer.");
  }

  return {
    limitCards,
    skipCatalog,
    skipBanlists,
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildImportedCardSlug(card: YgoCard) {
  return `${slugify(card.name)}-${card.id}`;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const isoValue = `${value}T00:00:00.000Z`;
  const date = new Date(isoValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getEarliestCardDate(card: YgoCard, setReleaseDateByName: Map<string, Date>) {
  const dates = (card.card_sets ?? [])
    .map((entry) => setReleaseDateByName.get(normalizeWhitespace(entry.set_name)))
    .filter((entry): entry is Date => entry instanceof Date);

  if (dates.length === 0) {
    return new Date("1900-01-01T00:00:00.000Z");
  }

  return dates.sort((left, right) => left.getTime() - right.getTime())[0];
}

function resolveCardKind(card: YgoCard) {
  const frameType = card.frameType.toLowerCase();
  const type = card.type.toLowerCase();

  if (frameType === "spell" || type.includes("spell")) {
    return CardKind.SPELL;
  }

  if (frameType === "trap" || type.includes("trap")) {
    return CardKind.TRAP;
  }

  if (frameType === "token" || type.includes("token")) {
    return CardKind.TOKEN;
  }

  return CardKind.MONSTER;
}

function resolveLevelRankLink(card: YgoCard) {
  if (typeof card.linkval === "number") {
    return card.linkval;
  }

  if (typeof card.level === "number") {
    return card.level;
  }

  if (typeof card.rank === "number") {
    return card.rank;
  }

  return null;
}

function extractSetPrefix(setCode: string) {
  return setCode.split("-")[0] ?? setCode;
}

function extractCollectorNumber(setCode: string) {
  const fragments = setCode.split("-");

  if (fragments.length < 2) {
    return null;
  }

  return fragments.at(-1) ?? null;
}

function inferPullWeight(rarity: string) {
  const normalizedRarity = rarity.toLowerCase();

  if (normalizedRarity.includes("common")) {
    return 8;
  }

  if (
    normalizedRarity.includes("rare") &&
    !normalizedRarity.includes("super") &&
    !normalizedRarity.includes("ultra") &&
    !normalizedRarity.includes("secret") &&
    !normalizedRarity.includes("ultimate")
  ) {
    return 4;
  }

  if (normalizedRarity.includes("super")) {
    return 2;
  }

  return 1;
}

function readJsonFile<T>(filePath: string, fallbackValue: T) {
  if (!existsSync(filePath)) {
    return fallbackValue;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function loadSetOverrides() {
  const parsed = readJsonFile<SetOverrideFile>(setOverridesPath, {
    sets: {},
  });

  return new Map(
    Object.entries(parsed.sets).map(([setCode, override]) => [setCode.toUpperCase(), override]),
  );
}

function loadErrataOverrides() {
  const parsed = readJsonFile<ErrataOverrideFile>(errataOverridesPath, {
    cards: [],
  });

  return new Map(
    parsed.cards.map((entry) => [String(entry.passcode), entry]),
  );
}

function loadPromoSourceOverrides() {
  if (!existsSync(promoSourceOverridesPath)) {
    return new Map<string, PromoSourceOverrideFile["sources"][string]>();
  }

  const parsed = JSON.parse(
    readFileSync(promoSourceOverridesPath, "utf8"),
  ) as PromoSourceOverrideFile;

  return new Map(
    Object.entries(parsed.sources).map(([code, override]) => [
      code.toUpperCase(),
      override,
    ]),
  );
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function importCatalog(limitCards: number | null) {
  console.log("Loading YGOPRODeck catalog...");

  const [setSummaries, cardResponse] = await Promise.all([
    fetchJson<YgoSetSummary[]>("https://db.ygoprodeck.com/api/v7/cardsets.php"),
    fetchJson<YgoCardResponse>("https://db.ygoprodeck.com/api/v7/cardinfo.php"),
  ]);

  const filteredSetSummaries = setSummaries.filter((entry) => parseDateOnly(entry.tcg_date));
  const setOverrides = loadSetOverrides();

  const normalizedSetRowByCode = new Map<
    string,
    {
      code: string;
      name: string;
      releaseDate: Date;
      region: Region;
      productType: SetProductTypeValue;
      isOpenable: boolean;
      packSize: number;
      imageUrl: string | null;
      notes: string;
    }
  >();

  for (const entry of filteredSetSummaries) {
    const setCode = entry.set_code.toUpperCase();
    const override = setOverrides.get(setCode);
    const baseProductType = inferSetProductType(entry.set_name);
    const productType = override?.productType ?? baseProductType;
    const isOpenable =
      override?.isOpenable ?? inferOpenableStatus(entry.set_name, productType);
    const packSize = override?.packSize ?? inferPackSize(entry.set_name, productType);
    const notes = [importedSetNote, override?.notes].filter(Boolean).join(" ");

    if (!normalizedSetRowByCode.has(setCode)) {
      normalizedSetRowByCode.set(setCode, {
        code: setCode,
        name: normalizeWhitespace(entry.set_name),
        releaseDate: parseDateOnly(entry.tcg_date)!,
        region: Region.TCG,
        productType,
        isOpenable,
        packSize,
        imageUrl: entry.set_image ?? null,
        notes,
      });
    }
  }

  const normalizedSetRows = Array.from(normalizedSetRowByCode.values());

  const existingSets = await prisma.cardSet.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      releaseDate: true,
      region: true,
      productType: true,
      isOpenable: true,
      packSize: true,
      imageUrl: true,
      notes: true,
    },
  });
  const existingSetByCode = new Map(existingSets.map((entry) => [entry.code, entry]));

  const newSetRows = normalizedSetRows.filter((entry) => !existingSetByCode.has(entry.code));
  const updatedSetRows = normalizedSetRows.filter((entry) => existingSetByCode.has(entry.code));

  for (const setChunk of chunk(newSetRows, 250)) {
    await prisma.cardSet.createMany({
      data: setChunk,
    });
  }

  for (const entry of updatedSetRows) {
    const existing = existingSetByCode.get(entry.code);

    if (!existing) {
      continue;
    }

    const shouldUpdate =
      existing.name !== entry.name ||
      existing.releaseDate.getTime() !== entry.releaseDate.getTime() ||
      existing.region !== entry.region ||
      existing.productType !== entry.productType ||
      existing.isOpenable !== entry.isOpenable ||
      existing.packSize !== entry.packSize ||
      existing.imageUrl !== entry.imageUrl ||
      (existing.notes ?? "") !== entry.notes;

    if (!shouldUpdate) {
      continue;
    }

    await prisma.cardSet.update({
      where: {
        id: existing.id,
      },
      data: entry,
    });
  }

  const importedSets = await prisma.cardSet.findMany({
    where: {
      code: {
        in: normalizedSetRows.map((entry) => entry.code),
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      releaseDate: true,
      productType: true,
      isOpenable: true,
    },
  });

  const setIdByCode = new Map(importedSets.map((entry) => [entry.code, entry.id]));
  const setCodeByName = new Map(
    importedSets.map((entry) => [normalizeWhitespace(entry.name), entry.code]),
  );
  const setReleaseDateByName = new Map(
    importedSets.map((entry) => [normalizeWhitespace(entry.name), entry.releaseDate]),
  );

  const allCards = cardResponse.data;
  const cards = limitCards === null ? allCards : allCards.slice(0, limitCards);

  console.log(`Preparing ${cards.length} cards and ${normalizedSetRows.length} TCG sets...`);

  const cardRows = cards.map((card) => {
    const kind = resolveCardKind(card);

    return {
      externalCardId: String(card.id),
      slug: buildImportedCardSlug(card),
      name: normalizeWhitespace(card.name),
      kind,
      attribute: card.attribute ?? null,
      monsterType: kind === CardKind.MONSTER ? card.race ?? null : null,
      levelRankLink: resolveLevelRankLink(card),
      atk: typeof card.atk === "number" ? card.atk : null,
      def: typeof card.def === "number" ? card.def : null,
      currentOracleText: normalizeWhitespace(card.desc),
      currentPendulumText: card.pend_desc ? normalizeWhitespace(card.pend_desc) : null,
    };
  });

  const existingCards = await prisma.card.findMany({
    where: {
      externalCardId: {
        in: cardRows.map((entry) => entry.externalCardId),
      },
    },
    select: {
      id: true,
      externalCardId: true,
      slug: true,
      name: true,
      kind: true,
      attribute: true,
      monsterType: true,
      levelRankLink: true,
      atk: true,
      def: true,
      currentOracleText: true,
      currentPendulumText: true,
    },
  });
  const existingCardByExternalId = new Map(
    existingCards.map((entry) => [entry.externalCardId ?? "", entry]),
  );

  const newCardRows = cardRows.filter(
    (entry) => !existingCardByExternalId.has(entry.externalCardId),
  );

  for (const cardChunk of chunk(newCardRows, 250)) {
    await prisma.card.createMany({
      data: cardChunk,
    });
  }

  for (const entry of cardRows) {
    const existing = existingCardByExternalId.get(entry.externalCardId);

    if (!existing) {
      continue;
    }

    const shouldUpdate =
      existing.slug !== entry.slug ||
      existing.name !== entry.name ||
      existing.kind !== entry.kind ||
      existing.attribute !== entry.attribute ||
      existing.monsterType !== entry.monsterType ||
      existing.levelRankLink !== entry.levelRankLink ||
      existing.atk !== entry.atk ||
      existing.def !== entry.def ||
      existing.currentOracleText !== entry.currentOracleText ||
      existing.currentPendulumText !== entry.currentPendulumText;

    if (!shouldUpdate) {
      continue;
    }

    await prisma.card.update({
      where: {
        id: existing.id,
      },
      data: entry,
    });
  }

  const importedCards = await prisma.card.findMany({
    where: {
      externalCardId: {
        in: cardRows.map((entry) => entry.externalCardId),
      },
    },
    select: {
      id: true,
      externalCardId: true,
    },
  });
  const cardIdByExternalId = new Map(
    importedCards.map((entry) => [entry.externalCardId ?? "", entry.id]),
  );

  const setCardRows: Array<{
    setId: string;
    cardId: string;
    setCode: string;
    rarity: string;
    collectorNumber: string | null;
    pullWeight: number;
    isReprint: boolean;
  }> = [];

  for (const card of cards) {
    const cardId = cardIdByExternalId.get(String(card.id));

    if (!cardId) {
      continue;
    }

    const mappedEntries = (card.card_sets ?? [])
      .map((entry) => {
        const normalizedSetName = normalizeWhitespace(entry.set_name);
        const exactSetCode = setCodeByName.get(normalizedSetName);
        const fallbackSetCode = extractSetPrefix(entry.set_code).toUpperCase();
        const setCode = exactSetCode ?? fallbackSetCode;
        const setId = setIdByCode.get(setCode);
        const releaseDate = setReleaseDateByName.get(normalizedSetName) ?? null;

        if (!setId || !releaseDate) {
          return null;
        }

        return {
          setId,
          setCode: normalizeWhitespace(entry.set_code),
          rarity: normalizeWhitespace(entry.set_rarity ?? "Unknown"),
          collectorNumber: extractCollectorNumber(entry.set_code),
          releaseDate,
        };
      })
      .filter(
        (entry): entry is NonNullable<typeof entry> =>
          entry !== null,
      )
      .sort((left, right) => left.releaseDate.getTime() - right.releaseDate.getTime());

    const earliestRelease = mappedEntries[0]?.releaseDate ?? null;
    const preferredEntries = Array.from(
      mappedEntries.reduce((entriesByKey, entry) => {
        const key = `${entry.setId}::${entry.rarity}`;
        const existing = entriesByKey.get(key);

        if (
          !existing ||
          compareSetCodePreference(entry.setCode, existing.setCode) < 0
        ) {
          entriesByKey.set(key, entry);
        }

        return entriesByKey;
      }, new Map<string, (typeof mappedEntries)[number]>()),
      ([, entry]) => entry,
    );

    for (const entry of preferredEntries) {
      setCardRows.push({
        setId: entry.setId,
        cardId,
        setCode: entry.setCode,
        rarity: entry.rarity,
        collectorNumber: entry.collectorNumber,
        pullWeight: inferPullWeight(entry.rarity),
        isReprint:
          earliestRelease !== null &&
          entry.releaseDate.getTime() > earliestRelease.getTime(),
      });
    }
  }

  const existingSetCards = await prisma.setCard.findMany({
    where: {
      setId: {
        in: Array.from(new Set(setCardRows.map((entry) => entry.setId))),
      },
    },
    select: {
      setId: true,
      setCode: true,
      rarity: true,
    },
  });
  const existingSetCardKeys = new Set(
    existingSetCards.map((entry) => `${entry.setId}::${entry.setCode}::${entry.rarity}`),
  );
  const newSetCardRows = setCardRows.filter((entry) => {
    const key = `${entry.setId}::${entry.setCode}::${entry.rarity}`;
    const exists = existingSetCardKeys.has(key);

    if (!exists) {
      existingSetCardKeys.add(key);
    }

    return !exists;
  });

  for (const setCardChunk of chunk(newSetCardRows, 500)) {
    await prisma.setCard.createMany({
      data: setCardChunk,
    });
  }

  const promoSourceOverrides = loadPromoSourceOverrides();
  const promoSourceCandidates = importedSets
    .map((set) => ({
      set,
      classification: classifyPromoSource(set, promoSourceOverrides.get(set.code)),
    }))
    .filter(
      (entry): entry is {
        set: (typeof importedSets)[number];
        classification: NonNullable<ReturnType<typeof classifyPromoSource>>;
      } => entry.classification !== null,
    );
  let importedPromoSources = 0;
  let importedPromoSourceCards = 0;

  for (const candidate of promoSourceCandidates) {
    const promoSetCards = await prisma.setCard.findMany({
      where: {
        setId: candidate.set.id,
      },
      select: {
        id: true,
        cardId: true,
      },
      orderBy: {
        setCode: "asc",
      },
    });

    if (promoSetCards.length === 0) {
      continue;
    }

    const source = await prisma.promoSource.upsert({
      where: {
        code: candidate.classification.code,
      },
      create: {
        setId: candidate.set.id,
        code: candidate.classification.code,
        name: candidate.classification.name,
        description: candidate.classification.description,
        sourceType: candidate.classification.sourceType,
        claimMode: candidate.classification.claimMode,
        availableFrom: candidate.classification.availableFrom,
      },
      update: {
        setId: candidate.set.id,
        name: candidate.classification.name,
        description: candidate.classification.description,
        sourceType: candidate.classification.sourceType,
        claimMode: candidate.classification.claimMode,
        availableFrom: candidate.classification.availableFrom,
      },
    });

    for (const [index, setCard] of promoSetCards.entries()) {
      await prisma.promoSourceCard.upsert({
        where: {
          promoSourceId_setCardId: {
            promoSourceId: source.id,
            setCardId: setCard.id,
          },
        },
        create: {
          promoSourceId: source.id,
          setCardId: setCard.id,
          cardId: setCard.cardId,
          sortOrder: index,
        },
        update: {
          cardId: setCard.cardId,
          sortOrder: index,
        },
      });
      importedPromoSourceCards += 1;
    }

    importedPromoSources += 1;
  }

  const errataOverrides = loadErrataOverrides();
  const cardsWithOverrides: Array<{
    cardId: string;
    override: ErrataOverride;
  }> = [];
  const cardsWithoutOverrides: string[] = [];

  for (const card of cards) {
    const cardId = cardIdByExternalId.get(String(card.id));

    if (!cardId) {
      continue;
    }

    const override = errataOverrides.get(String(card.id));

    if (override) {
      cardsWithOverrides.push({
        cardId,
        override,
      });
      continue;
    }

    cardsWithoutOverrides.push(cardId);
  }

  for (const cardIdChunk of chunk(cardsWithoutOverrides, 500)) {
    await prisma.cardTextVersion.deleteMany({
      where: {
        cardId: {
          in: cardIdChunk,
        },
        sourceNote: importedCurrentTextSourceNote,
      },
    });
  }

  const currentTextRows = cards
    .filter((card) => !errataOverrides.has(String(card.id)))
    .map((card) => {
      const cardId = cardIdByExternalId.get(String(card.id));

      if (!cardId) {
        return null;
      }

      return {
        cardId,
        label: "Current imported text",
        effectText: normalizeWhitespace(card.desc),
        pendulumText: card.pend_desc ? normalizeWhitespace(card.pend_desc) : null,
        effectiveFrom: getEarliestCardDate(card, setReleaseDateByName),
        effectiveTo: null,
        isErrata: false,
        isCurrent: true,
        sourceNote: importedCurrentTextSourceNote,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  for (const currentTextChunk of chunk(currentTextRows, 500)) {
    await prisma.cardTextVersion.createMany({
      data: currentTextChunk,
    });
  }

  for (const overrideChunk of chunk(cardsWithOverrides, 100)) {
    await prisma.cardTextVersion.deleteMany({
      where: {
        cardId: {
          in: overrideChunk.map((entry) => entry.cardId),
        },
      },
    });

    const rows = overrideChunk.flatMap(({ cardId, override }) => {
      const sortedVersions = [...override.versions].sort((left, right) => {
        return (
          parseDateOnly(left.effectiveFrom)?.getTime() ?? 0
        ) - (parseDateOnly(right.effectiveFrom)?.getTime() ?? 0);
      });
      const currentIndex = sortedVersions.findIndex((entry) => entry.isCurrent);
      const fallbackCurrentIndex = currentIndex >= 0 ? currentIndex : sortedVersions.length - 1;

      return sortedVersions.map((version, index) => ({
        cardId,
        label: normalizeWhitespace(version.label),
        effectText: normalizeWhitespace(version.effectText),
        pendulumText: version.pendulumText
          ? normalizeWhitespace(version.pendulumText)
          : null,
        effectiveFrom: parseDateOnly(version.effectiveFrom) ?? new Date("1900-01-01T00:00:00.000Z"),
        effectiveTo: parseDateOnly(version.effectiveTo),
        isErrata: version.isErrata ?? index > 0,
        isCurrent: index === fallbackCurrentIndex,
        sourceNote: version.sourceNote ?? "Imported from local errata override file.",
      }));
    });

    await prisma.cardTextVersion.createMany({
      data: rows,
    });
  }

  return {
    importedSets: normalizedSetRows.length,
    importedCards: cardRows.length,
    importedSetCards: newSetCardRows.length,
    importedPromoSources,
    importedPromoSourceCards,
    currentTextVersions: currentTextRows.length,
    overrideCards: cardsWithOverrides.length,
  };
}

function inferBanlistFormat(fileName: string, banlistName: string) {
  const normalizedFileName = fileName.toLowerCase();
  const normalizedName = banlistName.toLowerCase();

  if (normalizedFileName.startsWith("goat") || normalizedName.includes("goat")) {
    return {
      formatSlug: "goat",
      formatName: "GOAT",
      formatType: FormatType.HISTORICAL,
      region: Region.TCG,
    };
  }

  if (normalizedFileName.startsWith("traditional") || normalizedName.includes("traditional")) {
    return {
      formatSlug: "traditional",
      formatName: "Traditional",
      formatType: FormatType.OPEN,
      region: Region.GLOBAL,
    };
  }

  if (normalizedFileName.startsWith("ocg") || normalizedName.includes("ocg")) {
    return {
      formatSlug: "ocg",
      formatName: "OCG",
      formatType: FormatType.OPEN,
      region: Region.OCG,
    };
  }

  if (
    normalizedFileName.startsWith("rush-prerelease") ||
    normalizedName.includes("rush prerelease")
  ) {
    return {
      formatSlug: "rush-prerelease",
      formatName: "Rush Prerelease",
      formatType: FormatType.OPEN,
      region: Region.GLOBAL,
    };
  }

  if (normalizedFileName.startsWith("rush") || normalizedName.includes("rush duel")) {
    return {
      formatSlug: "rush-duel",
      formatName: "Rush Duel",
      formatType: FormatType.OPEN,
      region: Region.GLOBAL,
    };
  }

  if (normalizedFileName.startsWith("speed") || normalizedName.includes("speed duel")) {
    return {
      formatSlug: "speed-duel",
      formatName: "Speed Duel",
      formatType: FormatType.OPEN,
      region: Region.GLOBAL,
    };
  }

  if (normalizedFileName.startsWith("world") || normalizedName.includes("world")) {
    return {
      formatSlug: "world",
      formatName: "World",
      formatType: FormatType.OPEN,
      region: Region.GLOBAL,
    };
  }

  if (normalizedFileName.startsWith("0tcg") || normalizedName.includes("tcg")) {
    return {
      formatSlug: "tcg",
      formatName: "TCG",
      formatType: FormatType.OPEN,
      region: Region.TCG,
    };
  }

  return {
    formatSlug: slugify(banlistName),
    formatName: banlistName,
    formatType: FormatType.CUSTOM,
    region: Region.CUSTOM,
  };
}

function parseBanlistDate(label: string) {
  const match = label.match(/(\d{4})\.(\d{1,2})/);

  if (!match) {
    return new Date("1900-01-01T00:00:00.000Z");
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);

  return new Date(Date.UTC(year, Math.max(month - 1, 0), 1, 0, 0, 0, 0));
}

function normalizeBanlistCardName(value: string) {
  const withoutTabbedTail = value.split("\t")[0] ?? value;
  const withoutSectionLabel = withoutTabbedTail.replace(/\s{2,}[A-Z][A-Z\s]+$/, "");

  return normalizeWhitespace(withoutSectionLabel).toLowerCase();
}

function getLegacyFormatSlug(parsedBanlist: ParsedBanlist) {
  const legacySlug = slugify(parsedBanlist.name);

  return legacySlug === parsedBanlist.formatSlug ? null : legacySlug;
}

function isBanlistConfigFile(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();

  return normalizedFileName.endsWith(".conf");
}

function parseBanlistSources(
  fileName: string,
  sourceLabel: string,
  text: string,
): ParsedBanlist[] {
  const lines = text.split(/\r?\n/);
  const headerIndexes = lines.flatMap((line, index) =>
    line.trim().startsWith("!") ? [index] : [],
  );

  if (headerIndexes.length === 0) {
    throw new Error(`Banlist source ${sourceLabel} does not contain a !header line.`);
  }

  return headerIndexes.map((headerIndex, sectionIndex) => {
    const headerLine = lines[headerIndex]?.trim().slice(1).trim();

    if (!headerLine) {
      throw new Error(`Banlist source ${sourceLabel} contains an empty !header line.`);
    }

    const nextHeaderIndex = headerIndexes[sectionIndex + 1] ?? lines.length;
    const format = inferBanlistFormat(fileName, headerLine);
    const entries = lines
      .slice(headerIndex + 1, nextHeaderIndex)
      .map((line) => line.trim())
      .filter((line) => /^\d+\s+\d+/.test(line))
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)(?:\s+--(.*))?$/);

        if (!match) {
          throw new Error(`Could not parse banlist row "${line}" in ${sourceLabel}.`);
        }

        return {
          passcode: match[1],
          allowedCopies: Number.parseInt(match[2], 10),
          cardNameHint: match[3]?.trim() ?? null,
        };
      });

    return {
      ...format,
      name: headerLine,
      effectiveFrom: parseBanlistDate(headerLine),
      entries,
      sourceLabel:
        headerIndexes.length > 1
          ? `${sourceLabel}:${headerLine}`
          : sourceLabel,
    };
  });
}

function parseBracketedBanlistLabels(line: string) {
  return [...line.matchAll(/\[([^\]]+)\]/g)].map((match) => normalizeWhitespace(match[1] ?? ""));
}

function extractLegacyTcgArchiveLabels(text: string) {
  const metadataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("#[") && line.includes("]"));

  if (metadataLines.length === 0) {
    return [] as string[];
  }

  const parsedMetadata = metadataLines.map((line) => parseBracketedBanlistLabels(line));
  const tcgLine =
    parsedMetadata
      .sort((left, right) => {
        const leftScore = left.filter((label) => /tcg/i.test(label)).length;
        const rightScore = right.filter((label) => /tcg/i.test(label)).length;

        return rightScore - leftScore;
      })
      .at(0) ?? [];

  return tcgLine.filter(Boolean);
}

async function loadOfficialBanlistFileNames() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/ProjectIgnis/LFLists/contents",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "yugioh-progression-importer",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const entries = (await response.json()) as GitHubRepositoryEntry[];
    const fileNames = entries
      .filter((entry) => entry.type === "file" && isBanlistConfigFile(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));

    if (fileNames.length > 0) {
      return fileNames;
    }
  } catch (error) {
    console.warn(
      "Could not load official Project Ignis banlist directory dynamically. Falling back to bundled list.",
      error,
    );
  }

  return [...fallbackOfficialBanlistFiles];
}

async function loadOfficialBanlists() {
  const parsedBanlists: ParsedBanlist[] = [];
  const officialBanlistFiles = await loadOfficialBanlistFileNames();

  for (const fileName of officialBanlistFiles) {
    const url = `https://raw.githubusercontent.com/ProjectIgnis/LFLists/master/${fileName}`;
    const text = await fetchText(url);

    parsedBanlists.push(
      ...parseBanlistSources(fileName, `official:${fileName}`, text),
    );
  }

  return parsedBanlists;
}

async function loadLegacyTcgArchiveBanlists() {
  try {
    const text = await fetchText(legacyTcgArchiveUrl);
    const tcgLabels = new Set(extractLegacyTcgArchiveLabels(text));

    if (tcgLabels.size === 0) {
      return [] as ParsedBanlist[];
    }

    return parseBanlistSources(
      "legacy-tcg-archive.lflist.conf",
      "legacy:ygopro:lflist.conf",
      text,
    )
      .filter((banlist) => tcgLabels.has(banlist.name))
      .map((banlist) => ({
        ...banlist,
        formatSlug: "tcg",
        formatName: "TCG",
        formatType: FormatType.OPEN,
        region: Region.TCG,
      }));
  } catch (error) {
    console.warn(
      "Could not load legacy TCG banlist archive. Continuing with official and local lists only.",
      error,
    );

    return [] as ParsedBanlist[];
  }
}

function loadLocalBanlists() {
  if (!existsSync(localBanlistsDirectory)) {
    return [] as ParsedBanlist[];
  }

  const localFiles = readdirSync(localBanlistsDirectory).filter((entry) => {
    return extname(entry).toLowerCase() === ".conf" || entry.endsWith(".lflist.conf");
  });

  return localFiles.map((fileName) => {
    const absolutePath = resolve(localBanlistsDirectory, fileName);
    const text = readFileSync(absolutePath, "utf8");

    return parseBanlistSources(fileName, `local:${fileName}`, text);
  }).flat();
}

async function mergeFormatProfiles(targetId: string, sourceId: string) {
  if (targetId === sourceId) {
    return;
  }

  const [targetBanlists, sourceBanlists] = await Promise.all([
    prisma.banlist.findMany({
      where: {
        formatProfileId: targetId,
      },
      select: {
        id: true,
        effectiveFrom: true,
      },
    }),
    prisma.banlist.findMany({
      where: {
        formatProfileId: sourceId,
      },
      select: {
        id: true,
        effectiveFrom: true,
      },
    }),
  ]);

  const targetBanlistByDate = new Map(
    targetBanlists.map((banlist) => [banlist.effectiveFrom.getTime(), banlist.id]),
  );

  for (const sourceBanlist of sourceBanlists) {
    const matchingTargetBanlistId = targetBanlistByDate.get(
      sourceBanlist.effectiveFrom.getTime(),
    );

    if (matchingTargetBanlistId) {
      await prisma.deck.updateMany({
        where: {
          banlistId: sourceBanlist.id,
        },
        data: {
          banlistId: matchingTargetBanlistId,
          formatProfileId: targetId,
        },
      });

      await prisma.banlist.delete({
        where: {
          id: sourceBanlist.id,
        },
      });

      continue;
    }

    await prisma.banlist.update({
      where: {
        id: sourceBanlist.id,
      },
      data: {
        formatProfileId: targetId,
      },
    });
  }

  await prisma.deck.updateMany({
    where: {
      formatProfileId: sourceId,
    },
    data: {
      formatProfileId: targetId,
    },
  });

  await prisma.formatProfile.delete({
    where: {
      id: sourceId,
    },
  });
}

async function upsertFormatProfileForBanlist(parsedBanlist: ParsedBanlist) {
  const legacySlug = getLegacyFormatSlug(parsedBanlist);
  const [canonicalProfile, legacyProfile] = await Promise.all([
    prisma.formatProfile.findUnique({
      where: {
        slug: parsedBanlist.formatSlug,
      },
    }),
    legacySlug
      ? prisma.formatProfile.findUnique({
          where: {
            slug: legacySlug,
          },
        })
      : Promise.resolve(null),
  ]);

  if (canonicalProfile && legacyProfile && canonicalProfile.id !== legacyProfile.id) {
    await mergeFormatProfiles(canonicalProfile.id, legacyProfile.id);
  }

  const profileToReuse = canonicalProfile ?? legacyProfile;

  if (profileToReuse) {
    return prisma.formatProfile.update({
      where: {
        id: profileToReuse.id,
      },
      data: {
        slug: parsedBanlist.formatSlug,
        name: parsedBanlist.formatName,
        type: parsedBanlist.formatType,
        region: parsedBanlist.region,
        defaultErrataPolicy: ErrataPolicy.BAN_ON_ERRATA,
        description: `${importedBanlistNotePrefix} Source: ${parsedBanlist.sourceLabel}`,
      },
    });
  }

  return prisma.formatProfile.create({
    data: {
      slug: parsedBanlist.formatSlug,
      name: parsedBanlist.formatName,
      type: parsedBanlist.formatType,
      region: parsedBanlist.region,
      defaultErrataPolicy: ErrataPolicy.BAN_ON_ERRATA,
      description: `${importedBanlistNotePrefix} Source: ${parsedBanlist.sourceLabel}`,
    },
  });
}

async function importBanlists() {
  console.log("Loading official and local banlists...");

  const [officialBanlists, legacyTcgArchiveBanlists, localBanlists] = await Promise.all([
    loadOfficialBanlists(),
    loadLegacyTcgArchiveBanlists(),
    Promise.resolve(loadLocalBanlists()),
  ]);
  const parsedBanlists = [
    ...officialBanlists,
    ...legacyTcgArchiveBanlists,
    ...localBanlists,
  ];

  const cards = await prisma.card.findMany({
    where: {
      externalCardId: {
        not: null,
      },
    },
    select: {
      id: true,
      externalCardId: true,
      name: true,
    },
  });
  const cardIdByPasscode = new Map(
    cards.map((entry) => [entry.externalCardId ?? "", entry.id]),
  );
  const cardIdByName = new Map(
    cards.map((entry) => [normalizeBanlistCardName(entry.name), entry.id]),
  );

  let importedEntries = 0;
  let unresolvedEntries = 0;

  for (const parsedBanlist of parsedBanlists) {
    const formatProfile = await upsertFormatProfileForBanlist(parsedBanlist);

    const banlistImport = await prisma.$transaction(async (tx) => {
      const banlist = await tx.banlist.upsert({
        where: {
          formatProfileId_effectiveFrom: {
            formatProfileId: formatProfile.id,
            effectiveFrom: parsedBanlist.effectiveFrom,
          },
        },
        update: {
          name: parsedBanlist.name,
          effectiveTo: null,
          errataPolicy: ErrataPolicy.BAN_ON_ERRATA,
          notes: `${importedBanlistNotePrefix} Source: ${parsedBanlist.sourceLabel}`,
        },
        create: {
          formatProfileId: formatProfile.id,
          name: parsedBanlist.name,
          effectiveFrom: parsedBanlist.effectiveFrom,
          effectiveTo: null,
          errataPolicy: ErrataPolicy.BAN_ON_ERRATA,
          notes: `${importedBanlistNotePrefix} Source: ${parsedBanlist.sourceLabel}`,
        },
      });
      let unresolvedEntryCount = 0;

      const resolvedRows = parsedBanlist.entries.flatMap((entry) => {
        const cardId =
          cardIdByPasscode.get(entry.passcode) ??
          (entry.cardNameHint
            ? cardIdByName.get(normalizeBanlistCardName(entry.cardNameHint))
            : undefined);

        if (!cardId) {
          unresolvedEntryCount += 1;
          return [];
        }

        return {
          banlistId: banlist.id,
          cardId,
          allowedCopies: entry.allowedCopies,
          note: entry.cardNameHint
            ? `Imported from ${parsedBanlist.sourceLabel}: ${entry.cardNameHint}`
            : `Imported from ${parsedBanlist.sourceLabel}`,
        };
      });

      const dedupedRows = Array.from(
        resolvedRows.reduce((rowsByCardId, entry) => {
          const existing = rowsByCardId.get(entry.cardId);

          if (!existing || entry.allowedCopies < existing.allowedCopies) {
            rowsByCardId.set(entry.cardId, entry);
          }

          return rowsByCardId;
        }, new Map<string, (typeof resolvedRows)[number]>()),
        ([, entry]) => entry,
      );

      await tx.banlistEntry.deleteMany({
        where: {
          banlistId: banlist.id,
        },
      });

      for (const entryChunk of chunk(dedupedRows, 500)) {
        await tx.banlistEntry.createMany({
          data: entryChunk,
        });
      }

      return {
        importedEntryCount: dedupedRows.length,
        unresolvedEntryCount,
      };
    });

    importedEntries += banlistImport.importedEntryCount;
    unresolvedEntries += banlistImport.unresolvedEntryCount;
  }

  return {
    importedBanlists: parsedBanlists.length,
    importedLegacyTcgBanlists: legacyTcgArchiveBanlists.length,
    importedEntries,
    unresolvedEntries,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary: Record<string, number> = {};

  if (!options.skipCatalog) {
    const catalogSummary = await importCatalog(options.limitCards);
    Object.assign(summary, catalogSummary);
  }

  if (!options.skipBanlists) {
    const banlistSummary = await importBanlists();
    Object.assign(summary, banlistSummary);
  }

  console.log("Import complete.");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
