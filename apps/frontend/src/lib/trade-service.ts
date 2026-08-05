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
import { getActiveCampaignRuleConfig } from "@/lib/campaign-rule-service";
import { getActiveRun, getOrCreateWallet, requireRunMembership } from "@/lib/run-service";

class TradeServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TradeServiceError";
    this.status = status;
  }
}

async function requireTradesEnabled(
  prisma: PrismaClient | Prisma.TransactionClient,
  runId: string,
) {
  const config = await getActiveCampaignRuleConfig(prisma, runId);
  if (!config.trades.enabled) {
    throw new TradeServiceError(
      "Tauschen ist in den aktiven Kampagnenregeln deaktiviert.",
      409,
    );
  }
  return config.trades;
}

async function expireTradeReservationIfNeeded(
  prisma: PrismaClient,
  tradeId: string,
  runId: string,
) {
  const trade = await loadTrade(prisma, tradeId);
  if (
    !trade
    || trade.runId !== runId
    || trade.status !== "ACCEPTED"
    || !trade.reservationExpiresAt
    || trade.reservationExpiresAt.getTime() > Date.now()
  ) {
    return false;
  }
  const acceptedVersion = getAcceptedVersion(trade);
  await prisma.$transaction(async (tx) => {
    if (acceptedVersion) {
      await tx.collectionEntry.updateMany({
        where: {
          id: { in: acceptedVersion.items.map((item) => item.collectionEntryId) },
          runId,
          lockState: EntryLockState.RESERVED,
        },
        data: { lockState: EntryLockState.AVAILABLE },
      });
      await releaseVersionCreditReservations(tx, runId, acceptedVersion);
    }
    await tx.trade.updateMany({
      where: { id: tradeId, status: "ACCEPTED" },
      data: {
        status: "CANCELLED",
        resolvedAt: new Date(),
      },
    });
  });
  return true;
}

