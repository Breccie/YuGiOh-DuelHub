import { redirect } from "next/navigation";
import type {
  ActiveRunResponse,
  RunProgressionResponse,
  RunPromosResponse,
  ViewerSession,
} from "@ygo/contracts";
import { PromoCardsConsole } from "@/components/promo-cards-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getCardAssetUrl } from "@/lib/asset-urls";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRunProgression, getRunPromos } from "@/lib/progression-service";
import { getActiveRun } from "@/lib/run-service";

type RecentCollectionCard = {
  id: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  setCode: string | null;
};

async function getRecentCollectionCards(
  prisma: ReturnType<typeof getPrisma>,
  viewerId: string,
  runId: string,
): Promise<RecentCollectionCard[]> {
  const recentCollectionEntries = await prisma.collectionEntry.findMany({
    where: {
      userId: viewerId,
      runId,
    },
    orderBy: {
      acquiredAt: "desc",
    },
    take: 5,
    include: {
      card: {
        select: {
          name: true,
          externalCardId: true,
        },
      },
      setCard: {
        select: {
          rarity: true,
          setCode: true,
        },
      },
    },
  });

  return recentCollectionEntries.map((entry) => ({
    id: entry.id,
    name: entry.card.name,
    imageUrl: getCardAssetUrl(entry.card.externalCardId),
    rarity: entry.setCard?.rarity ?? null,
    setCode: entry.setCard?.setCode ?? null,
  }));
}

async function getOnlinePayload() {
  try {
    const [activeRun, sessionPayload] = await Promise.all([
      fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active"),
      fetchApiServiceJson<{ session: ViewerSession | null }>(
        "/api/v1/auth/session",
      ),
    ]);
    const [promos, progression] = await Promise.all([
      fetchApiServiceJson<RunPromosResponse>(
        `/api/v1/runs/${activeRun.run.id}/promos`,
      ),
      fetchApiServiceJson<RunProgressionResponse>(
        `/api/v1/runs/${activeRun.run.id}/progression`,
      ),
    ]);

    return {
      viewer: {
        displayName: sessionPayload.session?.displayName ?? "Duelist",
      },
      promos,
      progression,
      recentCollectionCards: [],
    };
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function PromoCardsPage() {
  if (shouldProxyToApiService()) {
    return <PromoCardsConsole {...(await getOnlinePayload())} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await getActiveRun(prisma, session.userId);
  const [recentCollectionCards, promos, progression] = await Promise.all([
    getRecentCollectionCards(prisma, session.userId, activeRun.id),
    getRunPromos(prisma, session.userId, activeRun.id),
    getRunProgression(prisma, session.userId, activeRun.id),
  ]);

  return (
    <PromoCardsConsole
      viewer={{ displayName: session.displayName }}
      promos={promos}
      progression={progression}
      recentCollectionCards={recentCollectionCards}
    />
  );
}
