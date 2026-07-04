import type { PrismaClient } from "@prisma/client";
import type { PackDetailResponse, PackSelectionResponse } from "@ygo/contracts";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPackDashboardSnapshot } from "@/lib/pack-openings";

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function getEraLabel(value: string) {
  const year = new Date(value).getUTCFullYear();

  if (year <= 2003) {
    return "DM Ära";
  }

  if (year <= 2007) {
    return "GX Ära";
  }

  if (year <= 2011) {
    return "5D's Ära";
  }

  if (year <= 2014) {
    return "ZEXAL Ära";
  }

  if (year <= 2017) {
    return "ARC-V Ära";
  }

  return "Moderne Ära";
}

export async function buildPackSelectionPayload(
  prisma: PrismaClient,
  viewerId: string,
  runId?: string | null,
): Promise<PackSelectionResponse> {
  const snapshot = await getPackDashboardSnapshot(prisma, viewerId, runId);
  const [
    deckSnapshot,
    ownedUniqueCards,
    totalCards,
    latestBanlist,
    recentCollectionEntries,
  ] = await Promise.all([
    getDeckLegalitySnapshot({
      viewerId,
    }),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: snapshot.viewer.id,
        runId: runId ?? undefined,
      },
    }),
    prisma.card.count(),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
      include: {
        formatProfile: true,
      },
    }),
    prisma.collectionEntry.findMany({
      where: {
        userId: snapshot.viewer.id,
        runId: runId ?? undefined,
      },
      orderBy: {
        acquiredAt: "desc",
      },
      take: 8,
      include: {
        card: {
          select: {
            name: true,
            externalCardId: true,
          },
        },
        setCard: {
          select: {
            rarity: true,
            setCode: true,
          },
        },
      },
    }),
  ]);

  return {
    viewer: {
      displayName: snapshot.viewer.displayName,
    },
    activeRunId: runId ?? null,
    collectionProgress: {
      owned: ownedUniqueCards.length,
      total: totalCards,
    },
    latestBanlistName:
      deckSnapshot.activeDeck?.banlistName ?? latestBanlist?.name ?? "Keine Bannliste",
    selectedSetId: snapshot.selectedSetId,
    sets: snapshot.sets,
    recentCollectionCards: recentCollectionEntries.map((entry) => ({
      id: entry.id,
      name: entry.card.name,
      imageUrl: getCardAssetUrl(entry.card.externalCardId),
      rarity: entry.setCard?.rarity ?? null,
      setCode: entry.setCard?.setCode ?? null,
    })),
    activeDeck: deckSnapshot.activeDeck
      ? {
          id: deckSnapshot.activeDeck.id,
          name: deckSnapshot.activeDeck.name,
          isLegal: deckSnapshot.activeDeck.isLegal,
          banlistName: deckSnapshot.activeDeck.banlistName,
          mainCount: deckSnapshot.activeDeck.mainCount,
          extraCount: deckSnapshot.activeDeck.extraCount,
          sideCount: deckSnapshot.activeDeck.sideCount,
          cards: deckSnapshot.activeDeck.cards.slice(0, 10).map((card) => ({
            id: `${card.cardId}-${card.section}`,
            name: card.cardName,
            imageUrl: card.imageUrl,
            quantity: card.quantity,
            issues: card.issues,
          })),
        }
      : null,
  };
}

export async function buildPackDetailPayload(
  prisma: PrismaClient,
  viewerId: string,
  setId: string,
  runId?: string | null,
): Promise<PackDetailResponse | null> {
  const snapshot = await getPackDashboardSnapshot(prisma, viewerId, runId);
  const activeSet = snapshot.sets.find((set) => set.id === setId);

  if (!activeSet) {
    return null;
  }

  const [deckSnapshot, ownedUniqueCards, totalCards, latestBanlist] =
    await Promise.all([
      getDeckLegalitySnapshot({
        viewerId,
      }),
      prisma.collectionEntry.groupBy({
        by: ["cardId"],
        where: {
          userId: snapshot.viewer.id,
          runId: runId ?? undefined,
        },
      }),
      prisma.card.count(),
      prisma.banlist.findFirst({
        orderBy: {
          effectiveFrom: "desc",
        },
      }),
    ]);

  return {
    viewer: {
      displayName: snapshot.viewer.displayName,
      duelistId:
        (
          await prisma.user.findUnique({
            where: {
              id: viewerId,
            },
            select: {
              duelistId: true,
            },
          })
        )?.duelistId ?? "",
    },
    snapshot,
    setId,
    metrics: {
      collection: `${formatNumber(ownedUniqueCards.length)} / ${formatNumber(totalCards)}`,
      latestBanlistName:
        deckSnapshot.activeDeck?.banlistName ?? latestBanlist?.name ?? "Keine Bannliste",
      activeEra: getEraLabel(activeSet.releaseDate),
    },
  };
}
