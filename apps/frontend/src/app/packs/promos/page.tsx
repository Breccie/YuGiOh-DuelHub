import { redirect } from "next/navigation";
import type {
  ActiveRunResponse,
  PackSelectionResponse,
  RunProgressionResponse,
  RunPromosResponse,
} from "@ygo/contracts";
import { PromoCardsConsole } from "@/components/promo-cards-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildPackSelectionPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";
import { getRunProgression, getRunPromos } from "@/lib/progression-service";
import { getActiveRun } from "@/lib/run-service";

async function getOnlinePayload() {
  try {
    const activeRun = await fetchApiServiceJson<ActiveRunResponse>(
      "/api/v1/runs/active",
    );
    const [packSelection, promos, progression] = await Promise.all([
      fetchApiServiceJson<PackSelectionResponse>("/api/v1/packs"),
      fetchApiServiceJson<RunPromosResponse>(
        `/api/v1/runs/${activeRun.run.id}/promos`,
      ),
      fetchApiServiceJson<RunProgressionResponse>(
        `/api/v1/runs/${activeRun.run.id}/progression`,
      ),
    ]);

    return {
      viewer: {
        displayName: packSelection.viewer.displayName,
      },
      promos,
      progression,
      recentCollectionCards: packSelection.recentCollectionCards,
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
  const [packSelection, promos, progression] = await Promise.all([
    buildPackSelectionPayload(prisma, session.userId, activeRun.id),
    getRunPromos(prisma, session.userId, activeRun.id),
    getRunProgression(prisma, session.userId, activeRun.id),
  ]);

  return (
    <PromoCardsConsole
      viewer={{ displayName: session.displayName }}
      promos={promos}
      progression={progression}
      recentCollectionCards={packSelection.recentCollectionCards}
    />
  );
}
