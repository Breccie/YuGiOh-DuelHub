import {
  EntryLockState,
  OwnershipSource,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import type {
  AuctionCardDto,
  AuctionListItemDto,
  AuctionOverviewDto,
} from "@ygo/contracts";
import { getActiveCampaignRuleConfig } from "@/lib/campaign-rule-service";
import {
  getActiveRun,
  getOrCreateWallet,
  requireRunMembership,
} from "@/lib/run-service";

type AuctionRules = Awaited<ReturnType<typeof getActiveCampaignRuleConfig>>["trades"];

export class AuctionServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuctionServiceError";
    this.status = status;
  }
}

const auctionInclude = {
  seller: {
    select: { id: true, duelistId: true, displayName: true },
  },
  highestBidder: {
    select: { id: true, duelistId: true, displayName: true },
  },
  collectionEntry: {
    include: {
      card: true,
      setCard: true,
    },
  },
  _count: {
    select: { bids: true },
  },
} satisfies Prisma.AuctionInclude;

type AuctionRecord = Prisma.AuctionGetPayload<{ include: typeof auctionInclude }>;

function toParticipant(user: { id: string; duelistId: string; displayName: string }) {
  return {
    userId: user.id,
    duelistId: user.duelistId,
    displayName: user.displayName,
  };
}

function toCard(entry: AuctionRecord["collectionEntry"]): AuctionCardDto {
  return {
    collectionEntryId: entry.id,
    cardId: entry.cardId,
    name: entry.card.name,
    imageUrl: `/api/assets/cards/${encodeURIComponent(entry.card.externalCardId ?? entry.card.id)}`,
    setCode: entry.setCard?.setCode ?? null,
    rarity: entry.setCard?.rarity ?? null,
  };
}

function toAuctionDto(
  auction: AuctionRecord,
  viewerId: string,
  viewerRole: "OWNER" | "ORGANIZER" | "PLAYER",
): AuctionListItemDto {
  const now = Date.now();
  const ended = auction.endsAt.getTime() <= now;
  const isSeller = auction.sellerId === viewerId;
  const isOrganizer = viewerRole === "OWNER" || viewerRole === "ORGANIZER";
  const minimumNextBid = auction.currentBid === null
    ? auction.startingBid
    : auction.currentBid + auction.minIncrement;

  return {
    id: auction.id,
    status: auction.status,
    card: toCard(auction.collectionEntry),
    seller: toParticipant(auction.seller),
    highestBidder: auction.highestBidder
      ? toParticipant(auction.highestBidder)
      : null,
    startingBid: auction.startingBid,
    minIncrement: auction.minIncrement,
    currentBid: auction.currentBid,
    minimumNextBid,
    bidCount: auction._count.bids,
    endsAt: auction.endsAt.toISOString(),
    createdAt: auction.createdAt.toISOString(),
    settledAt: auction.settledAt?.toISOString() ?? null,
    isSeller,
    isHighestBidder: auction.highestBidderId === viewerId,
    canBid: auction.status === "OPEN" && !ended && !isSeller,
    canSettle: auction.status === "OPEN" && ended && (isSeller || isOrganizer),
    canCancel: auction.status === "OPEN"
      && auction._count.bids === 0
      && (isSeller || isOrganizer),
  };
}

function assertAuctionWindow(rules: AuctionRules, now = new Date()) {
  if (!rules.enabled || !rules.modes.includes("AUCTION")) {
    throw new AuctionServiceError(
      "Auktionen sind in den aktiven Kampagnenregeln deaktiviert.",
      409,
    );
  }
  if (!rules.allowCredits) {
    throw new AuctionServiceError(
      "Auktionen benötigen aktivierte Credit-Trades.",
      409,
    );
  }
  if (rules.tradeWindowStart && new Date(rules.tradeWindowStart) > now) {
    throw new AuctionServiceError("Das Tauschfenster ist noch nicht geöffnet.", 409);
  }
  if (rules.tradeWindowEnd && new Date(rules.tradeWindowEnd) <= now) {
    throw new AuctionServiceError("Das Tauschfenster ist geschlossen.", 409);
  }
}

function assertCreditLimit(rules: AuctionRules, amount: number) {
  if (rules.maxCreditsPerTrade !== null && amount > rules.maxCreditsPerTrade) {
    throw new AuctionServiceError(
      `Ein Gebot darf höchstens ${rules.maxCreditsPerTrade} Credits betragen.`,
      409,
    );
  }
}

