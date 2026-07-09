import { notFound, redirect } from "next/navigation";
import { TradeDetailConsole } from "@/components/trade-detail-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";
import { getTradeDetail } from "@/lib/trade-service";

type RemoteTradeDetailPayload = Parameters<typeof TradeDetailConsole>[0];

async function loadRemoteTradeDetail(tradeId: string) {
  try {
    return await fetchApiServiceJson<RemoteTradeDetailPayload>(
      `/api/v1/trades/${tradeId}/view`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      Number((error as Error & { status?: number }).status) === 404
    ) {
      notFound();
    }

    throw error;
  }
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

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ tradeId: string }>;
}) {
  const { tradeId } = await params;

  if (shouldProxyToApiService()) {
    const pageData = await loadRemoteTradeDetail(tradeId);

    return <TradeDetailConsole {...pageData} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const viewer = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
  });

  if (!viewer) {
    redirect("/login");
  }

  const activeRun = await getActiveRun(prisma, viewer.id);
  const [uniqueOwnedCards, latestBanlist, earliestSet, trade] = await Promise.all([
    prisma.collectionEntry.groupBy({
      by: ["cardId"],
      where: {
        userId: viewer.id,
        runId: activeRun.id,
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
    getTradeDetail(prisma, viewer.id, tradeId).catch(() => null),
  ]);

  if (!trade) {
    notFound();
  }

  const counterpartUserId =
    trade.proposer.userId === viewer.id ? trade.responder.userId : trade.proposer.userId;

  const [viewerAvailableEntries, counterpartAvailableEntries] = trade.allowedActions.includes(
    "counter",
  )
    ? await Promise.all([
        prisma.collectionEntry.findMany({
          where: {
            userId: viewer.id,
            runId: activeRun.id,
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
            runId: activeRun.id,
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

  return (
    <TradeDetailConsole
      viewer={{
        displayName: viewer.displayName,
        duelistId: viewer.duelistId,
      }}
      viewerUserId={viewer.id}
      collectionValue={`${formatNumber(uniqueOwnedCards.length)} Karten`}
      latestBanlistName={latestBanlist?.name ?? "Keine Bannliste"}
      activeEra={getEraLabel(earliestSet?.releaseDate.toISOString() ?? new Date().toISOString())}
      trade={trade}
      viewerAvailableCards={viewerAvailableEntries.map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        rarity: entry.setCard?.rarity ?? null,
        setCode: entry.setCard?.setCode ?? null,
      }))}
      counterpartAvailableCards={counterpartAvailableEntries.map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        rarity: entry.setCard?.rarity ?? null,
        setCode: entry.setCard?.setCode ?? null,
      }))}
    />
  );
}
