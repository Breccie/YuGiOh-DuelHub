import { redirect } from "next/navigation";
import type { TournamentOverviewDto } from "@ygo/contracts";
import { getViewerSession } from "@/lib/auth";
import { TournamentsConsole } from "@/components/tournaments-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";
import { listTournamentOverviews } from "@/lib/tournament-service";

export default async function TournamentsPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const tournaments = shouldProxyToApiService()
    ? (
        await fetchApiServiceJson<{ tournaments: TournamentOverviewDto[] }>(
          "/api/v1/tournaments",
        )
      ).tournaments
    : await listTournamentOverviews(prisma);

  return <TournamentsConsole session={session} tournaments={tournaments} />;
}
