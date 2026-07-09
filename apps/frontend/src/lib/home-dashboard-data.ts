import type { PrismaClient } from "@prisma/client";
import type { DashboardSummaryResponse, HomeDashboardResponse } from "@ygo/contracts";
import { listDuelRequests } from "@/lib/duel-service";
import { getActiveRun, getOrCreateWallet } from "@/lib/run-service";

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

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

async function loadUnlockedPackActions(
  prisma: PrismaClient,
  viewerId: string,
  run: Awaited<ReturnType<typeof getActiveRun>>,
) {
  const [unlocks, openingStats] = await Promise.all([
    prisma.runSetUnlock.findMany({
      where: {
        runId: run.id,
        rewardOnly: false,
      },
      orderBy: {
        set: {
          releaseDate: "asc",
        },
      },
      include: {
        set: {
          select: {
            id: true,
            name: true,
            releaseDate: true,
            productType: true,
            _count: {
              select: {
                setCards: true,
              },
            },
          },
        },
      },
    }),
    prisma.packOpening.groupBy({
      by: ["setId"],
      where: {
        userId: viewerId,
        runId: run.id,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const openedBySetId = new Map(
    openingStats.map((entry) => [entry.setId, entry._count._all]),
  );

  return unlocks.map((unlock) => ({
    id: unlock.set.id,
    name: unlock.set.name,
    releaseDate: unlock.set.releaseDate.toISOString(),
    productType: unlock.set.productType,
    cardPoolSize: unlock.set._count.setCards,
    totalOpened: openedBySetId.get(unlock.set.id) ?? 0,
    packPrice: unlock.packPrice ?? run.defaultPackPrice,
  }));
}

export async function buildHomeDashboardPayload(
  prisma: PrismaClient,
  viewerId: string,
): Promise<HomeDashboardResponse> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [
    viewer,
    unlockedPackActions,
    duelRequests,
    uniqueOwnedCards,
    deckCount,
    pendingTrades,
    totalTrades,
    recentPendingTrades,
    latestBanlist,
    tournamentCount,
    wallet,
    pendingPackRewards,
    unlockedPromoSources,
    readyCheckpoints,
    matchesToConfirm,
    matchesToReport,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: viewerId,
      },
      select: {
        displayName: true,
      },
    }),
    loadUnlockedPackActions(prisma, viewerId, activeRun),
    listDuelRequests(prisma, viewerId),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
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
    prisma.trade.count({
      where: {
        runId: activeRun.id,
        status: "PENDING",
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
    }),
    prisma.trade.count({
      where: {
        runId: activeRun.id,
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
    }),
    prisma.trade.findMany({
      where: {
        runId: activeRun.id,
        status: "PENDING",
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
      take: 3,
      orderBy: {
        proposedAt: "desc",
      },
      include: {
        proposer: {
          select: {
            displayName: true,
          },
        },
        responder: {
          select: {
            displayName: true,
          },
        },
      },
    }),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
      include: {
        formatProfile: true,
      },
    }),
    prisma.tournament.count({
      where: {
        runId: activeRun.id,
        OR: [{ hostId: viewerId }, { participants: { some: { userId: viewerId } } }],
      },
    }),
    getOrCreateWallet(prisma, {
      runId: activeRun.id,
      userId: viewerId,
    }),
    prisma.rewardGrant.findMany({
      where: {
        runId: activeRun.id,
        recipientId: viewerId,
        status: "PENDING",
        packSetId: {
          not: null,
        },
        packQuantity: {
          gt: 0,
        },
      },
      take: 3,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        packSet: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.promoSource.findMany({
      where: {
        runAccesses: {
          some: {
            runId: activeRun.id,
          },
        },
      },
      orderBy: [{ availableFrom: "desc" }, { name: "asc" }],
      take: 6,
      include: {
        claims: {
          where: {
            runId: activeRun.id,
            userId: viewerId,
          },
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.runProgressionCheckpoint.findMany({
      where: {
        runId: activeRun.id,
        status: "READY",
      },
      orderBy: {
        sequence: "asc",
      },
      take: 3,
      include: {
        unlocks: {
          include: {
            set: {
              select: {
                name: true,
              },
            },
            promoSource: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.tournamentMatch.findMany({
      where: {
        status: "REPORTED",
        reportedById: {
          not: viewerId,
        },
        tournament: {
          runId: activeRun.id,
        },
        OR: [{ playerOneId: viewerId }, { playerTwoId: viewerId }],
      },
      take: 3,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        tournament: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.tournamentMatch.count({
      where: {
        status: {
          in: ["PENDING", "SCHEDULED"],
        },
        tournament: {
          runId: activeRun.id,
        },
        OR: [{ playerOneId: viewerId }, { playerTwoId: viewerId }],
      },
    }),
  ]);

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const coreTimeline = unlockedPackActions.filter((set) => set.productType === "CORE_BOOSTER");
  const eraSource =
    (coreTimeline.at(-1) ?? unlockedPackActions.at(-1))?.releaseDate ??
    new Date().toISOString();
  const newlyAvailablePacks = unlockedPackActions
    .filter((set) => set.totalOpened === 0)
    .slice(0, 3);
  const pendingPromoSources = unlockedPromoSources.filter(
    (source) => source.claims.length === 0,
  );
  const actionItems: HomeDashboardResponse["newsItems"] = [
    ...pendingPackRewards.map((reward) => ({
      id: `reward-${reward.id}`,
      kicker: "Gratispacks",
      title: `${reward.packQuantity}x ${reward.packSet?.name ?? "Reward-Pack"}`,
      detail: "Liegt in deiner Reward-Inbox und kann kostenlos geöffnet werden.",
      meta: "Packs",
    })),
    ...newlyAvailablePacks.map((pack) => ({
      id: `pack-${pack.id}`,
      kicker: "Neues Pack offen",
      title: pack.name,
      detail: `${formatNumber(pack.cardPoolSize)} Karten im Pool, kaufbar mit Credits.`,
      meta: `${pack.packPrice ?? 0} Credits`,
    })),
    ...pendingPromoSources.map((source) => ({
      id: `promo-${source.id}`,
      kicker: "Promo offen",
      title: source.name,
      detail: "Diese Promo-Quelle ist freigeschaltet und noch nicht abgeholt.",
      meta: "Promos",
    })),
    ...readyCheckpoints.map((checkpoint) => ({
      id: `checkpoint-${checkpoint.id}`,
      kicker: "Kampagne bereit",
      title: checkpoint.title,
      detail:
        checkpoint.unlocks
          .map((unlock) => unlock.set?.name ?? unlock.promoSource?.name)
          .filter((name): name is string => Boolean(name))
          .join(", ") || "Neuer Kampagnenschritt kann angewendet werden.",
      meta: "Progression",
    })),
    ...matchesToConfirm.map((match) => ({
      id: `match-${match.id}`,
      kicker: "Score bestätigen",
      title: match.tournament.title,
      detail: "Dein Gegner hat ein Ergebnis gemeldet. Bitte prüfen und bestätigen.",
      meta: "Turnier",
    })),
  ];
  const visibleActions =
    actionItems.length > 0
      ? actionItems.slice(0, 6)
      : [
          {
            id: "empty",
            kicker: "Alles erledigt",
            title: "Keine offenen Aktionen",
            detail: "Aktuell gibt es keine neuen Rewards, Promos oder Match-Bestätigungen.",
            meta: "Bereit",
          },
        ];
  const openActionCount =
    pendingPackRewards.length +
    newlyAvailablePacks.length +
    pendingPromoSources.length +
    readyCheckpoints.length +
    matchesToConfirm.length +
    matchesToReport +
    pendingTrades;

  return {
    viewer: {
      displayName: viewer.displayName,
    },
    collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
    activeRunName: activeRun.name,
    latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
    activeEra: getEraLabel(eraSource),
    heroStats: [
      {
        label: "Credits",
        value: formatNumber(wallet.balance),
      },
      {
        label: "Offen",
        value: formatNumber(openActionCount),
      },
      {
        label: "Gratispacks",
        value: formatNumber(pendingPackRewards.reduce((total, reward) => total + reward.packQuantity, 0)),
      },
      {
        label: "Promos",
        value: formatNumber(pendingPromoSources.length),
      },
    ],
    newsItems: visibleActions,
    duelRequests: duelRequests.slice(0, 3).map((duelRequest) => ({
      id: duelRequest.id,
      name:
        duelRequest.requester.userId === viewerId
          ? duelRequest.opponent.displayName
          : duelRequest.requester.displayName,
      rank: duelRequest.status,
      eta:
        duelRequest.appointment?.confirmedAt?.slice(11, 16) ??
        duelRequest.appointment?.proposedAt?.slice(11, 16) ??
        "Offen",
    })),
    tradeRequests: recentPendingTrades.map((trade, index) => ({
      id: trade.id,
      name:
        trade.proposerId === viewerId
          ? trade.responder.displayName
          : trade.proposer.displayName,
      detail: trade.status,
      eta: index === 0 ? "Neu" : `#${index + 1}`,
    })),
    progressCards: [
      {
        id: "packs",
        label: "Packs öffnen",
        value: formatNumber(pendingPackRewards.length + newlyAvailablePacks.length),
        detail:
          pendingPackRewards.length > 0
            ? "Gratispacks in der Reward-Inbox."
            : newlyAvailablePacks.length > 0
              ? "Neue kaufbare Packs sind freigeschaltet."
              : "Keine neuen Packs offen.",
        action: "Zu Packs",
      },
      {
        id: "promos",
        label: "Promos abholen",
        value: formatNumber(pendingPromoSources.length),
        detail:
          pendingPromoSources.length > 0
            ? "Freigeschaltete Promo-Quellen warten."
            : "Keine offenen Promos.",
        action: "Promos",
      },
      {
        id: "tournaments",
        label: "Turnier prüfen",
        value: formatNumber(matchesToConfirm.length + matchesToReport),
        detail:
          matchesToConfirm.length > 0
            ? "Gemeldete Scores brauchen deine Bestätigung."
            : matchesToReport > 0
              ? "Offene Matches können eingetragen werden."
              : `${formatNumber(tournamentCount)} Turnier(e) in der Kampagne.`,
        action: "Turniere",
      },
      {
        id: "collection",
        label: "Sammlung",
        value: `${formatNumber(uniqueOwnedCards.length)}`,
        detail: `${formatNumber(deckCount)} Deck(s), ${formatNumber(totalTrades)} Tauschvorgänge.`,
        action: "Sammlung",
      },
    ],
  };
}

export async function buildDashboardSummaryPayload(
  prisma: PrismaClient,
  viewerId: string,
): Promise<DashboardSummaryResponse> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [
    viewer,
    wallet,
    uniqueOwnedCards,
    deckCount,
    pendingTrades,
    recentPendingTrades,
    latestBanlist,
    pendingPackRewards,
    promoSources,
    readyCheckpointCount,
    matchesToConfirm,
    matchesToReport,
    unlockedSets,
    openingStats,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: viewerId,
      },
      select: {
        displayName: true,
      },
    }),
    getOrCreateWallet(prisma, {
      runId: activeRun.id,
      userId: viewerId,
    }),
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
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
    prisma.trade.count({
      where: {
        runId: activeRun.id,
        status: "PENDING",
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
    }),
    prisma.trade.findMany({
      where: {
        runId: activeRun.id,
        status: "PENDING",
        OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      },
      take: 3,
      orderBy: {
        proposedAt: "desc",
      },
      include: {
        proposer: {
          select: {
            displayName: true,
          },
        },
        responder: {
          select: {
            displayName: true,
          },
        },
      },
    }),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
      select: {
        name: true,
      },
    }),
    prisma.rewardGrant.findMany({
      where: {
        runId: activeRun.id,
        recipientId: viewerId,
        status: "PENDING",
        packSetId: {
          not: null,
        },
        packQuantity: {
          gt: 0,
        },
      },
      take: 3,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        packSet: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.promoSource.findMany({
      where: {
        runAccesses: {
          some: {
            runId: activeRun.id,
          },
        },
      },
      orderBy: [{ availableFrom: "desc" }, { name: "asc" }],
      take: 6,
      include: {
        claims: {
          where: {
            runId: activeRun.id,
            userId: viewerId,
          },
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.runProgressionCheckpoint.count({
      where: {
        runId: activeRun.id,
        status: "READY",
      },
    }),
    prisma.tournamentMatch.count({
      where: {
        status: "REPORTED",
        reportedById: {
          not: viewerId,
        },
        tournament: {
          runId: activeRun.id,
        },
        OR: [{ playerOneId: viewerId }, { playerTwoId: viewerId }],
      },
    }),
    prisma.tournamentMatch.count({
      where: {
        status: {
          in: ["PENDING", "SCHEDULED"],
        },
        tournament: {
          runId: activeRun.id,
        },
        OR: [{ playerOneId: viewerId }, { playerTwoId: viewerId }],
      },
    }),
    prisma.runSetUnlock.findMany({
      where: {
        runId: activeRun.id,
        rewardOnly: false,
      },
      orderBy: {
        set: {
          releaseDate: "desc",
        },
      },
      take: 12,
      include: {
        set: {
          select: {
            id: true,
            name: true,
            releaseDate: true,
            productType: true,
            _count: {
              select: {
                setCards: true,
              },
            },
          },
        },
      },
    }),
    prisma.packOpening.groupBy({
      by: ["setId"],
      where: {
        userId: viewerId,
        runId: activeRun.id,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const openedBySetId = new Map(
    openingStats.map((entry) => [entry.setId, entry._count._all]),
  );
  const newlyAvailablePacks = unlockedSets
    .filter((unlock) => (openedBySetId.get(unlock.setId) ?? 0) === 0)
    .slice(0, 3);
  const pendingPromoSources = promoSources.filter((source) => source.claims.length === 0);
  const latestCoreSet =
    unlockedSets.find((unlock) => unlock.set.productType === "CORE_BOOSTER") ??
    unlockedSets[0];
  const activeEra = latestCoreSet
    ? getEraLabel(latestCoreSet.set.releaseDate.toISOString())
    : "Kampagne";
  const actionItems: HomeDashboardResponse["newsItems"] = [
    ...pendingPackRewards.map((reward) => ({
      id: `reward-${reward.id}`,
      kicker: "Gratispacks",
      title: `${reward.packQuantity}x ${reward.packSet?.name ?? "Reward-Pack"}`,
      detail: "Liegt in deiner Reward-Inbox und kann kostenlos geöffnet werden.",
      meta: "Packs",
    })),
    ...newlyAvailablePacks.map((unlock) => ({
      id: `pack-${unlock.set.id}`,
      kicker: "Neues Pack offen",
      title: unlock.set.name,
      detail: `${formatNumber(unlock.set._count.setCards)} Karten im Pool, kaufbar mit Credits.`,
      meta: `${unlock.packPrice ?? activeRun.defaultPackPrice} Credits`,
    })),
    ...pendingPromoSources.map((source) => ({
      id: `promo-${source.id}`,
      kicker: "Promo offen",
      title: source.name,
      detail: "Diese Promo-Quelle ist freigeschaltet und noch nicht abgeholt.",
      meta: "Promos",
    })),
  ];
  const openActionCount =
    pendingPackRewards.length +
    newlyAvailablePacks.length +
    pendingPromoSources.length +
    readyCheckpointCount +
    matchesToConfirm +
    matchesToReport +
    pendingTrades;

  return {
    viewer: {
      displayName: viewer.displayName,
    },
    collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
    activeRunName: activeRun.name,
    latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
    activeEra,
    heroStats: [
      {
        label: "Credits",
        value: formatNumber(wallet.balance),
      },
      {
        label: "Offen",
        value: formatNumber(openActionCount),
      },
      {
        label: "Gratispacks",
        value: formatNumber(
          pendingPackRewards.reduce((total, reward) => total + reward.packQuantity, 0),
        ),
      },
      {
        label: "Promos",
        value: formatNumber(pendingPromoSources.length),
      },
    ],
    newsItems:
      actionItems.length > 0
        ? actionItems.slice(0, 6)
        : [
            {
              id: "empty",
              kicker: "Alles erledigt",
              title: "Keine offenen Aktionen",
              detail: "Aktuell gibt es keine neuen Rewards, Promos oder Match-Bestätigungen.",
              meta: "Bereit",
            },
          ],
    duelRequests: [],
    tradeRequests: recentPendingTrades.map((trade, index) => ({
      id: trade.id,
      name:
        trade.proposerId === viewerId
          ? trade.responder.displayName
          : trade.proposer.displayName,
      detail: trade.status,
      eta: index === 0 ? "Neu" : `#${index + 1}`,
    })),
    progressCards: [
      {
        id: "packs",
        label: "Packs öffnen",
        value: formatNumber(pendingPackRewards.length + newlyAvailablePacks.length),
        detail:
          pendingPackRewards.length > 0
            ? "Gratispacks in der Reward-Inbox."
            : newlyAvailablePacks.length > 0
              ? "Neue kaufbare Packs sind freigeschaltet."
              : "Keine neuen Packs offen.",
        action: "Zu Packs",
      },
      {
        id: "promos",
        label: "Promos abholen",
        value: formatNumber(pendingPromoSources.length),
        detail:
          pendingPromoSources.length > 0
            ? "Freigeschaltete Promo-Quellen warten."
            : "Keine offenen Promos.",
        action: "Promos",
      },
      {
        id: "tournaments",
        label: "Turnier prüfen",
        value: formatNumber(matchesToConfirm + matchesToReport),
        detail:
          matchesToConfirm > 0
            ? "Gemeldete Scores brauchen deine Bestätigung."
            : matchesToReport > 0
              ? "Offene Matches können eingetragen werden."
              : "Keine offenen Match-Aktionen.",
        action: "Turniere",
      },
      {
        id: "collection",
        label: "Sammlung",
        value: `${formatNumber(uniqueOwnedCards.length)}`,
        detail: `${formatNumber(deckCount)} Deck(s), ${formatNumber(pendingTrades)} offene Trades.`,
        action: "Sammlung",
      },
    ],
  };
}
