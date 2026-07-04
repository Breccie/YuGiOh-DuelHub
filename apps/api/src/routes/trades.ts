import type { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import {
  createTradeRequestSchema,
  createTradeVersionRequestSchema,
  tradeDecisionRequestSchema,
  type TradeListItemDto,
} from "@ygo/contracts";
import {
  acceptTradeVersion,
  cancelTrade,
  confirmTradeCompletion,
  createTradeCounterOffer,
  createTradeOffer,
  getTradeDetail,
  listTradesForViewer,
  rejectTrade,
} from "@/lib/trade-service";
import { requireViewerSession } from "../lib/auth";
import { sendApiError } from "../lib/errors";
import { getPrisma } from "../lib/prisma";

function getSharedPrisma() {
  return getPrisma() as unknown as FrontendPrismaClient;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatTradeState(value: TradeListItemDto["threadState"]) {
  switch (value) {
    case "awaitingYourResponse":
      return "Wartet auf dich";
    case "waitingForTheirResponse":
      return "Wartet auf Antwort";
    case "waitingForYourConfirmation":
      return "Abschluss offen";
    case "waitingForTheirConfirmation":
      return "Partner bestätigt noch";
    case "completed":
      return "Abgeschlossen";
    case "cancelled":
      return "Abgebrochen";
    default:
      return "Abgelehnt";
  }
}

async function loadTradeChrome(viewerId: string) {
  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: {
      id: viewerId,
    },
  });

  if (!viewer) {
    throw new Error("Spielerprofil wurde nicht gefunden.");
  }

  const [uniqueOwnedCards, latestBanlist, earliestSet] = await Promise.all([
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: viewer.id,
      },
    }),
    prisma.banlist.findFirst({
      orderBy: {
        effectiveFrom: "desc",
      },
    }),
    prisma.cardSet.findFirst({
      where: {
        isOpenable: true,
        productType: "CORE_BOOSTER",
      },
      orderBy: {
        releaseDate: "asc",
      },
    }),
  ]);

  return {
    viewer,
    collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
    latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
    activeEra: getEraLabel(
      earliestSet?.releaseDate.toISOString() ?? new Date().toISOString(),
    ),
  };
}

async function buildTradeOverviewPayload(viewerId: string) {
  const prisma = getPrisma();
  const chrome = await loadTradeChrome(viewerId);
  const [trades, friendships] = await Promise.all([
    listTradesForViewer(getSharedPrisma(), chrome.viewer.id),
    prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: chrome.viewer.id }, { addresseeId: chrome.viewer.id }],
      },
      include: {
        requester: {
          select: {
            id: true,
            displayName: true,
            duelistId: true,
            favoriteEra: true,
          },
        },
        addressee: {
          select: {
            id: true,
            displayName: true,
            duelistId: true,
            favoriteEra: true,
          },
        },
      },
    }),
  ]);

  const incomingTrades = trades
    .filter((trade) =>
      ["awaitingYourResponse", "waitingForYourConfirmation"].includes(trade.threadState),
    )
    .slice(0, 3)
    .map((trade) => ({
      id: trade.id,
      partnerName: trade.partner.displayName,
      partnerRank: "Tauschpartner",
      partnerDuelistId: trade.partner.duelistId,
      statusLabel: formatTradeState(trade.threadState),
      summaryLabel: `${trade.givingCount} gibst · ${trade.receivingCount} erhältst`,
      infoLabel: new Date(trade.updatedAt).toLocaleDateString("de-DE"),
      offered: trade.receivingPreview.map((name, index) => ({
        id: `${trade.id}-receive-${index}`,
        name,
      })),
      wanted: trade.givingPreview.map((name, index) => ({
        id: `${trade.id}-give-${index}`,
        name,
      })),
    }));

  const outgoingTrades = trades
    .filter((trade) =>
      ["waitingForTheirResponse", "waitingForTheirConfirmation"].includes(
        trade.threadState,
      ),
    )
    .slice(0, 3)
    .map((trade) => ({
      id: trade.id,
      partnerName: trade.partner.displayName,
      partnerRank: "Tauschpartner",
      partnerDuelistId: trade.partner.duelistId,
      statusLabel: formatTradeState(trade.threadState),
      summaryLabel: `${trade.givingCount} gibst · ${trade.receivingCount} erhältst`,
      infoLabel: new Date(trade.updatedAt).toLocaleDateString("de-DE"),
      offered: trade.givingPreview.map((name, index) => ({
        id: `${trade.id}-give-${index}`,
        name,
      })),
      wanted: trade.receivingPreview.map((name, index) => ({
        id: `${trade.id}-receive-${index}`,
        name,
      })),
    }));

  const partnerCards = friendships.slice(0, 5).map((friendship) => {
    const partner =
      friendship.requesterId === chrome.viewer.id
        ? friendship.addressee
        : friendship.requester;

    return {
      id: partner.id,
      duelistId: partner.duelistId,
      name: partner.displayName,
      era: partner.favoriteEra ?? "Offen",
      openTradeCount: trades.filter((trade) => trade.partner.userId === partner.id).length,
    };
  });

  return {
    viewer: {
      displayName: chrome.viewer.displayName,
    },
    collectionValue: chrome.collectionValue,
    latestBanlistName: chrome.latestBanlistName,
    activeEra: chrome.activeEra,
    incomingTrades,
    outgoingTrades,
    partnerCards,
  };
}

