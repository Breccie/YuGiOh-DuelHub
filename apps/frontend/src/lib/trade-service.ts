import {
  EntryLockState,
  OwnershipSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { deriveTradeThreadState } from "@ygo/domain";
import type {
  TradeAllowedAction,
  TradeCardLineDto,
  TradeDetailDto,
  TradeListItemDto,
  TradeOfferDraft,
  TradeParticipantDto,
  TradeTimelineEntryDto,
  TradeVersionDraft,
  TradeVersionDto,
} from "@/lib/app-dtos";
import { getActiveRun, requireRunMembership } from "@/lib/run-service";

class TradeServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TradeServiceError";
    this.status = status;
  }
}

const tradeVersionInclude = {
  sender: true,
  recipient: true,
  items: {
    include: {
      collectionEntry: {
        include: {
          card: true,
          setCard: true,
        },
      },
    },
  },
} satisfies Prisma.TradeVersionInclude;

const tradeInclude = {
  proposer: true,
  responder: true,
  cancelledBy: true,
  rejectedBy: true,
  activeVersion: {
    include: tradeVersionInclude,
  },
  acceptedVersion: {
    include: tradeVersionInclude,
  },
  versions: {
    orderBy: {
      versionNumber: "asc",
    },
    include: tradeVersionInclude,
  },
  items: {
    include: {
      collectionEntry: {
        include: {
          card: true,
          setCard: true,
        },
      },
    },
  },
} satisfies Prisma.TradeInclude;

type TradeRecord = Prisma.TradeGetPayload<{
  include: typeof tradeInclude;
}>;

type TradeVersionRecord = TradeRecord["versions"][number];

type EntrySelection = {
  offeredIds: string[];
  requestedIds: string[];
};

function participantToDto(user: {
  id: string;
  duelistId: string;
  displayName: string;
}): TradeParticipantDto {
  return {
    userId: user.id,
    duelistId: user.duelistId,
    displayName: user.displayName,
  };
}

function toCardLineDto(item: TradeVersionRecord["items"][number]): TradeCardLineDto {
  return {
    tradeVersionItemId: item.id,
    collectionEntryId: item.collectionEntryId,
    fromUserId: item.fromUserId,
    toUserId: item.toUserId,
    cardName: item.collectionEntry.card.name,
    rarity: item.collectionEntry.setCard?.rarity ?? null,
    setCode: item.collectionEntry.setCard?.setCode ?? null,
  };
}

function uniqueEntrySelection(
  offeredEntryIds: string[],
  requestedEntryIds: string[],
): EntrySelection {
  return {
    offeredIds: [...new Set(offeredEntryIds)],
    requestedIds: [...new Set(requestedEntryIds)],
  };
}

function ensureNonEmptyTrade(selection: EntrySelection) {
  if (selection.offeredIds.length === 0 && selection.requestedIds.length === 0) {
    throw new TradeServiceError(
      "Ein Trade braucht mindestens eine angebotene oder angefragte Karte.",
      400,
    );
  }
}

function latestVersion(trade: TradeRecord) {
  return trade.versions.at(-1) ?? null;
}

function getActiveVersion(trade: TradeRecord) {
  if (trade.activeVersion) {
    return trade.activeVersion;
  }

  if (!trade.activeVersionId) {
    return null;
  }

  return trade.versions.find((version) => version.id === trade.activeVersionId) ?? null;
}

function getAcceptedVersion(trade: TradeRecord) {
  if (trade.acceptedVersion) {
    return trade.acceptedVersion;
  }

  if (!trade.acceptedVersionId) {
    return null;
  }

  return trade.versions.find((version) => version.id === trade.acceptedVersionId) ?? null;
}

function getReferenceVersion(trade: TradeRecord) {
  return getAcceptedVersion(trade) ?? getActiveVersion(trade) ?? latestVersion(trade);
}

