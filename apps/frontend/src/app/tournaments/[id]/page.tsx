import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/auth";
import { TournamentDetailConsole } from "@/components/tournament-detail-console";
import { requireActiveCampaign } from "@/lib/active-campaign";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";
import {
  getTournamentDetail,
  type TournamentDetail,
} from "@/lib/tournament-service";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (shouldProxyToApiService()) {
    const session = await getOnlineViewerSession();
    let payload: { tournament: TournamentDetail };

    try {
      payload = await fetchApiServiceJson<{ tournament: TournamentDetail }>(
        `/api/v1/tournaments/${id}`,
      );
    } catch (error) {
      if ((error as Error & { status?: number }).status === 409) {
        redirect("/campaigns");
      }

      throw error;
    }

    return <TournamentDetailConsole session={session} tournament={payload.tournament} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  await requireActiveCampaign(prisma, session.userId);

  const tournament = await getTournamentDetail(prisma, session.userId, id);

  return <TournamentDetailConsole session={session} tournament={tournament} />;
}
