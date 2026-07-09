import { NextResponse } from "next/server";
import { getEraLabel } from "@/lib/trade-view-data";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE").format(value);
}

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/trades/create-view");
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

    const activeRun = await getActiveRun(prisma, viewer.id);
    const [uniqueOwnedCards, latestBanlist, earliestSet, availableEntries, acceptedFriends] =
      await Promise.all([
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
      friendship.requesterId === viewer.id
        ? friendship.addresseeId
        : friendship.requesterId,
    );
    const partnerEntries = await prisma.collectionEntry.findMany({
      where: {
        userId: {
          in: partnerIds,
        },
        runId: activeRun.id,
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
        friendship.requesterId === viewer.id
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

    return NextResponse.json({
      viewer: {
        displayName: viewer.displayName,
        duelistId: viewer.duelistId,
      },
      collectionValue: `${formatNumber(uniqueOwnedCards.length)} Karten`,
      latestBanlistName: latestBanlist?.name ?? "Keine Bannliste",
      activeEra: getEraLabel(
        earliestSet?.releaseDate.toISOString() ?? new Date().toISOString(),
      ),
      availableCards: availableEntries.map((entry) => ({
        id: entry.id,
        name: entry.card.name,
        rarity: entry.setCard?.rarity ?? null,
        setCode: entry.setCard?.setCode ?? null,
      })),
      partners,
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
            : "Trade-Erstellung konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