function versionToDto(trade: TradeRecord, version: TradeVersionRecord): TradeVersionDto {
  const offered = version.items.filter((item) => item.fromUserId === version.senderId);
  const requested = version.items.filter((item) => item.fromUserId === version.recipientId);

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    note: version.note ?? null,
    createdAt: version.createdAt.toISOString(),
    supersededAt: version.supersededAt?.toISOString() ?? null,
    sender: participantToDto(version.sender),
    recipient: participantToDto(version.recipient),
    offered: offered.map(toCardLineDto),
    requested: requested.map(toCardLineDto),
    isActive: trade.activeVersionId === version.id,
    isAccepted: trade.acceptedVersionId === version.id,
  };
}

function viewerHasConfirmed(trade: TradeRecord, viewerId: string) {
  return viewerId === trade.proposerId
    ? Boolean(trade.proposerConfirmedAt)
    : Boolean(trade.responderConfirmedAt);
}

function deriveAllowedActions(trade: TradeRecord, viewerId: string): TradeAllowedAction[] {
  const activeVersion = getActiveVersion(trade);

  if (trade.status === "PENDING" && activeVersion) {
    if (activeVersion.recipientId === viewerId) {
      return ["accept", "reject", "counter"];
    }

    if (activeVersion.senderId === viewerId) {
      return ["cancel"];
    }
  }

  if (trade.status === "ACCEPTED") {
    const actions: TradeAllowedAction[] = ["cancel"];

    if (!viewerHasConfirmed(trade, viewerId)) {
      actions.unshift("confirmCompletion");
    }

    return actions;
  }

  return [];
}

function deriveThreadState(trade: TradeRecord, viewerId: string): TradeListItemDto["threadState"] {
  const activeVersion = getActiveVersion(trade);
  return deriveTradeThreadState({
    status: trade.status,
    viewerIsActiveRecipient: activeVersion?.recipientId === viewerId,
    viewerHasConfirmed: viewerHasConfirmed(trade, viewerId),
  });
}