async function withSerializableTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Unreachable auction transaction state.");
}

async function getAuctionContext(prisma: PrismaClient, viewerId: string) {
  const activeRun = await getActiveRun(prisma, viewerId);
  const [membership, config] = await Promise.all([
    requireRunMembership(prisma, { runId: activeRun.id, userId: viewerId }),
    getActiveCampaignRuleConfig(prisma, activeRun.id),
  ]);
  return { activeRun, membership, rules: config.trades };
}

export async function getAuctionOverview(
  prisma: PrismaClient,
  viewerId: string,
): Promise<AuctionOverviewDto> {
  const { activeRun, membership, rules } = await getAuctionContext(prisma, viewerId);
  const auctionsEnabled = rules.enabled
    && rules.allowCredits
    && rules.modes.includes("AUCTION");
  const [viewer, wallet, availableEntries, auctions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { id: true, duelistId: true, displayName: true },
    }),
    getOrCreateWallet(prisma, { runId: activeRun.id, userId: viewerId }),
    prisma.collectionEntry.findMany({
      where: {
        runId: activeRun.id,
        userId: viewerId,
        lockState: EntryLockState.AVAILABLE,
      },
      orderBy: { acquiredAt: "desc" },
      take: 100,
      include: { card: true, setCard: true },
    }),
    prisma.auction.findMany({
      where: { runId: activeRun.id },
      orderBy: [{ status: "asc" }, { endsAt: "asc" }],
      take: 100,
      include: auctionInclude,
    }),
  ]);

  return {
    viewer: toParticipant(viewer),
    wallet: {
      balance: wallet.balance,
      reservedBalance: wallet.reservedBalance,
      availableBalance: wallet.balance - wallet.reservedBalance,
    },
    auctionsEnabled,
    availableCards: availableEntries.map((entry) => ({
      collectionEntryId: entry.id,
      cardId: entry.cardId,
      name: entry.card.name,
      imageUrl: `/api/assets/cards/${encodeURIComponent(entry.card.externalCardId ?? entry.card.id)}`,
      setCode: entry.setCard?.setCode ?? null,
      rarity: entry.setCard?.rarity ?? null,
    })),
    auctions: auctions.map((auction) =>
      toAuctionDto(auction, viewerId, membership.role)
    ),
  };
}

export async function createAuction(
  prisma: PrismaClient,
  viewerId: string,
  input: {
    collectionEntryId: string;
    startingBid: number;
    minIncrement: number;
    endsAt: Date;
  },
) {
  const { activeRun, membership, rules } = await getAuctionContext(prisma, viewerId);
  assertAuctionWindow(rules);
  assertCreditLimit(rules, input.startingBid);
  const now = new Date();
  if (input.endsAt.getTime() < now.getTime() + 60_000) {
    throw new AuctionServiceError("Eine Auktion muss mindestens eine Minute laufen.");
  }
  if (input.endsAt.getTime() > now.getTime() + 30 * 24 * 60 * 60 * 1000) {
    throw new AuctionServiceError("Eine Auktion darf höchstens 30 Tage laufen.");
  }
  if (rules.tradeWindowEnd && input.endsAt > new Date(rules.tradeWindowEnd)) {
    throw new AuctionServiceError(
      "Die Auktion muss vor dem Ende des Tauschfensters abgeschlossen sein.",
      409,
    );
  }

  const auctionId = await withSerializableTransaction(prisma, async (tx) => {
    const reserved = await tx.collectionEntry.updateMany({
      where: {
        id: input.collectionEntryId,
        runId: activeRun.id,
        userId: viewerId,
        lockState: EntryLockState.AVAILABLE,
      },
      data: { lockState: EntryLockState.RESERVED },
    });
    if (reserved.count !== 1) {
      throw new AuctionServiceError(
        "Diese physische Kartenkopie ist nicht verfügbar oder bereits reserviert.",
        409,
      );
    }
    const auction = await tx.auction.create({
      data: {
        runId: activeRun.id,
        sellerId: viewerId,
        collectionEntryId: input.collectionEntryId,
        startingBid: input.startingBid,
        minIncrement: input.minIncrement,
        endsAt: input.endsAt,
      },
    });
    return auction.id;
  });

  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: auctionInclude,
  });
  return toAuctionDto(auction, viewerId, membership.role);
}