async function buildTradeCreatePayload(viewerId: string) {
  const prisma = getPrisma();
  const chrome = await loadTradeChrome(viewerId);
  const [availableEntries, acceptedFriends] = await Promise.all([
    prisma.collectionEntry.findMany({
      where: {
        userId: chrome.viewer.id,
        lockState: "AVAILABLE",
      },
      take: 18,
      orderBy: {
        acquiredAt: "desc",
      },
      include: {
        card: true,
        setCard: true,
      },
    }),
    prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: chrome.viewer.id }, { addresseeId: chrome.viewer.id }],
      },
      include: {
        requester: true,
        addressee: true,
      },
    }),
  ]);

  const partnerIds = acceptedFriends.map((friendship) =>
    friendship.requesterId === chrome.viewer.id
      ? friendship.addresseeId
      : friendship.requesterId,
  );
  const partnerEntries = await prisma.collectionEntry.findMany({
    where: {
      userId: {
        in: partnerIds,
      },
      lockState: "AVAILABLE",
    },
    orderBy: {
      acquiredAt: "desc",
    },
    include: {
      user: true,
      card: true,
      setCard: true,
    },
  });

  const partners = acceptedFriends.map((friendship) => {
    const partner =
      friendship.requesterId === chrome.viewer.id
        ? friendship.addressee
        : friendship.requester;

    return {
      userId: partner.id,
      duelistId: partner.duelistId,
      displayName: partner.displayName,
      favoriteEra: partner.favoriteEra ?? null,
      availableCards: partnerEntries
        .filter((entry) => entry.userId === partner.id)
        .slice(0, 12)
        .map((entry) => ({
          id: entry.id,
          name: entry.card.name,
          rarity: entry.setCard?.rarity ?? null,
          setCode: entry.setCard?.setCode ?? null,
        })),
    };
  });

  return {
    viewer: {
      displayName: chrome.viewer.displayName,
      duelistId: chrome.viewer.duelistId,
    },
    collectionValue: chrome.collectionValue,
    latestBanlistName: chrome.latestBanlistName,
    activeEra: chrome.activeEra,
    availableCards: availableEntries.map((entry) => ({
      id: entry.id,
      name: entry.card.name,
      rarity: entry.setCard?.rarity ?? null,
      setCode: entry.setCard?.setCode ?? null,
    })),
    partners,
  };
}