function buildTimeline(trade: TradeRecord): TradeTimelineEntryDto[] {
  const entries: TradeTimelineEntryDto[] = trade.versions.map((version) => ({
    id: `version-${version.id}`,
    type: "VERSION_CREATED",
    createdAt: version.createdAt.toISOString(),
    actor: participantToDto(version.sender),
    title: `Version ${version.versionNumber} von ${version.sender.displayName}`,
    detail:
      version.note?.trim() ||
      `${version.items.filter((item) => item.fromUserId === version.senderId).length} Karten angeboten, ${version.items.filter((item) => item.fromUserId === version.recipientId).length} Karten angefragt.`,
  }));

  const acceptedVersion = getAcceptedVersion(trade);

  if (acceptedVersion && trade.acceptedAt) {
    entries.push({
      id: `accepted-${trade.id}`,
      type: "TRADE_ACCEPTED",
      createdAt: trade.acceptedAt.toISOString(),
      actor: participantToDto(acceptedVersion.recipient),
      title: `Version ${acceptedVersion.versionNumber} angenommen`,
      detail: "Alle Karten dieser finalen Version wurden atomar reserviert.",
    });
  }

  if (trade.proposerConfirmedAt) {
    entries.push({
      id: `confirmed-${trade.id}-${trade.proposerId}`,
      type: "TRADE_CONFIRMED",
      createdAt: trade.proposerConfirmedAt.toISOString(),
      actor: participantToDto(trade.proposer),
      title: `${trade.proposer.displayName} hat den Abschluss bestätigt`,
      detail: "Der Besitzwechsel wartet jetzt nur noch auf beide Bestätigungen.",
    });
  }

  if (trade.responderConfirmedAt) {
    entries.push({
      id: `confirmed-${trade.id}-${trade.responderId}`,
      type: "TRADE_CONFIRMED",
      createdAt: trade.responderConfirmedAt.toISOString(),
      actor: participantToDto(trade.responder),
      title: `${trade.responder.displayName} hat den Abschluss bestätigt`,
      detail: "Der Besitzwechsel wartet jetzt nur noch auf beide Bestätigungen.",
    });
  }

  if (trade.status === "COMPLETED" && trade.resolvedAt) {
    entries.push({
      id: `completed-${trade.id}`,
      type: "TRADE_COMPLETED",
      createdAt: trade.resolvedAt.toISOString(),
      actor: null,
      title: "Trade abgeschlossen",
      detail: "Alle reservierten Sammlungseinträge wurden final zwischen beiden Duelists übertragen.",
    });
  }

  if (trade.status === "REJECTED" && trade.resolvedAt) {
    entries.push({
      id: `rejected-${trade.id}`,
      type: "TRADE_REJECTED",
      createdAt: trade.resolvedAt.toISOString(),
      actor: trade.rejectedBy ? participantToDto(trade.rejectedBy) : null,
      title: "Trade abgelehnt",
      detail: "Der Verhandlungs-Thread wurde vom aktuellen Empfänger endgültig geschlossen.",
    });
  }

  if (trade.status === "CANCELLED" && trade.resolvedAt) {
    entries.push({
      id: `cancelled-${trade.id}`,
      type: "TRADE_CANCELLED",
      createdAt: trade.resolvedAt.toISOString(),
      actor: trade.cancelledBy ? participantToDto(trade.cancelledBy) : null,
      title: "Trade abgebrochen",
      detail: "Der Thread wurde vor dem finalen Besitzwechsel beendet.",
    });
  }

  return entries.sort((left, right) => {
    const timestampDiff =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

    if (timestampDiff !== 0) {
      return timestampDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function toTradeDetailDto(trade: TradeRecord, viewerId: string): TradeDetailDto {
  return {
    id: trade.id,
    status: trade.status,
    proposedAt: trade.proposedAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    resolvedAt: trade.resolvedAt?.toISOString() ?? null,
    acceptedAt: trade.acceptedAt?.toISOString() ?? null,
    acceptedVersionId: trade.acceptedVersionId ?? null,
    proposerConfirmedAt: trade.proposerConfirmedAt?.toISOString() ?? null,
    responderConfirmedAt: trade.responderConfirmedAt?.toISOString() ?? null,
    cancelledByUserId: trade.cancelledByUserId ?? null,
    rejectedByUserId: trade.rejectedByUserId ?? null,
    proposer: participantToDto(trade.proposer),
    responder: participantToDto(trade.responder),
    activeVersion: getActiveVersion(trade) ? versionToDto(trade, getActiveVersion(trade)!) : null,
    versions: trade.versions.map((version) => versionToDto(trade, version)).reverse(),
    viewerRole: viewerId === trade.proposerId ? "PROPOSER" : "RESPONDER",
    allowedActions: deriveAllowedActions(trade, viewerId),
    timeline: buildTimeline(trade).reverse(),
  };
}

function toTradeListItemDto(trade: TradeRecord, viewerId: string): TradeListItemDto {
  const partner = viewerId === trade.proposerId ? trade.responder : trade.proposer;
  const referenceVersion = getReferenceVersion(trade);
  const givingItems =
    referenceVersion?.items.filter((item) => item.fromUserId === viewerId) ?? [];
  const receivingItems =
    referenceVersion?.items.filter((item) => item.toUserId === viewerId) ?? [];
  const threadState = deriveThreadState(trade, viewerId);

  return {
    id: trade.id,
    status: trade.status,
    threadState,
    proposedAt: trade.proposedAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    resolvedAt: trade.resolvedAt?.toISOString() ?? null,
    activeVersionNumber: getActiveVersion(trade)?.versionNumber ?? null,
    note: referenceVersion?.note ?? trade.note ?? null,
    partner: participantToDto(partner),
    givingCount: givingItems.length,
    receivingCount: receivingItems.length,
    givingPreview: givingItems.slice(0, 4).map((item) => item.collectionEntry.card.name),
    receivingPreview: receivingItems.slice(0, 4).map((item) => item.collectionEntry.card.name),
    awaitingYourResponse: threadState === "awaitingYourResponse",
    waitingForYourConfirmation: threadState === "waitingForYourConfirmation",
  };
}

async function ensureAcceptedFriendship(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  otherUserId: string,
) {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        {
          requesterId: userId,
          addresseeId: otherUserId,
        },
        {
          requesterId: otherUserId,
          addresseeId: userId,
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!friendship) {
    throw new TradeServiceError(
      "Trades sind nur zwischen akzeptierten Freunden möglich.",
      403,
    );
  }
}

async function loadTrade(prisma: PrismaClient | Prisma.TransactionClient, tradeId: string) {
  return prisma.trade.findUnique({
    where: {
      id: tradeId,
    },
    include: tradeInclude,
  });
}

async function ensureLegacyTradeThread(
  tx: Prisma.TransactionClient,
  tradeId: string,
) {
  const trade = await tx.trade.findUnique({
    where: {
      id: tradeId,
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "asc",
        },
        select: {
          id: true,
          versionNumber: true,
        },
      },
      items: true,
    },
  });

  if (!trade) {
    return;
  }

  let latestVersionId = trade.versions.at(-1)?.id ?? null;

  if (trade.versions.length === 0) {
    const createdVersion = await tx.tradeVersion.create({
      data: {
        tradeId: trade.id,
        versionNumber: 1,
        senderId: trade.proposerId,
        recipientId: trade.responderId,
        note: trade.note?.trim() || null,
      },
    });

    latestVersionId = createdVersion.id;

    if (trade.items.length > 0) {
      await tx.tradeVersionItem.createMany({
        data: trade.items.map((item) => ({
          tradeVersionId: createdVersion.id,
          collectionEntryId: item.collectionEntryId,
          fromUserId: item.fromUserId,
          toUserId: item.toUserId,
        })),
      });
    }
  }

  if (!latestVersionId) {
    return;
  }

  const patch: Prisma.TradeUpdateInput = {};
  const fallbackResolvedAt = trade.resolvedAt ?? trade.updatedAt;

  if (trade.status === "PENDING" && !trade.activeVersionId) {
    patch.activeVersion = {
      connect: {
        id: latestVersionId,
      },
    };
  }

  if ((trade.status === "ACCEPTED" || trade.status === "COMPLETED") && !trade.acceptedVersionId) {
    patch.acceptedVersion = {
      connect: {
        id: latestVersionId,
      },
    };
  }

  if (trade.status === "ACCEPTED" && !trade.activeVersionId) {
    patch.activeVersion = {
      connect: {
        id: latestVersionId,
      },
    };
  }

  if ((trade.status === "ACCEPTED" || trade.status === "COMPLETED") && !trade.acceptedAt) {
    patch.acceptedAt = fallbackResolvedAt;
  }

  if (trade.status === "COMPLETED" && !trade.proposerConfirmedAt) {
    patch.proposerConfirmedAt = fallbackResolvedAt;
  }

  if (trade.status === "COMPLETED" && !trade.responderConfirmedAt) {
    patch.responderConfirmedAt = fallbackResolvedAt;
  }

  if (trade.status === "REJECTED" && !trade.rejectedByUserId) {
    patch.rejectedBy = {
      connect: {
        id: trade.responderId,
      },
    };
  }

  if (trade.status === "CANCELLED" && !trade.cancelledByUserId) {
    patch.cancelledBy = {
      connect: {
        id: trade.proposerId,
      },
    };
  }

  if (Object.keys(patch).length > 0) {
    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: patch,
    });
  }
}