export async function placeAuctionBid(
  prisma: PrismaClient,
  viewerId: string,
  auctionId: string,
  amount: number,
) {
  const { activeRun, membership, rules } = await getAuctionContext(prisma, viewerId);
  assertAuctionWindow(rules);
  assertCreditLimit(rules, amount);

  await withSerializableTransaction(prisma, async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.runId !== activeRun.id) {
      throw new AuctionServiceError("Auktion wurde nicht gefunden.", 404);
    }
    if (auction.status !== "OPEN" || auction.endsAt.getTime() <= Date.now()) {
      throw new AuctionServiceError("Diese Auktion nimmt keine Gebote mehr an.", 409);
    }
    if (auction.sellerId === viewerId) {
      throw new AuctionServiceError("Auf die eigene Auktion kann nicht geboten werden.", 409);
    }
    const minimum = auction.currentBid === null
      ? auction.startingBid
      : auction.currentBid + auction.minIncrement;
    if (amount < minimum) {
      throw new AuctionServiceError(`Das nächste Gebot muss mindestens ${minimum} Credits betragen.`, 409);
    }

    const wallet = await getOrCreateWallet(tx, { runId: activeRun.id, userId: viewerId });
    const previousOwnBid = auction.highestBidderId === viewerId
      ? auction.currentBid ?? 0
      : 0;
    const additionalReservation = amount - previousOwnBid;
    const reserved = await tx.creditWallet.updateMany({
      where: {
        id: wallet.id,
        balance: { gte: wallet.reservedBalance + additionalReservation },
        reservedBalance: wallet.reservedBalance,
      },
      data: { reservedBalance: { increment: additionalReservation } },
    });
    if (reserved.count !== 1) {
      throw new AuctionServiceError("Für dieses Gebot sind nicht genügend freie Credits vorhanden.", 409);
    }

    if (auction.highestBidderId && auction.highestBidderId !== viewerId && auction.currentBid) {
      const previousWallet = await getOrCreateWallet(tx, {
        runId: activeRun.id,
        userId: auction.highestBidderId,
      });
      const released = await tx.creditWallet.updateMany({
        where: {
          id: previousWallet.id,
          reservedBalance: { gte: auction.currentBid },
        },
        data: { reservedBalance: { decrement: auction.currentBid } },
      });
      if (released.count !== 1) {
        throw new AuctionServiceError("Die vorherige Gebotsreservierung ist inkonsistent.", 409);
      }
    }

    await tx.auctionBid.create({
      data: { auctionId, bidderId: viewerId, amount },
    });
    const updated = await tx.auction.updateMany({
      where: {
        id: auctionId,
        status: "OPEN",
        currentBid: auction.currentBid,
        highestBidderId: auction.highestBidderId,
      },
      data: { currentBid: amount, highestBidderId: viewerId },
    });
    if (updated.count !== 1) {
      throw new AuctionServiceError("Die Auktion wurde gleichzeitig geändert. Bitte erneut bieten.", 409);
    }
  });

  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: auctionInclude,
  });
  return toAuctionDto(auction, viewerId, membership.role);
}

export async function cancelAuction(
  prisma: PrismaClient,
  viewerId: string,
  auctionId: string,
) {
  const { activeRun, membership } = await getAuctionContext(prisma, viewerId);
  const isOrganizer = membership.role === "OWNER" || membership.role === "ORGANIZER";
  await withSerializableTransaction(prisma, async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { _count: { select: { bids: true } } },
    });
    if (!auction || auction.runId !== activeRun.id) {
      throw new AuctionServiceError("Auktion wurde nicht gefunden.", 404);
    }
    if (auction.status !== "OPEN") {
      throw new AuctionServiceError("Nur offene Auktionen können abgebrochen werden.", 409);
    }
    if (auction.sellerId !== viewerId && !isOrganizer) {
      throw new AuctionServiceError("Diese Auktion darf nicht abgebrochen werden.", 403);
    }
    if (auction._count.bids > 0) {
      throw new AuctionServiceError("Eine Auktion mit Geboten kann nicht abgebrochen werden.", 409);
    }
    await tx.collectionEntry.updateMany({
      where: {
        id: auction.collectionEntryId,
        userId: auction.sellerId,
        runId: activeRun.id,
        lockState: EntryLockState.RESERVED,
      },
      data: { lockState: EntryLockState.AVAILABLE },
    });
    await tx.auction.update({
      where: { id: auction.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });
}