async function expireStaleTradeReservations(
  prisma: PrismaClient,
  runId: string,
) {
  const stale = await prisma.trade.findMany({
    where: {
      runId,
      status: "ACCEPTED",
      reservationExpiresAt: { lte: new Date() },
    },
    select: { id: true },
  });
  for (const trade of stale) {
    await expireTradeReservationIfNeeded(prisma, trade.id, runId);
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

function ensureNonEmptyTrade(
  selection: EntrySelection,
  credits: { offeredCredits: number; requestedCredits: number },
) {
  if (selection.offeredIds.length === 0 && selection.requestedIds.length === 0
    && credits.offeredCredits === 0 && credits.requestedCredits === 0) {
    throw new TradeServiceError(
      "Ein Trade braucht mindestens eine angebotene oder angefragte Karte.",
      400,
    );
  }
}

function assertTradeDraftRules(
  rules: Awaited<ReturnType<typeof requireTradesEnabled>>,
  selection: EntrySelection,
  credits: { offeredCredits: number; requestedCredits: number },
) {
  if (!rules.modes.includes("DIRECT")) {
    throw new TradeServiceError("Direkte Trades sind in dieser Kampagne deaktiviert.", 409);
  }
  const now = new Date();
  if (rules.tradeWindowStart && new Date(rules.tradeWindowStart) > now) {
    throw new TradeServiceError("Das Tauschfenster dieser Kampagne ist noch nicht geöffnet.", 409);
  }
  if (rules.tradeWindowEnd && new Date(rules.tradeWindowEnd) <= now) {
    throw new TradeServiceError("Das Tauschfenster dieser Kampagne ist geschlossen.", 409);
  }
  if ((credits.offeredCredits > 0 || credits.requestedCredits > 0) && !rules.allowCredits) {
    throw new TradeServiceError("Credit-Trades sind in dieser Kampagne deaktiviert.", 409);
  }
  if (rules.maxCardsPerTrade !== null
    && selection.offeredIds.length + selection.requestedIds.length > rules.maxCardsPerTrade) {
    throw new TradeServiceError(`Ein Trade darf höchstens ${rules.maxCardsPerTrade} Karten enthalten.`, 409);
  }
  if (rules.maxCreditsPerTrade !== null
    && Math.max(credits.offeredCredits, credits.requestedCredits) > rules.maxCreditsPerTrade) {
    throw new TradeServiceError(`Pro Seite sind höchstens ${rules.maxCreditsPerTrade} Credits erlaubt.`, 409);
  }
}

async function reserveWalletCredits(
  tx: Prisma.TransactionClient,
  runId: string,
  userId: string,
  amount: number,
) {
  if (amount === 0) return;
  const wallet = await getOrCreateWallet(tx, { runId, userId });
  const updated = await tx.creditWallet.updateMany({
    where: {
      id: wallet.id,
      reservedBalance: wallet.reservedBalance,
      balance: { gte: wallet.reservedBalance + amount },
    },
    data: { reservedBalance: { increment: amount } },
  });
  if (updated.count !== 1) {
    throw new TradeServiceError("Mindestens eine Seite hat nicht genügend freie Credits.", 409);
  }
}

async function releaseVersionCreditReservations(
  tx: Prisma.TransactionClient,
  runId: string,
  version: { senderId: string; recipientId: string; offeredCredits: number; requestedCredits: number },
) {
  for (const [userId, amount] of [
    [version.senderId, version.offeredCredits],
    [version.recipientId, version.requestedCredits],
  ] as const) {
    if (amount === 0) continue;
    const wallet = await getOrCreateWallet(tx, { runId, userId });
    const released = await tx.creditWallet.updateMany({
      where: { id: wallet.id, reservedBalance: { gte: amount } },
      data: { reservedBalance: { decrement: amount } },
    });
    if (released.count !== 1) {
      throw new TradeServiceError("Eine Credit-Reservierung ist nicht mehr konsistent.", 409);
    }
  }
}

async function transferReservedCredits(
  tx: Prisma.TransactionClient,
  options: {
    runId: string;
    tradeId: string;
    payerId: string;
    recipientId: string;
    amount: number;
    direction: "OFFERED" | "REQUESTED";
  },
) {
  if (options.amount === 0) return;
  const [payerWallet, recipientWallet] = await Promise.all([
    getOrCreateWallet(tx, { runId: options.runId, userId: options.payerId }),
    getOrCreateWallet(tx, { runId: options.runId, userId: options.recipientId }),
  ]);
  const debited = await tx.creditWallet.updateMany({
    where: {
      id: payerWallet.id,
      balance: { gte: options.amount },
      reservedBalance: { gte: options.amount },
    },
    data: {
      balance: { decrement: options.amount },
      reservedBalance: { decrement: options.amount },
    },
  });
  if (debited.count !== 1) {
    throw new TradeServiceError("Reservierte Credits konnten nicht final übertragen werden.", 409);
  }
  const [payerAfter, recipientAfter] = await Promise.all([
    tx.creditWallet.findUniqueOrThrow({ where: { id: payerWallet.id } }),
    tx.creditWallet.update({
      where: { id: recipientWallet.id },
      data: { balance: { increment: options.amount } },
    }),
  ]);
  await tx.creditLedgerEntry.createMany({
    data: [
      {
        runId: options.runId,
        walletId: payerWallet.id,
        userId: options.payerId,
        amount: -options.amount,
        balanceAfter: payerAfter.balance,
        source: "TRADE_TRANSFER",
        referenceType: `Trade:${options.direction}`,
        referenceId: options.tradeId,
        note: "Credit-Anteil eines abgeschlossenen Trades.",
      },
      {
        runId: options.runId,
        walletId: recipientWallet.id,
        userId: options.recipientId,
        amount: options.amount,
        balanceAfter: recipientAfter.balance,
        source: "TRADE_TRANSFER",
        referenceType: `Trade:${options.direction}`,
        referenceId: options.tradeId,
        note: "Credit-Anteil eines abgeschlossenen Trades.",
      },
    ],
  });
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
    offeredCredits: version.offeredCredits,
    requestedCredits: version.requestedCredits,
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
  if (
    trade.status === "ACCEPTED"
    && trade.requiresOrganizerApproval
    && !trade.approvedAt
    && trade.proposerConfirmedAt
    && trade.responderConfirmedAt
  ) {
    return "waitingForOrganizerApproval";
  }
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

  if (trade.approvedAt) {
    entries.push({
      id: `approved-${trade.id}`,
      type: "TRADE_APPROVED",
      createdAt: trade.approvedAt.toISOString(),
      actor: null,
      title: "Trade durch die Kampagnenleitung freigegeben",
      detail: "Die organisatorische Prüfung ist abgeschlossen.",
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
    reservationExpiresAt: trade.reservationExpiresAt?.toISOString() ?? null,
    acceptedVersionId: trade.acceptedVersionId ?? null,
    proposerConfirmedAt: trade.proposerConfirmedAt?.toISOString() ?? null,
    responderConfirmedAt: trade.responderConfirmedAt?.toISOString() ?? null,
    cancelledByUserId: trade.cancelledByUserId ?? null,
    rejectedByUserId: trade.rejectedByUserId ?? null,
    requiresOrganizerApproval: trade.requiresOrganizerApproval,
    approvedByUserId: trade.approvedByUserId ?? null,
    approvedAt: trade.approvedAt?.toISOString() ?? null,
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
    givingCredits: referenceVersion
      ? referenceVersion.senderId === viewerId ? referenceVersion.offeredCredits : referenceVersion.requestedCredits
      : 0,
    receivingCredits: referenceVersion
      ? referenceVersion.senderId === viewerId ? referenceVersion.requestedCredits : referenceVersion.offeredCredits
      : 0,
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
  await expireStaleTradeReservations(prisma, activeRun.id);

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
  const tradeRules = await requireTradesEnabled(prisma, activeRun.id);
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
  const responderMembership = await requireRunMembership(prisma, {
    runId: activeRun.id,
    userId: responder.id,
  });

  if (tradeRules.minimumMembershipDays > 0) {
    const cutoff = Date.now() - tradeRules.minimumMembershipDays * 86_400_000;
    const viewerMembership = await requireRunMembership(prisma, { runId: activeRun.id, userId: viewerId });
    if (viewerMembership.joinedAt.getTime() > cutoff || responderMembership.joinedAt.getTime() > cutoff) {
      throw new TradeServiceError(`Beide Seiten müssen seit mindestens ${tradeRules.minimumMembershipDays} Tagen Mitglied sein.`, 409);
    }
  }

  const selection = uniqueEntrySelection(draft.offeredEntryIds, draft.requestedEntryIds);
  const credits = { offeredCredits: draft.offeredCredits ?? 0, requestedCredits: draft.requestedCredits ?? 0 };
  ensureNonEmptyTrade(selection, credits);
  assertTradeDraftRules(tradeRules, selection, credits);
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
        offeredCredits: credits.offeredCredits,
        requestedCredits: credits.requestedCredits,
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
  const tradeRules = await requireTradesEnabled(prisma, activeRun.id);
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

    assertTradeDraftRules(
      tradeRules,
      {
        offeredIds: activeVersion.items.filter((item) => item.fromUserId === activeVersion.senderId).map((item) => item.collectionEntryId),
        requestedIds: activeVersion.items.filter((item) => item.fromUserId === activeVersion.recipientId).map((item) => item.collectionEntryId),
      },
      { offeredCredits: activeVersion.offeredCredits, requestedCredits: activeVersion.requestedCredits },
    );

    await ensureAcceptedFriendship(tx, trade.proposerId, trade.responderId);

    const selection = uniqueEntrySelection(draft.offeredEntryIds, draft.requestedEntryIds);
    const credits = { offeredCredits: draft.offeredCredits ?? 0, requestedCredits: draft.requestedCredits ?? 0 };
    ensureNonEmptyTrade(selection, credits);
    assertTradeDraftRules(tradeRules, selection, credits);
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
        offeredCredits: credits.offeredCredits,
        requestedCredits: credits.requestedCredits,
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
  const tradeRules = await requireTradesEnabled(prisma, activeRun.id);
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


    await reserveWalletCredits(tx, activeRun.id, activeVersion.senderId, activeVersion.offeredCredits);
    await reserveWalletCredits(tx, activeRun.id, activeVersion.recipientId, activeVersion.requestedCredits);

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
        reservationExpiresAt: new Date(
          Date.now() + tradeRules.reservationMinutes * 60_000,
        ),
        proposerConfirmedAt: null,
        responderConfirmedAt: null,
        requiresOrganizerApproval: tradeRules.organizerApproval,
        approvedBy: { disconnect: true },
        approvedAt: null,
        resolvedAt: null,
      },
    });
  });

  const acceptedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(acceptedTrade, viewerId);
}