async function backfillTradesForViewer(prisma: PrismaClient, viewerId: string) {
  const legacyTrades = await prisma.trade.findMany({
    where: {
      OR: [{ proposerId: viewerId }, { responderId: viewerId }],
      AND: [
        {
          OR: [
            {
              versions: {
                none: {},
              },
            },
            {
              status: "PENDING",
              activeVersionId: null,
            },
            {
              status: {
                in: ["ACCEPTED", "COMPLETED"],
              },
              acceptedVersionId: null,
            },
            {
              status: "REJECTED",
              rejectedByUserId: null,
            },
            {
              status: "CANCELLED",
              cancelledByUserId: null,
            },
          ],
        },
      ],
    },
    select: {
      id: true,
    },
  });

  for (const trade of legacyTrades) {
    await prisma.$transaction((tx) => ensureLegacyTradeThread(tx, trade.id));
  }
}

async function backfillTradeById(prisma: PrismaClient, tradeId: string) {
  await prisma.$transaction((tx) => ensureLegacyTradeThread(tx, tradeId));
}

async function loadTradeForViewer(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);
  const trade = await loadTrade(prisma, tradeId);

  if (
    !trade ||
    trade.runId !== activeRun.id ||
    (trade.proposerId !== viewerId && trade.responderId !== viewerId)
  ) {
    throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
  }

  return trade;
}