export async function settleAuction(
  prisma: PrismaClient,
  viewerId: string,
  auctionId: string,
) {
  const { activeRun, membership } = await getAuctionContext(prisma, viewerId);
  const isOrganizer = membership.role === "OWNER" || membership.role === "ORGANIZER";

  await withSerializableTransaction(prisma, async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.runId !== activeRun.id) {
      throw new AuctionServiceError("Auktion wurde nicht gefunden.", 404);
    }
    if (auction.status !== "OPEN") {
      throw new AuctionServiceError("Diese Auktion wurde bereits abgeschlossen.", 409);
    }
    if (auction.sellerId !== viewerId && !isOrganizer) {
      throw new AuctionServiceError("Diese Auktion darf nicht abgeschlossen werden.", 403);
    }
    if (auction.endsAt.getTime() > Date.now()) {
      throw new AuctionServiceError("Die Laufzeit der Auktion ist noch nicht beendet.", 409);
    }

    if (!auction.highestBidderId || !auction.currentBid) {
      await tx.collectionEntry.updateMany({
        where: {
          id: auction.collectionEntryId,
          userId: auction.sellerId,
          runId: activeRun.id,
          lockState: EntryLockState.RESERVED,
        },
        data: { lockState: EntryLockState.AVAILABLE },
      });
      await tx.auction.update({
        where: { id: auction.id },
        data: { status: "NO_SALE", settledAt: new Date() },
      });
      return;
    }

    const [buyerWallet, sellerWallet] = await Promise.all([
      getOrCreateWallet(tx, { runId: activeRun.id, userId: auction.highestBidderId }),
      getOrCreateWallet(tx, { runId: activeRun.id, userId: auction.sellerId }),
    ]);
    const debited = await tx.creditWallet.updateMany({
      where: {
        id: buyerWallet.id,
        balance: { gte: auction.currentBid },
        reservedBalance: { gte: auction.currentBid },
      },
      data: {
        balance: { decrement: auction.currentBid },
        reservedBalance: { decrement: auction.currentBid },
      },
    });
    if (debited.count !== 1) {
      throw new AuctionServiceError("Das Siegergebot ist nicht mehr vollständig reserviert.", 409);
    }
    await tx.collectionBinderSlot.updateMany({
      where: { collectionEntryId: auction.collectionEntryId },
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
    const transferred = await tx.collectionEntry.updateMany({
      where: {
        id: auction.collectionEntryId,
        userId: auction.sellerId,
        runId: activeRun.id,
        lockState: EntryLockState.RESERVED,
      },
      data: {
        userId: auction.highestBidderId,
        source: OwnershipSource.TRADE,
        sourceReferenceId: auction.id,
        lockState: EntryLockState.AVAILABLE,
      },
    });
    if (transferred.count !== 1) {
      throw new AuctionServiceError("Die angebotene Kartenkopie ist nicht mehr reserviert.", 409);
    }
    const [buyerAfter, sellerAfter] = await Promise.all([
      tx.creditWallet.findUniqueOrThrow({ where: { id: buyerWallet.id } }),
      tx.creditWallet.update({
        where: { id: sellerWallet.id },
        data: { balance: { increment: auction.currentBid } },
      }),
    ]);
    await tx.creditLedgerEntry.createMany({
      data: [
        {
          runId: activeRun.id,
          walletId: buyerWallet.id,
          userId: auction.highestBidderId,
          amount: -auction.currentBid,
          balanceAfter: buyerAfter.balance,
          source: "TRADE_TRANSFER",
          referenceType: "Auction:WINNING_BID",
          referenceId: auction.id,
          note: "Erfolgreiches Auktionsgebot.",
        },
        {
          runId: activeRun.id,
          walletId: sellerWallet.id,
          userId: auction.sellerId,
          amount: auction.currentBid,
          balanceAfter: sellerAfter.balance,
          source: "TRADE_TRANSFER",
          referenceType: "Auction:SALE",
          referenceId: auction.id,
          note: "Erlös aus einer Kartenauktion.",
        },
      ],
    });
    await tx.auction.update({
      where: { id: auction.id },
      data: { status: "SETTLED", settledAt: new Date() },
    });
  });
}