export async function listPendingTradeApprovals(
  prisma: PrismaClient,
  viewerId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const membership = activeRun.memberships.find((entry) => entry.userId === viewerId);
  if (!membership || !["OWNER", "ORGANIZER"].includes(membership.role)) {
    throw new TradeServiceError("Nur Owner oder Organizer dürfen Trade-Freigaben sehen.", 403);
  }
  await expireStaleTradeReservations(prisma, activeRun.id);
  const trades = await prisma.trade.findMany({
    where: {
      runId: activeRun.id,
      status: "ACCEPTED",
      requiresOrganizerApproval: true,
      approvedAt: null,
      proposerConfirmedAt: { not: null },
      responderConfirmedAt: { not: null },
    },
    orderBy: { updatedAt: "asc" },
    include: tradeInclude,
  });
  return trades.map((trade) => ({
    id: trade.id,
    proposer: {
      userId: trade.proposer.id,
      duelistId: trade.proposer.duelistId,
      displayName: trade.proposer.displayName,
    },
    responder: {
      userId: trade.responder.id,
      duelistId: trade.responder.duelistId,
      displayName: trade.responder.displayName,
    },
    offeredCards: trade.acceptedVersion?.items.filter((item) => item.fromUserId === trade.proposerId).length ?? 0,
    requestedCards: trade.acceptedVersion?.items.filter((item) => item.fromUserId === trade.responderId).length ?? 0,
    offeredCredits: trade.acceptedVersion?.offeredCredits ?? 0,
    requestedCredits: trade.acceptedVersion?.requestedCredits ?? 0,
    reservationExpiresAt: trade.reservationExpiresAt?.toISOString() ?? null,
  }));
}