async function loadEntriesForDraft(
  prisma: PrismaClient | Prisma.TransactionClient,
  senderId: string,
  recipientId: string,
  runId: string,
  selection: EntrySelection,
) {
  const [offeredEntries, requestedEntries] = await Promise.all([
    selection.offeredIds.length > 0
      ? prisma.collectionEntry.findMany({
          where: {
            id: {
              in: selection.offeredIds,
            },
            userId: senderId,
            runId,
            lockState: EntryLockState.AVAILABLE,
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
    selection.requestedIds.length > 0
      ? prisma.collectionEntry.findMany({
          where: {
            id: {
              in: selection.requestedIds,
            },
            userId: recipientId,
            runId,
            lockState: EntryLockState.AVAILABLE,
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (
    offeredEntries.length !== selection.offeredIds.length ||
    requestedEntries.length !== selection.requestedIds.length
  ) {
    throw new TradeServiceError(
      "Mindestens eine gewählte Sammlungskopie ist nicht mehr verfügbar.",
      409,
    );
  }
}

function requirePendingTrade(trade: TradeRecord) {
  if (trade.status !== "PENDING") {
    throw new TradeServiceError(
      "Dieser Trade ist nicht mehr offen für Verhandlungen.",
      409,
    );
  }
}

function requireAcceptedTrade(trade: TradeRecord) {
  if (trade.status !== "ACCEPTED") {
    throw new TradeServiceError(
      "Dieser Trade wartet aktuell nicht auf Abschlussbestätigungen.",
      409,
    );
  }
}

function requireParticipant(trade: TradeRecord, viewerId: string) {
  if (trade.proposerId !== viewerId && trade.responderId !== viewerId) {
    throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
  }
}

export async function listTradesForViewer(prisma: PrismaClient, viewerId: string) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradesForViewer(prisma, viewerId);

  const trades = await prisma.trade.findMany({
    where: {
      runId: activeRun.id,
      OR: [{ proposerId: viewerId }, { responderId: viewerId }],
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: tradeInclude,
  });

  return trades.map((trade) => toTradeListItemDto(trade, viewerId));
}

export async function getTradeDetail(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const trade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(trade, viewerId);
}

export async function createTradeOffer(
  prisma: PrismaClient,
  viewerId: string,
  draft: TradeOfferDraft,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const responder = await prisma.user.findUnique({
    where: {
      duelistId: draft.responderDuelistId.trim().toUpperCase(),
    },
    select: {
      id: true,
    },
  });

  if (!responder) {
    throw new TradeServiceError("Tauschpartner wurde nicht gefunden.", 404);
  }

  if (responder.id === viewerId) {
    throw new TradeServiceError("Du kannst dir selbst keinen Trade schicken.", 400);
  }

  await ensureAcceptedFriendship(prisma, viewerId, responder.id);
  await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: responder.id,
  });

  const selection = uniqueEntrySelection(draft.offeredEntryIds, draft.requestedEntryIds);
  ensureNonEmptyTrade(selection);
  await loadEntriesForDraft(prisma, viewerId, responder.id, activeRun.id, selection);

  const tradeId = await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        proposerId: viewerId,
        responderId: responder.id,
        runId: activeRun.id,
        note: draft.note?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    const version = await tx.tradeVersion.create({
      data: {
        tradeId: trade.id,
        versionNumber: 1,
        senderId: viewerId,
        recipientId: responder.id,
        note: draft.note?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    await tx.tradeVersionItem.createMany({
      data: [
        ...selection.offeredIds.map((collectionEntryId) => ({
          tradeVersionId: version.id,
          collectionEntryId,
          fromUserId: viewerId,
          toUserId: responder.id,
        })),
        ...selection.requestedIds.map((collectionEntryId) => ({
          tradeVersionId: version.id,
          collectionEntryId,
          fromUserId: responder.id,
          toUserId: viewerId,
        })),
      ],
    });

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        activeVersion: {
          connect: {
            id: version.id,
          },
        },
      },
    });

    return trade.id;
  });

  const createdTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(createdTrade, viewerId);
}

export async function createTradeCounterOffer(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
  draft: TradeVersionDraft,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);

  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);

    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }

    requireParticipant(trade, viewerId);
    requirePendingTrade(trade);

    const activeVersion = getActiveVersion(trade);

    if (!activeVersion) {
      throw new TradeServiceError("Die aktive Angebots-Version fehlt.", 409);
    }

    if (activeVersion.recipientId !== viewerId) {
      throw new TradeServiceError(
        "Nur der aktuelle Empfänger darf ein Gegenangebot senden.",
        403,
      );
    }

    await ensureAcceptedFriendship(tx, trade.proposerId, trade.responderId);

    const selection = uniqueEntrySelection(draft.offeredEntryIds, draft.requestedEntryIds);
    ensureNonEmptyTrade(selection);
    await loadEntriesForDraft(tx, viewerId, activeVersion.senderId, activeRun.id, selection);

    await tx.tradeVersion.update({
      where: {
        id: activeVersion.id,
      },
      data: {
        supersededAt: new Date(),
      },
    });

    const version = await tx.tradeVersion.create({
      data: {
        tradeId: trade.id,
        versionNumber: latestVersion(trade)?.versionNumber
          ? latestVersion(trade)!.versionNumber + 1
          : 1,
        senderId: viewerId,
        recipientId: activeVersion.senderId,
        note: draft.note?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    await tx.tradeVersionItem.createMany({
      data: [
        ...selection.offeredIds.map((collectionEntryId) => ({
          tradeVersionId: version.id,
          collectionEntryId,
          fromUserId: viewerId,
          toUserId: activeVersion.senderId,
        })),
        ...selection.requestedIds.map((collectionEntryId) => ({
          tradeVersionId: version.id,
          collectionEntryId,
          fromUserId: activeVersion.senderId,
          toUserId: viewerId,
        })),
      ],
    });

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        activeVersion: {
          connect: {
            id: version.id,
          },
        },
        note: draft.note?.trim() || trade.note,
        updatedAt: new Date(),
      },
    });
  });

  const updatedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(updatedTrade, viewerId);
}

