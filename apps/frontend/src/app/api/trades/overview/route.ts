import { NextResponse } from "next/server";
import { getEraLabel, formatTradeState } from "@/lib/trade-view-data";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listTradesForViewer } from "@/lib/trade-service";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

function toTradeEntry(trade: Awaited<ReturnType<typeof listTradesForViewer>>[number]) {
  return {
    id: trade.id,
    partnerName: trade.partner.displayName,
    partnerRank: "Tauschpartner",
    partnerDuelistId: trade.partner.duelistId,
    threadState: trade.threadState,
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
  };
}

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/trades/overview");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const viewer = await prisma.user.findUnique({
      where: {
        id: session.userId,
      },
    });

    if (!viewer) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const [uniqueOwnedCards, latestBanlist, earliestSet, trades, friendships] =
      await Promise.all([
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
        listTradesForViewer(prisma, viewer.id),
        prisma.friendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [{ requesterId: viewer.id }, { addresseeId: viewer.id }],
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
        ["awaitingYourResponse", "waitingForYourConfirmation"].includes(
          trade.threadState,
        ),
      )
      .map((trade) => ({
        ...toTradeEntry(trade),
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
      .map(toTradeEntry);
    const historyTrades = trades.map(toTradeEntry);
    const partnerCards = friendships.slice(0, 5).map((friendship) => {
      const partner =
        friendship.requesterId === viewer.id
          ? friendship.addressee
          : friendship.requester;

      return {
        id: partner.id,
        duelistId: partner.duelistId,
        name: partner.displayName,
        era: partner.favoriteEra ?? "Offen",
        openTradeCount: trades.filter((trade) => trade.partner.userId === partner.id)
          .length,
      };
    });

    return NextResponse.json({
      viewer: {
        displayName: viewer.displayName,
      },
      collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
      latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
      activeEra: getEraLabel(
        earliestSet?.releaseDate.toISOString() ?? new Date().toISOString(),
      ),
      incomingTrades,
      outgoingTrades,
      historyTrades,
      partnerCards,
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Trade-Übersicht konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
