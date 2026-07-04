import { redirect } from "next/navigation";
import { TradeCreateConsole } from "@/components/trade-create-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type RemoteTradeCreatePayload = Parameters<typeof TradeCreateConsole>[0];

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

export default async function TradeCreatePage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  if (shouldProxyToApiService()) {
    const pageData = await fetchApiServiceJson<RemoteTradeCreatePayload>(
      "/api/v1/trades/create-view",
    );

    return <TradeCreateConsole {...pageData} />;
  }

  const viewer = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
  });

  if (!viewer) {
    redirect("/login");
  }

  const [uniqueOwnedCards, latestBanlist, earliestSet, availableEntries, acceptedFriends] =
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
      prisma.collectionEntry.findMany({
        where: {
          userId: viewer.id,
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
          OR: [{ requesterId: viewer.id }, { addresseeId: viewer.id }],
        },
        include: {
          requester: true,
          addressee: true,
        },
      }),
    ]);

  const partnerIds = acceptedFriends.map((friendship) =>
    friendship.requesterId === viewer.id ? friendship.addresseeId : friendship.requesterId,
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
    const partner = friendship.requesterId === viewer.id ? friendship.addressee : friendship.requester;

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

  return (
    <TradeCreateConsole
      viewer={{
        displayName: viewer.displayName,
        duelistId: viewer.duelistId,
      }}
      collectionValue={`${formatNumber(uniqueOwnedCards.length)} Karten`}
      latestBanlistName={latestBanlist?.name ?? "Keine Bannliste"}
      activeEra={getEraLabel(earliestSet?.releaseDate.toISOString() ?? new Date().toISOString())}
      availableCards={availableEntries.map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        rarity: entry.setCard?.rarity ?? null,
        setCode: entry.setCard?.setCode ?? null,
      }))}
      partners={partners}
    />
  );
}