export async function acceptTradeVersion(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);

  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);

    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }

    requireParticipant(trade, viewerId);
    requirePendingTrade(trade);

    const activeVersion = getActiveVersion(trade);

    if (!activeVersion) {
      throw new TradeServiceError("Die aktive Angebots-Version fehlt.", 409);
    }

    if (activeVersion.recipientId !== viewerId) {
      throw new TradeServiceError(
        "Nur der aktuelle Empfänger darf diese Version annehmen.",
        403,
      );
    }

    for (const item of activeVersion.items) {
      const { count } = await tx.collectionEntry.updateMany({
        where: {
          id: item.collectionEntryId,
          userId: item.fromUserId,
          runId: activeRun.id,
          lockState: EntryLockState.AVAILABLE,
        },
        data: {
          lockState: EntryLockState.RESERVED,
        },
      });

      if (count !== 1) {
        throw new TradeServiceError(
          "Mindestens eine Kartenkopie ist nicht mehr verfügbar. Bitte prüfe die aktive Version erneut.",
          409,
        );
      }
    }

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "ACCEPTED",
        acceptedVersion: {
          connect: {
            id: activeVersion.id,
          },
        },
        acceptedAt: new Date(),
        proposerConfirmedAt: null,
        responderConfirmedAt: null,
        resolvedAt: null,
      },
    });
  });

  const acceptedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(acceptedTrade, viewerId);
}

