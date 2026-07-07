import { redirect } from "next/navigation";
import type {
  ActiveRunResponse,
  TournamentOverviewDto,
  WalletResponse,
} from "@ygo/contracts";
import { getViewerSession } from "@/lib/auth";
import { TournamentsConsole } from "@/components/tournaments-console";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";
import {
  getActiveRun,
  getOrCreateWallet,
  serializeLedgerEntry,
} from "@/lib/run-service";
import { listTournamentOverviews } from "@/lib/tournament-service";

export default async function TournamentsPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  if (shouldProxyToApiService()) {
    const [tournamentPayload, activeRun] = await Promise.all([
      fetchApiServiceJson<{ tournaments: TournamentOverviewDto[] }>(
        "/api/v1/tournaments",
      ),
      fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active"),
    ]);
    const walletPayload = await fetchApiServiceJson<WalletResponse>(
      `/api/v1/runs/${activeRun.run.id}/wallet`,
    );

    return (
      <TournamentsConsole
        session={session}
        tournaments={tournamentPayload.tournaments}
        currency={{
          balance: walletPayload.wallet.balance,
          tournamentCreditsEarned: walletPayload.recentEntries
            .filter((entry) => entry.source === "TOURNAMENT_REWARD")
            .reduce((total, entry) => total + Math.max(entry.amount, 0), 0),
          packCreditsSpent: walletPayload.recentEntries
            .filter((entry) => entry.source === "PACK_PURCHASE" || entry.source === "DISPLAY_PURCHASE")
            .reduce((total, entry) => total + Math.abs(Math.min(entry.amount, 0)), 0),
          recentEntries: walletPayload.recentEntries.slice(0, 6),
        }}
      />
    );
  }

  const activeRun = await getActiveRun(prisma, session.userId);
  const [tournaments, wallet, recentEntries] = await Promise.all([
    listTournamentOverviews(prisma, session.userId),
    getOrCreateWallet(prisma, {
      runId: activeRun.id,
      userId: session.userId,
    }),
    prisma.creditLedgerEntry.findMany({
      where: {
        runId: activeRun.id,
        userId: session.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
  ]);
  const serializedEntries = recentEntries.map(serializeLedgerEntry);

  return (
    <TournamentsConsole
      session={session}
      tournaments={tournaments}
      currency={{
        balance: wallet.balance,
        tournamentCreditsEarned: serializedEntries
          .filter((entry) => entry.source === "TOURNAMENT_REWARD")
          .reduce((total, entry) => total + Math.max(entry.amount, 0), 0),
        packCreditsSpent: serializedEntries
          .filter((entry) => entry.source === "PACK_PURCHASE" || entry.source === "DISPLAY_PURCHASE")
          .reduce((total, entry) => total + Math.abs(Math.min(entry.amount, 0)), 0),
        recentEntries: serializedEntries.slice(0, 6),
      }}
    />
  );
}
