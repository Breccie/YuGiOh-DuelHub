import {
  CardKind,
  EntryLockState,
  OwnershipSource,
  type PrismaClient,
} from "@prisma/client";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export type CollectionKindFilter = "ALL" | CardKind;

type RawCollectionEntry = Awaited<ReturnType<typeof loadCollectionEntries>>[number];

export type CollectionCardGroup = {
  cardId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  kind: CardKind;
  currentOracleText: string | null;
  totalCopies: number;
  availableCopies: number;
  reservedCopies: number;
  tradedCopies: number;
  latestAcquiredAt: string;
  printings: Array<{
    key: string;
    setLabel: string;
    setCode: string | null;
    rarity: string | null;
    copies: number;
  }>;
  sources: Array<{
    source: OwnershipSource;
    label: string;
    copies: number;
  }>;
};

export type CollectionSnapshot = {
  viewer: {
    id: string;
    displayName: string;
  };
  filters: {
    query: string;
    kind: CollectionKindFilter;
    duplicatesOnly: boolean;
  };
  totals: {
    totalCopies: number;
    uniqueCards: number;
    cardsWithDuplicates: number;
    availableCopies: number;
    reservedCopies: number;
    tradedCopies: number;
  };
  visible: {
    cards: number;
    copies: number;
  };
  sourceTotals: Array<{
    source: OwnershipSource;
    label: string;
    copies: number;
  }>;
  cards: CollectionCardGroup[];
  recentEntries: Array<{
    id: string;
    acquiredAt: string;
    source: OwnershipSource;
    sourceLabel: string;
    lockState: EntryLockState;
    card: {
      id: string;
      name: string;
      kind: CardKind;
      imageUrl: string | null;
    };
    printingLabel: string;
  }>;
};

function getSourceLabel(source: OwnershipSource) {
  switch (source) {
    case "PACK_OPENING":
      return "Pack";
    case "TRADE":
      return "Tausch";
    case "ADMIN_IMPORT":
      return "Import";
    case "MANUAL_GRANT":
      return "Manuell";
    default:
      return source;
  }
}

function getPrintingLabel(entry: RawCollectionEntry) {
  if (entry.setCard?.set) {
    return `${entry.setCard.set.code} · ${entry.setCard.set.name}`;
  }

  return "Ohne Set-Zuordnung";
}