export async function confirmTradeCompletion(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);

  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);

    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }

    requireParticipant(trade, viewerId);
    requireAcceptedTrade(trade);

    const acceptedVersion = getAcceptedVersion(trade);

    if (!acceptedVersion) {
      throw new TradeServiceError("Die akzeptierte Version fehlt.", 409);
    }

    const now = new Date();
    const isProposer = viewerId === trade.proposerId;
    const nextProposerConfirmedAt = isProposer
      ? trade.proposerConfirmedAt ?? now
      : trade.proposerConfirmedAt;
    const nextResponderConfirmedAt = isProposer
      ? trade.responderConfirmedAt
      : trade.responderConfirmedAt ?? now;

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        proposerConfirmedAt: nextProposerConfirmedAt,
        responderConfirmedAt: nextResponderConfirmedAt,
      },
    });

    if (nextProposerConfirmedAt && nextResponderConfirmedAt) {
      for (const item of acceptedVersion.items) {
        const { count } = await tx.collectionEntry.updateMany({
          where: {
            id: item.collectionEntryId,
            userId: item.fromUserId,
            runId: activeRun.id,
            lockState: EntryLockState.RESERVED,
          },
          data: {
            userId: item.toUserId,
            source: OwnershipSource.TRADE,
            sourceReferenceId: trade.id,
            lockState: EntryLockState.AVAILABLE,
          },
        });

        if (count !== 1) {
          throw new TradeServiceError(
            "Mindestens eine reservierte Kartenkopie konnte nicht final übertragen werden.",
            409,
          );
        }
      }

      await tx.trade.update({
        where: {
          id: trade.id,
        },
        data: {
          status: "COMPLETED",
          resolvedAt: now,
        },
      });
    }
  });

  const completedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(completedTrade, viewerId);
}

export async function rejectTrade(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);

  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);

    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }

    requireParticipant(trade, viewerId);
    requirePendingTrade(trade);

    const activeVersion = getActiveVersion(trade);

    if (!activeVersion) {
      throw new TradeServiceError("Die aktive Angebots-Version fehlt.", 409);
    }

    if (activeVersion.recipientId !== viewerId) {
      throw new TradeServiceError(
        "Nur der aktuelle Empfänger darf diesen Thread ablehnen.",
        403,
      );
    }

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "REJECTED",
        rejectedBy: {
          connect: {
            id: viewerId,
          },
        },
        resolvedAt: new Date(),
      },
    });
  });

  const rejectedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(rejectedTrade, viewerId);
}

export async function cancelTrade(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);

  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);

    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }

    requireParticipant(trade, viewerId);

    if (trade.status === "PENDING") {
      const activeVersion = getActiveVersion(trade);

      if (!activeVersion) {
        throw new TradeServiceError("Die aktive Angebots-Version fehlt.", 409);
      }

      if (activeVersion.senderId !== viewerId) {
        throw new TradeServiceError(
          "Nur der aktuelle Sender darf den offenen Thread abbrechen.",
          403,
        );
      }
    } else if (trade.status === "ACCEPTED") {
      const acceptedVersion = getAcceptedVersion(trade);

      if (!acceptedVersion) {
        throw new TradeServiceError("Die akzeptierte Version fehlt.", 409);
      }

      await tx.collectionEntry.updateMany({
        where: {
          id: {
            in: acceptedVersion.items.map((item) => item.collectionEntryId),
          },
          runId: activeRun.id,
          lockState: EntryLockState.RESERVED,
        },
        data: {
          lockState: EntryLockState.AVAILABLE,
        },
      });
    } else {
      throw new TradeServiceError("Dieser Thread kann nicht mehr abgebrochen werden.", 409);
    }

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "CANCELLED",
        cancelledBy: {
          connect: {
            id: viewerId,
          },
        },
        resolvedAt: new Date(),
      },
    });
  });

  const cancelledTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(cancelledTrade, viewerId);
}
