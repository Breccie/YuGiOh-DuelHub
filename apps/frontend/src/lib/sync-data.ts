import type { PrismaClient } from "@prisma/client";
import type { SyncBootstrapResponse, SyncChangesResponse } from "@ygo/contracts";
import { getActiveRun, getOrCreateWallet } from "@/lib/run-service";

function parseCursor(value: string | null | undefined) {
  if (!value) {
    return new Date(0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export async function buildSyncBootstrapPayload(
  prisma: PrismaClient,
  viewerId: string,
): Promise<SyncBootstrapResponse> {
  const serverTime = new Date();
  const activeRun = await getActiveRun(prisma, viewerId);
  const [
    viewer,
    wallet,
    cards,
    sets,
    openableSets,
    banlists,
    collectionEntries,
    decks,
    binders,
    trades,
    tournaments,
    pendingRewards,
    packSets,
    runSetUnlocks,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: viewerId,
      },
      select: {
        id: true,
        duelistId: true,
        displayName: true,
      },
    }),
    getOrCreateWallet(prisma, {
      runId: activeRun.id,
      userId: viewerId,
    }),
    prisma.card.count(),
    prisma.cardSet.count(),
    prisma.cardSet.count({
      where: {
        isOpenable: true,
      },
    }),
    prisma.banlist.count(),
    prisma.collectionEntry.count({
      where: {
        userId: viewerId,
        runId: activeRun.id,
      },
    }),
    prisma.deck.count({
      where: {
        userId: viewerId,
        runId: activeRun.id,
      },
    }),
    prisma.collectionBinder.count({
      where: {
        userId: viewerId,
        runId: activeRun.id,
      },
    }),
    prisma.trade.count({
      where: {
        runId: activeRun.id,
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
    }),
    prisma.tournament.count({
      where: {
        runId: activeRun.id,
        OR: [{ hostId: viewerId }, { participants: { some: { userId: viewerId } } }],
      },
    }),
    prisma.rewardGrant.count({
      where: {
        runId: activeRun.id,
        recipientId: viewerId,
        status: "PENDING",
      },
    }),
    prisma.cardSet.findMany({
      where: {
        isOpenable: true,
      },
      orderBy: {
        releaseDate: "asc",
      },
      take: 500,
      select: {
        id: true,
        code: true,
        name: true,
        releaseDate: true,
        productType: true,
        packSize: true,
        imageUrl: true,
        _count: {
          select: {
            setCards: true,
          },
        },
      },
    }),
    prisma.runSetUnlock.findMany({
      where: {
        runId: activeRun.id,
      },
      orderBy: {
        unlockedAt: "asc",
      },
      take: 500,
      select: {
        id: true,
        setId: true,
        unlockedAt: true,
        rewardOnly: true,
        packPrice: true,
        displaySize: true,
      },
    }),
  ]);

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  return {
    serverTime: serverTime.toISOString(),
    cursor: serverTime.toISOString(),
    viewer: {
      userId: viewer.id,
      duelistId: viewer.duelistId,
      displayName: viewer.displayName,
    },
    activeRunId: activeRun.id,
    catalog: {
      cards,
      sets,
      openableSets,
      banlists,
      packSets: packSets.map((set) => ({
        id: set.id,
        code: set.code,
        name: set.name,
        releaseDate: set.releaseDate.toISOString(),
        productType: set.productType,
        packSize: set.packSize,
        imageUrl: set.imageUrl,
        cardPoolSize: set._count.setCards,
      })),
      runSetUnlocks: runSetUnlocks.map((unlock) => ({
        id: unlock.id,
        setId: unlock.setId,
        unlockedAt: unlock.unlockedAt.toISOString(),
        rewardOnly: unlock.rewardOnly,
        packPrice: unlock.packPrice,
        displaySize: unlock.displaySize,
      })),
    },
    run: {
      id: activeRun.id,
      name: activeRun.name,
      status: activeRun.status,
      historyCursor: iso(activeRun.historyCursor),
      defaultPackPrice: activeRun.defaultPackPrice,
      defaultDisplaySize: activeRun.defaultDisplaySize,
      freePacksPerSetUnlock: activeRun.freePacksPerSetUnlock,
      updatedAt: activeRun.updatedAt.toISOString(),
    },
    wallet: {
      id: wallet.id,
      balance: wallet.balance,
      updatedAt: wallet.updatedAt.toISOString(),
    },
    counts: {
      collectionEntries,
      decks,
      binders,
      trades,
      tournaments,
      pendingRewards,
    },
  };
}