async function loadCollectionEntries(prisma: PrismaClient, viewerId: string, runId: string) {
  const entries = await prisma.collectionEntry.findMany({
    where: {
      userId: viewerId,
      runId,
    },
    orderBy: {
      acquiredAt: "desc",
    },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          slug: true,
          externalCardId: true,
          kind: true,
        },
      },
      setCard: {
        select: {
          id: true,
          setCode: true,
          rarity: true,
          set: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return entries;
}

function groupCollectionEntries(entries: RawCollectionEntry[]) {
  const groupedCards = new Map<string, CollectionCardGroup>();
  const sourceTotals = new Map<OwnershipSource, number>();

  for (const entry of entries) {
    sourceTotals.set(entry.source, (sourceTotals.get(entry.source) ?? 0) + 1);

    const existingGroup = groupedCards.get(entry.cardId);

    if (!existingGroup) {
      groupedCards.set(entry.cardId, {
        cardId: entry.cardId,
        name: entry.card.name,
        slug: entry.card.slug,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
        kind: entry.card.kind,
        currentOracleText: null,
        totalCopies: 0,
        availableCopies: 0,
        reservedCopies: 0,
        tradedCopies: 0,
        latestAcquiredAt: entry.acquiredAt.toISOString(),
        printings: [],
        sources: [],
      });
    }

    const group = groupedCards.get(entry.cardId)!;
    const printingKey = entry.setCard?.id ?? `loose:${entry.source}`;
    const printingLabel = getPrintingLabel(entry);
    const sourceLabel = getSourceLabel(entry.source);

    group.totalCopies += 1;

    if (entry.lockState === "AVAILABLE") {
      group.availableCopies += 1;
    } else if (entry.lockState === "RESERVED") {
      group.reservedCopies += 1;
    } else if (entry.lockState === "TRADED") {
      group.tradedCopies += 1;
    }

    if (entry.acquiredAt.toISOString() > group.latestAcquiredAt) {
      group.latestAcquiredAt = entry.acquiredAt.toISOString();
    }

    const existingPrinting = group.printings.find((printing) => printing.key === printingKey);

    if (existingPrinting) {
      existingPrinting.copies += 1;
    } else {
      group.printings.push({
        key: printingKey,
        setLabel: printingLabel,
        setCode: entry.setCard?.setCode ?? null,
        rarity: entry.setCard?.rarity ?? null,
        copies: 1,
      });
    }

    const existingSource = group.sources.find((source) => source.source === entry.source);

    if (existingSource) {
      existingSource.copies += 1;
    } else {
      group.sources.push({
        source: entry.source,
        label: sourceLabel,
        copies: 1,
      });
    }
  }

  const cards = [...groupedCards.values()]
    .map((group) => ({
      ...group,
      printings: [...group.printings].sort((left, right) => right.copies - left.copies),
      sources: [...group.sources].sort((left, right) => right.copies - left.copies),
    }))
    .sort((left, right) => {
      if (right.totalCopies !== left.totalCopies) {
        return right.totalCopies - left.totalCopies;
      }

      return right.latestAcquiredAt.localeCompare(left.latestAcquiredAt);
    });

  return {
    cards,
    sourceTotals: [...sourceTotals.entries()]
      .map(([source, copies]) => ({
        source,
        label: getSourceLabel(source),
        copies,
      }))
      .sort((left, right) => right.copies - left.copies),
  };
}

function matchesQuery(entry: RawCollectionEntry, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    entry.card.name,
    entry.card.slug,
    entry.setCard?.setCode ?? "",
    entry.setCard?.set?.name ?? "",
    entry.setCard?.set?.code ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystacks.includes(normalizedQuery);
}

export async function getCollectionSnapshot(options: {
  viewerId: string;
  query?: string;
  kind?: CollectionKindFilter;
  duplicatesOnly?: boolean;
},
prisma: PrismaClient = getPrisma()): Promise<CollectionSnapshot> {
  const viewer = await prisma.user.findUnique({
    where: {
      id: options.viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const query = options.query?.trim() ?? "";
  const kind = options.kind ?? "ALL";
  const duplicatesOnly = options.duplicatesOnly ?? false;
  const normalizedQuery = query.toLowerCase();

  const activeRun = await getActiveRun(prisma, viewer.id);
  const allEntries = await loadCollectionEntries(prisma, viewer.id, activeRun.id);
  const overallGroups = groupCollectionEntries(allEntries);

  const filteredEntries = allEntries.filter((entry) => {
    if (kind !== "ALL" && entry.card.kind !== kind) {
      return false;
    }

    return matchesQuery(entry, normalizedQuery);
  });

  const filteredGroups = groupCollectionEntries(filteredEntries);
  const visibleCards = duplicatesOnly
    ? filteredGroups.cards.filter((group) => group.totalCopies > 1)
    : filteredGroups.cards;

  return {
    viewer: {
      id: viewer.id,
      displayName: viewer.displayName,
    },
    filters: {
      query,
      kind,
      duplicatesOnly,
    },
    totals: {
      totalCopies: allEntries.length,
      uniqueCards: overallGroups.cards.length,
      cardsWithDuplicates: overallGroups.cards.filter((group) => group.totalCopies > 1).length,
      availableCopies: allEntries.filter((entry) => entry.lockState === "AVAILABLE").length,
      reservedCopies: allEntries.filter((entry) => entry.lockState === "RESERVED").length,
      tradedCopies: allEntries.filter((entry) => entry.lockState === "TRADED").length,
    },
    visible: {
      cards: visibleCards.length,
      copies: visibleCards.reduce((runningTotal, group) => runningTotal + group.totalCopies, 0),
    },
    sourceTotals: overallGroups.sourceTotals,
    cards: visibleCards,
    recentEntries: allEntries.slice(0, 8).map((entry) => ({
      id: entry.id,
      acquiredAt: entry.acquiredAt.toISOString(),
      source: entry.source,
      sourceLabel: getSourceLabel(entry.source),
      lockState: entry.lockState,
      card: {
        id: entry.card.id,
        name: entry.card.name,
        kind: entry.card.kind,
        imageUrl: getCardAssetUrl(entry.card.externalCardId),
      },
      printingLabel: getPrintingLabel(entry),
    })),
  };
}
