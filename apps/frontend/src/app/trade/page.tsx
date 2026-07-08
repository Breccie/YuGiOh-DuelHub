import { redirect } from "next/navigation";
import { TradeConsole } from "@/components/trade-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listTradesForViewer } from "@/lib/trade-service";

type RemoteTradeOverviewPayload = Parameters<typeof TradeConsole>[0];

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

function formatTradeState(value: string) {
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

export default async function TradePage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  if (shouldProxyToApiService()) {
    const pageData = await fetchApiServiceJson<RemoteTradeOverviewPayload>(
      "/api/v1/trades/overview",
    );

    return <TradeConsole {...pageData} />;
  }

  const viewer = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
  });

  if (!viewer) {
    redirect("/login");
  }

  const [uniqueOwnedCards, latestBanlist, earliestSet, trades, friendships] = await Promise.all([
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
      ["awaitingYourResponse", "waitingForYourConfirmation"].includes(trade.threadState),
    )
    .map((trade) => {
      return {
        ...toTradeEntry(trade),
        offered: trade.receivingPreview.map((name, index) => ({
          id: `${trade.id}-receive-${index}`,
          name,
        })),
        wanted: trade.givingPreview.map((name, index) => ({
          id: `${trade.id}-give-${index}`,
          name,
        })),
      };
    });

  const outgoingTrades = trades
    .filter((trade) =>
      ["waitingForTheirResponse", "waitingForTheirConfirmation"].includes(trade.threadState),
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
      openTradeCount: trades.filter((trade) => trade.partner.userId === partner.id).length,
    };
  });

  return (
    <TradeConsole
      viewer={{
        displayName: viewer.displayName,
      }}
      collectionValue={`${formatNumber(uniqueOwnedCards.length)} Karten`}
      latestBanlistName={latestBanlist?.name ?? "Keine Bannliste"}
      activeEra={getEraLabel(earliestSet?.releaseDate.toISOString() ?? new Date().toISOString())}
      incomingTrades={incomingTrades}
      outgoingTrades={outgoingTrades}
      historyTrades={historyTrades}
      partnerCards={partnerCards}
    />
  );
}
