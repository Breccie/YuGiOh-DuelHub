import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/auth";
import { TournamentDetailConsole } from "@/components/tournament-detail-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
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
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const tournament = shouldProxyToApiService()
    ? (
        await fetchApiServiceJson<{ tournament: TournamentDetail }>(
      `/api/v1/tournaments/${id}`,
    )
  ).tournament
    : await getTournamentDetail(prisma, session.userId, id);

  return <TournamentDetailConsole session={session} tournament={tournament} />;
}