export async function buildSyncChangesPayload(
  prisma: PrismaClient,
  viewerId: string,
  cursor?: string | null,
): Promise<SyncChangesResponse> {
  const since = parseCursor(cursor);
  const serverTime = new Date();
  const activeRun = await getActiveRun(prisma, viewerId);
  const [
    collectionEntries,
    decks,
    binders,
    trades,
    tournaments,
    packOpenings,
    rewards,
  ] = await Promise.all([
    prisma.collectionEntry.findMany({
      where: {
        userId: viewerId,
        runId: activeRun.id,
        acquiredAt: {
          gt: since,
        },
      },
      orderBy: {
        acquiredAt: "asc",
      },
      take: 200,
      select: {
        id: true,
        cardId: true,
        setCardId: true,
        acquiredAt: true,
        source: true,
        lockState: true,
        sourceReferenceId: true,
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
    }),
    prisma.deck.findMany({
      where: {
        userId: viewerId,
        runId: activeRun.id,
        updatedAt: {
          gt: since,
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        name: true,
        banlistId: true,
        createdAt: true,
        updatedAt: true,
        cards: {
          orderBy: [
            {
              section: "asc",
            },
            {
              card: {
                name: "asc",
              },
            },
          ],
          select: {
            id: true,
            cardId: true,
            section: true,
            quantity: true,
            card: {
              select: {
                id: true,
                name: true,
                externalCardId: true,
                kind: true,
              },
            },
          },
        },
      },
    }),
    prisma.collectionBinder.findMany({
      where: {
        userId: viewerId,
        runId: activeRun.id,
        updatedAt: {
          gt: since,
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        name: true,
        coverKey: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    prisma.trade.findMany({
      where: {
        runId: activeRun.id,
        updatedAt: {
          gt: since,
        },
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        status: true,
        proposerId: true,
        responderId: true,
        updatedAt: true,
        resolvedAt: true,
      },
    }),
    prisma.tournament.findMany({
      where: {
        runId: activeRun.id,
        updatedAt: {
          gt: since,
        },
        OR: [{ hostId: viewerId }, { participants: { some: { userId: viewerId } } }],
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.packOpening.findMany({
      where: {
        userId: viewerId,
        runId: activeRun.id,
        openedAt: {
          gt: since,
        },
      },
      orderBy: {
        openedAt: "asc",
      },
      take: 200,
      select: {
        id: true,
        setId: true,
        batchId: true,
        openedAt: true,
        auditHash: true,
      },
    }),
    prisma.rewardGrant.findMany({
      where: {
        runId: activeRun.id,
        recipientId: viewerId,
        OR: [
          {
            createdAt: {
              gt: since,
            },
          },
          {
            claimedAt: {
              gt: since,
            },
          },
        ],
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
      select: {
        id: true,
        amountCredits: true,
        packSetId: true,
        packQuantity: true,
        status: true,
        createdAt: true,
        claimedAt: true,
      },
    }),
  ]);

  return {
    serverTime: serverTime.toISOString(),
    cursor: serverTime.toISOString(),
    hasMore:
      collectionEntries.length === 200 ||
      packOpenings.length === 200 ||
      decks.length === 100 ||
      binders.length === 100 ||
      trades.length === 100 ||
      tournaments.length === 100 ||
      rewards.length === 100,
    changes: {
      collectionEntries,
      decks,
      binders,
      trades,
      tournaments,
      packOpenings,
      rewards,
    },
  };
}