async function buildTradeDetailViewPayload(viewerId: string, tradeId: string) {
  const prisma = getPrisma();
  const chrome = await loadTradeChrome(viewerId);
  const trade = await getTradeDetail(getSharedPrisma(), chrome.viewer.id, tradeId);
  const counterpartUserId =
    trade.proposer.userId === chrome.viewer.id ? trade.responder.userId : trade.proposer.userId;

  const [viewerAvailableEntries, counterpartAvailableEntries] = trade.allowedActions.includes(
    "counter",
  )
    ? await Promise.all([
        prisma.collectionEntry.findMany({
          where: {
            userId: chrome.viewer.id,
            lockState: "AVAILABLE",
          },
          take: 18,
          orderBy: {
            acquiredAt: "desc",
          },
          include: {
            card: true,
            setCard: true,
          },
        }),
        prisma.collectionEntry.findMany({
          where: {
            userId: counterpartUserId,
            lockState: "AVAILABLE",
          },
          take: 18,
          orderBy: {
            acquiredAt: "desc",
          },
          include: {
            card: true,
            setCard: true,
          },
        }),
      ])
    : [[], []];

  return {
    viewer: {
      displayName: chrome.viewer.displayName,
      duelistId: chrome.viewer.duelistId,
    },
    viewerUserId: chrome.viewer.id,
    collectionValue: chrome.collectionValue,
    latestBanlistName: chrome.latestBanlistName,
    activeEra: chrome.activeEra,
    trade,
    viewerAvailableCards: viewerAvailableEntries.map((entry) => ({
      id: entry.id,
      name: entry.card.name,
      rarity: entry.setCard?.rarity ?? null,
      setCode: entry.setCard?.setCode ?? null,
    })),
    counterpartAvailableCards: counterpartAvailableEntries.map((entry) => ({
      id: entry.id,
      name: entry.card.name,
      rarity: entry.setCard?.rarity ?? null,
      setCode: entry.setCard?.setCode ?? null,
    })),
  };
}

const tradeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const payload = await buildTradeOverviewPayload(session.userId);

      return reply.send(payload);
    } catch (error) {
      return sendApiError(reply, error, "Trade-Übersicht konnte nicht geladen werden.");
    }
  });

  app.get("/create-view", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const payload = await buildTradeCreatePayload(session.userId);

      return reply.send(payload);
    } catch (error) {
      return sendApiError(reply, error, "Trade-Erstellung konnte nicht geladen werden.");
    }
  });

  app.get("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const trades = await listTradesForViewer(getSharedPrisma(), session.userId);

      return reply.send({
        trades,
      });
    } catch (error) {
      return sendApiError(reply, error, "Trades konnten nicht geladen werden.");
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const body = createTradeRequestSchema.parse(request.body ?? {});
      const trade = await createTradeOffer(getSharedPrisma(), session.userId, {
        responderDuelistId: body.responderDuelistId,
        note: body.note ?? null,
        offeredEntryIds: body.offeredEntryIds,
        requestedEntryIds: body.requestedEntryIds,
      });

      return reply.status(201).send({
        trade,
      });
    } catch (error) {
      return sendApiError(reply, error, "Trade konnte nicht erstellt werden.");
    }
  });

  app.get("/:tradeId/view", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { tradeId } = request.params as { tradeId: string };
      const payload = await buildTradeDetailViewPayload(session.userId, tradeId);

      return reply.send(payload);
    } catch (error) {
      return sendApiError(reply, error, "Trade-Details konnten nicht geladen werden.");
    }
  });

  app.get("/:tradeId", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { tradeId } = request.params as { tradeId: string };
      const trade = await getTradeDetail(getSharedPrisma(), session.userId, tradeId);

      return reply.send({
        trade,
      });
    } catch (error) {
      return sendApiError(reply, error, "Trade konnte nicht geladen werden.");
    }
  });

  app.post("/:tradeId/decision", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { tradeId } = request.params as { tradeId: string };
      const body = tradeDecisionRequestSchema.parse(request.body ?? {});
      const trade =
        body.action === "accept"
          ? await acceptTradeVersion(getSharedPrisma(), session.userId, tradeId)
          : body.action === "reject"
            ? await rejectTrade(getSharedPrisma(), session.userId, tradeId)
            : body.action === "cancel"
              ? await cancelTrade(getSharedPrisma(), session.userId, tradeId)
              : await confirmTradeCompletion(getSharedPrisma(), session.userId, tradeId);

      return reply.send({
        trade,
      });
    } catch (error) {
      return sendApiError(reply, error, "Trade konnte nicht aktualisiert werden.");
    }
  });

  app.post("/:tradeId/versions", async (request, reply) => {
    try {
      const session = await requireViewerSession(request, getPrisma());
      const { tradeId } = request.params as { tradeId: string };
      const body = createTradeVersionRequestSchema.parse(request.body ?? {});
      const trade = await createTradeCounterOffer(
        getSharedPrisma(),
        session.userId,
        tradeId,
        {
          note: body.note ?? null,
          offeredEntryIds: body.offeredEntryIds,
          requestedEntryIds: body.requestedEntryIds,
        },
      );

      return reply.status(201).send({
        trade,
      });
    } catch (error) {
      return sendApiError(reply, error, "Gegenangebot konnte nicht erstellt werden.");
    }
  });
};

export default tradeRoutes;
