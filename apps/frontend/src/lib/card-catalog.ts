import {
  EntryLockState,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import type {
  CardCatalogQuery,
  CardCatalogResponse,
} from "@ygo/contracts";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getActiveRun } from "@/lib/run-service";

function getBanlistFilter(query: CardCatalogQuery): Prisma.CardWhereInput | null {
  if (!query.banlistId || query.banlistStatus === "ALL") {
    return null;
  }

  if (query.banlistStatus === "FORBIDDEN") {
    return {
      banlistEntries: {
        some: { banlistId: query.banlistId, allowedCopies: 0 },
      },
    };
  }

  if (query.banlistStatus === "LIMITED") {
    return {
      banlistEntries: {
        some: { banlistId: query.banlistId, allowedCopies: 1 },
      },
    };
  }

  if (query.banlistStatus === "SEMI_LIMITED") {
    return {
      banlistEntries: {
        some: { banlistId: query.banlistId, allowedCopies: 2 },
      },
    };
  }

  return {
    OR: [
      {
        banlistEntries: {
          none: { banlistId: query.banlistId },
        },
      },
      {
        banlistEntries: {
          some: { banlistId: query.banlistId, allowedCopies: { gte: 3 } },
        },
      },
    ],
  };
}

function buildCardWhere(
  query: CardCatalogQuery,
  viewerId: string,
  runId: string,
): Prisma.CardWhereInput {
  const and: Prisma.CardWhereInput[] = [];

  if (query.q) {
    and.push({
      OR: [
        { name: { contains: query.q } },
        { slug: { contains: query.q } },
        {
          setCards: {
            some: { setCode: { contains: query.q } },
          },
        },
      ],
    });
  }

  if (query.ownership === "OWNED") {
    and.push({
      collectionEntries: { some: { userId: viewerId, runId } },
    });
  } else if (query.ownership === "UNOWNED") {
    and.push({
      collectionEntries: { none: { userId: viewerId, runId } },
    });
  }

  if (query.kind) and.push({ kind: query.kind });
  if (query.attribute) {
    and.push({ attribute: { equals: query.attribute } });
  }
  if (query.monsterType) {
    and.push({ monsterType: { contains: query.monsterType } });
  }
  if (query.levelRankLink !== undefined) {
    and.push({ levelRankLink: query.levelRankLink });
  }
  if (query.atkMin !== undefined || query.atkMax !== undefined) {
    and.push({ atk: { gte: query.atkMin, lte: query.atkMax } });
  }
  if (query.defMin !== undefined || query.defMax !== undefined) {
    and.push({ def: { gte: query.defMin, lte: query.defMax } });
  }
  if (query.rarity) {
    and.push({
      setCards: {
        some: { rarity: { equals: query.rarity } },
      },
    });
  }
  if (query.setCode) {
    and.push({
      setCards: {
        some: { setCode: { contains: query.setCode } },
      },
    });
  }

  const banlistFilter = getBanlistFilter(query);
  if (banlistFilter) and.push(banlistFilter);

  if (query.banlistId && query.hasPoints) {
    and.push({
      banlistEntries: query.hasPoints === "true"
        ? {
            some: {
              banlistId: query.banlistId,
              pointValue: { gt: 0 },
            },
          }
        : {
            none: {
              banlistId: query.banlistId,
              pointValue: { gt: 0 },
            },
          },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function getOrderBy(query: CardCatalogQuery): Prisma.CardOrderByWithRelationInput[] {
  if (query.sort === "NAME_DESC") return [{ name: "desc" }, { id: "asc" }];
  if (query.sort === "ATK_DESC") return [{ atk: "desc" }, { name: "asc" }];
  if (query.sort === "NEWEST_SET") {
    return [{ setCards: { _count: "desc" } }, { name: "asc" }];
  }

  return [{ name: "asc" }, { id: "asc" }];
}

export async function getCardCatalog(
  prisma: PrismaClient,
  viewerId: string,
  query: CardCatalogQuery,
): Promise<CardCatalogResponse> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const where = buildCardWhere(query, viewerId, activeRun.id);
  const [cards, total, ownedGroups, totalCards] = await Promise.all([
    prisma.card.findMany({
      where,
      orderBy: getOrderBy(query),
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        textVersions: {
          where: { isErrata: true },
          orderBy: { effectiveFrom: "asc" },
          select: { effectiveFrom: true },
          take: 1,
        },
        setCards: {
          select: { rarity: true, setCode: true },
          orderBy: { set: { releaseDate: "desc" } },
          take: 12,
        },
        banlistEntries: query.banlistId
          ? {
              where: { banlistId: query.banlistId },
              select: { allowedCopies: true, pointValue: true },
              take: 1,
            }
          : false,
      },
    }),
    prisma.card.count({ where }),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: { userId: viewerId, runId: activeRun.id },
    }),
    prisma.card.count(),
  ]);

  const hasNextPage = cards.length > query.limit;
  const pageCards = hasNextPage ? cards.slice(0, query.limit) : cards;
  const cardIds = pageCards.map((card) => card.id);
  const [ownershipGroups, deckGroups] = cardIds.length
    ? await Promise.all([
        prisma.collectionEntry.groupBy({
          by: ["cardId", "lockState"],
          where: {
            userId: viewerId,
            runId: activeRun.id,
            cardId: { in: cardIds },
          },
          _count: { _all: true },
        }),
        prisma.deckCard.groupBy({
          by: ["cardId", "section"],
          where: {
            cardId: { in: cardIds },
            deck: { userId: viewerId, runId: activeRun.id },
          },
          _sum: { quantity: true },
        }),
      ])
    : [[], []];

  const ownershipByCard = new Map<
    string,
    { total: number; available: number; reserved: number; traded: number }
  >();
  for (const row of ownershipGroups) {
    const bucket = ownershipByCard.get(row.cardId) ?? {
      total: 0,
      available: 0,
      reserved: 0,
      traded: 0,
    };
    bucket.total += row._count._all;
    if (row.lockState === EntryLockState.AVAILABLE) bucket.available += row._count._all;
    if (row.lockState === EntryLockState.RESERVED) bucket.reserved += row._count._all;
    if (row.lockState === EntryLockState.TRADED) bucket.traded += row._count._all;
    ownershipByCard.set(row.cardId, bucket);
  }
  const deckCopiesByCard = new Map<
    string,
    { total: number; main: number; extra: number; side: number }
  >();
  for (const row of deckGroups) {
    const bucket = deckCopiesByCard.get(row.cardId) ?? {
      total: 0,
      main: 0,
      extra: 0,
      side: 0,
    };
    const quantity = row._sum.quantity ?? 0;
    bucket.total += quantity;
    if (row.section === "MAIN") bucket.main += quantity;
    if (row.section === "EXTRA") bucket.extra += quantity;
    if (row.section === "SIDE") bucket.side += quantity;
    deckCopiesByCard.set(row.cardId, bucket);
  }

  const items = pageCards.map((card) => {
    const ownership = ownershipByCard.get(card.id) ?? {
      total: 0,
      available: 0,
      reserved: 0,
      traded: 0,
    };
    const banlistEntry = card.banlistEntries?.[0];
    const deckCopies = deckCopiesByCard.get(card.id) ?? {
      total: 0,
      main: 0,
      extra: 0,
      side: 0,
    };

    return {
      cardId: card.id,
      name: card.name,
      slug: card.slug,
      imageUrl: getCardAssetUrl(card.externalCardId),
      kind: card.kind,
      attribute: card.attribute,
      monsterType: card.monsterType,
      levelRankLink: card.levelRankLink,
      atk: card.atk,
      def: card.def,
      oracleText: card.currentOracleText,
      totalCopies: ownership.total,
      availableCopies: ownership.available,
      reservedCopies: ownership.reserved,
      tradedCopies: ownership.traded,
      deckCopies: deckCopies.total,
      mainCopies: deckCopies.main,
      extraCopies: deckCopies.extra,
      sideCopies: deckCopies.side,
      owned: ownership.total > 0,
      rarities: [...new Set(card.setCards.map((printing) => printing.rarity))],
      setCodes: [...new Set(card.setCards.map((printing) => printing.setCode))],
      legalLimit: banlistEntry?.allowedCopies ?? 3,
      pointValue: banlistEntry?.pointValue ?? 0,
      errataCutoff: card.textVersions[0]?.effectiveFrom.toISOString() ?? null,
    };
  });

  if (query.sort === "OWNED_DESC") {
    items.sort((left, right) =>
      right.totalCopies - left.totalCopies || left.name.localeCompare(right.name, "de"),
    );
  }

  return {
    items,
    nextCursor: hasNextPage ? pageCards.at(-1)?.id ?? null : null,
    total,
    ownership: {
      uniqueOwned: ownedGroups.length,
      totalCards,
    },
  };
}
