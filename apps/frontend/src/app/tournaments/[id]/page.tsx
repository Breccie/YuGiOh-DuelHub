import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/auth";
import { TournamentDetailConsole } from "@/components/tournament-detail-console";
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
    const [session, payload] = await Promise.all([
      getOnlineViewerSession(),
      fetchApiServiceJson<{ tournament: TournamentDetail }>(
        `/api/v1/tournaments/${id}`,
      ),
    ]);

    return <TournamentDetailConsole session={session} tournament={payload.tournament} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const tournament = await getTournamentDetail(prisma, session.userId, id);

  return <TournamentDetailConsole session={session} tournament={tournament} />;
}
