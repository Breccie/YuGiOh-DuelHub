import type { PrismaClient } from "@prisma/client";
import type { HomeDashboardResponse } from "@ygo/contracts";
import { listDuelRequests } from "@/lib/duel-service";
import { getPackDashboardSnapshot } from "@/lib/pack-openings";
import { getActiveRun } from "@/lib/run-service";

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

export async function buildHomeDashboardPayload(
  prisma: PrismaClient,
  viewerId: string,
): Promise<HomeDashboardResponse> {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [
    dashboard,
    duelRequests,
    uniqueOwnedCards,
    deckCount,
    pendingTrades,
    totalTrades,
    recentPendingTrades,
    latestBanlist,
    tournamentCount,
  ] = await Promise.all([
    getPackDashboardSnapshot(prisma, viewerId),
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
  ]);

  const coreTimeline = dashboard.sets.filter((set) => set.productType === "CORE_BOOSTER");
  const eraSource = (coreTimeline[0] ?? dashboard.sets[0])?.releaseDate ?? new Date().toISOString();
  const nextPack =
    coreTimeline.find((set) => set.totalOpened === 0) ?? coreTimeline[0] ?? dashboard.sets[0];

  return {
    viewer: {
      displayName: dashboard.viewer.displayName,
    },
    collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
    latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
    activeEra: getEraLabel(eraSource),
    heroStats: [
      {
        label: "Sammlung",
        value: formatNumber(uniqueOwnedCards.length),
      },
      {
        label: "Decks",
        value: formatNumber(deckCount),
      },
      {
        label: "Duelle",
        value: formatNumber(duelRequests.length),
      },
      {
        label: "Tausch",
        value: formatNumber(totalTrades),
      },
    ],
    newsItems: [
      {
        id: "news-1",
        kicker: "Nächstes Pack",
        title: nextPack?.name ?? "Kein Pack verfügbar",
        detail: nextPack
          ? `${formatNumber(nextPack.cardPoolSize)} Karten im Pool, ${formatNumber(
              nextPack.totalOpened,
            )} geöffnet.`
          : "Importiere Kartendaten, um Pack-Ziele zu sehen.",
        meta: nextPack ? getEraLabel(nextPack.releaseDate) : "System",
      },
      {
        id: "news-2",
        kicker: "Turnierstatus",
        title: `${formatNumber(tournamentCount)} aktive Cups`,
        detail: "Swiss-Runden, Pairings und Duel-Handoff bleiben direkt im Desktop Hub sichtbar.",
        meta: "Turniere",
      },
      {
        id: "news-3",
        kicker: "Tauschstatus",
        title: `${formatNumber(pendingTrades)} offen`,
        detail: `${formatNumber(totalTrades)} Angebote im Verlauf.`,
        meta: "Aktuell",
      },
    ],
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
        id: "tasks",
        label: "Offene Aktionen",
        value: formatNumber(
          pendingTrades + duelRequests.filter((duel) => duel.status !== "COMPLETED").length,
        ),
        detail: "Aktive Tauschangebote, Duellanfragen und nächste Pack-Ziele.",
        action: "Öffnen",
      },
      {
        id: "collection",
        label: "Sammlungsfortschritt",
        value: `${formatNumber(uniqueOwnedCards.length)} Karten`,
        detail: "Einzigartige Kartenkopien im Besitz und bereit für Binder oder Deckbau.",
        action: "Sammlung",
      },
      {
        id: "decks",
        label: "Deckpflege",
        value: formatNumber(deckCount),
        detail: "Decks mit Besitzprüfung, Banlist-Kontext und Exportpfad.",
        action: "Decks",
      },
      {
        id: "packs",
        label: "Pack-Timeline",
        value: formatNumber(coreTimeline.length),
        detail: "Core-Booster im aktuellen Import- und Progression-Pool.",
        action: "Packs",
      },
    ],
  };
}