async function finalizeAcceptedTrade(
  tx: Prisma.TransactionClient,
  runId: string,
  trade: TradeRecord,
  acceptedVersion: NonNullable<ReturnType<typeof getAcceptedVersion>>,
  now: Date,
) {
  for (const item of acceptedVersion.items) {
    await tx.collectionBinderSlot.updateMany({
      where: { collectionEntryId: item.collectionEntryId },
      data: {
        collectionEntryId: null,
        entryReferenceId: null,
        snapshotCardId: null,
        snapshotCardName: null,
        snapshotImageUrl: null,
        snapshotPrintingLabel: null,
        snapshotSetCode: null,
        snapshotRarity: null,
      },
    });
    const { count } = await tx.collectionEntry.updateMany({
      where: {
        id: item.collectionEntryId,
        userId: item.fromUserId,
        runId,
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

  await transferReservedCredits(tx, {
    runId,
    tradeId: trade.id,
    payerId: acceptedVersion.senderId,
    recipientId: acceptedVersion.recipientId,
    amount: acceptedVersion.offeredCredits,
    direction: "OFFERED",
  });
  await transferReservedCredits(tx, {
    runId,
    tradeId: trade.id,
    payerId: acceptedVersion.recipientId,
    recipientId: acceptedVersion.senderId,
    amount: acceptedVersion.requestedCredits,
    direction: "REQUESTED",
  });

  await tx.trade.update({
    where: { id: trade.id },
    data: {
      status: "COMPLETED",
      resolvedAt: now,
      reservationExpiresAt: null,
    },
  });
}

export async function confirmTradeCompletion(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  await backfillTradeById(prisma, tradeId);
  if (await expireTradeReservationIfNeeded(prisma, tradeId, activeRun.id)) {
    throw new TradeServiceError(
      "Die Reservierungsfrist dieses Trades ist abgelaufen. Die Karten wurden wieder freigegeben.",
      409,
    );
  }

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

    if (
      nextProposerConfirmedAt
      && nextResponderConfirmedAt
      && (!trade.requiresOrganizerApproval || trade.approvedAt)
    ) {
      await finalizeAcceptedTrade(tx, activeRun.id, trade, acceptedVersion, now);
    }
  });

  const completedTrade = await loadTradeForViewer(prisma, viewerId, tradeId);
  return toTradeDetailDto(completedTrade, viewerId);
}

export async function approveTradeCompletion(
  prisma: PrismaClient,
  viewerId: string,
  tradeId: string,
) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const membership = await prisma.runMembership.findUnique({
    where: { runId_userId: { runId: activeRun.id, userId: viewerId } },
    select: { role: true },
  });
  if (!membership || !["OWNER", "ORGANIZER"].includes(membership.role)) {
    throw new TradeServiceError(
      "Nur Owner oder Organizer dürfen einen Trade freigeben.",
      403,
    );
  }

  await backfillTradeById(prisma, tradeId);
  if (await expireTradeReservationIfNeeded(prisma, tradeId, activeRun.id)) {
    throw new TradeServiceError(
      "Die Reservierungsfrist dieses Trades ist abgelaufen.",
      409,
    );
  }

  let participantViewerId = viewerId;
  await prisma.$transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);
    if (!trade || trade.runId !== activeRun.id) {
      throw new TradeServiceError("Trade wurde nicht gefunden.", 404);
    }
    requireAcceptedTrade(trade);
    if (!trade.requiresOrganizerApproval) {
      throw new TradeServiceError(
        "Dieser Trade benötigt keine organisatorische Freigabe.",
        409,
      );
    }
    if (!trade.proposerConfirmedAt || !trade.responderConfirmedAt) {
      throw new TradeServiceError(
        "Beide Beteiligten müssen den Abschluss zuerst bestätigen.",
        409,
      );
    }
    const acceptedVersion = getAcceptedVersion(trade);
    if (!acceptedVersion) {
      throw new TradeServiceError("Die akzeptierte Version fehlt.", 409);
    }

    const now = new Date();
    await tx.trade.update({
      where: { id: trade.id },
      data: {
        approvedBy: { connect: { id: viewerId } },
        approvedAt: now,
      },
    });
    await finalizeAcceptedTrade(tx, activeRun.id, trade, acceptedVersion, now);
    participantViewerId = trade.proposerId;
  });

  const approvedTrade = await loadTradeForViewer(prisma, participantViewerId, tradeId);
  return toTradeDetailDto(approvedTrade, participantViewerId);
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
      await releaseVersionCreditReservations(tx, activeRun.id, acceptedVersion);
    } else {
      throw new TradeServiceError("Dieser Thread kann nicht mehr abgebrochen werden.", 409);
    }

    await tx.trade.update({
      where: {
        id: trade.id,
      },
      data: {
        status: "CANCELLED",
        reservationExpiresAt: null,
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
