import { NextResponse } from "next/server";
import type {
  ActiveRunResponse,
  CampaignLeaderboardResponse,
  TournamentOverviewDto,
  ViewerSession,
  WalletResponse,
} from "@ygo/contracts";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";
import {
  getActiveRun,
  getOrCreateWallet,
  serializeLedgerEntry,
} from "@/lib/run-service";
import {
  getCampaignLeaderboard,
  listTournamentOverviews,
} from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (shouldProxyToApiService()) {
    try {
      const [sessionPayload, tournamentPayload, activeRun, leaderboard] = await Promise.all([
        fetchApiServiceJson<{
          session: ViewerSession | null;
        }>("/api/v1/auth/session"),
        fetchApiServiceJson<{ tournaments: TournamentOverviewDto[] }>(
          "/api/v1/tournaments",
        ),
        fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active"),
        fetchApiServiceJson<CampaignLeaderboardResponse>(
          "/api/v1/tournaments/leaderboard",
        ),
      ]);

      if (!sessionPayload.session) {
        return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
      }

      const walletPayload = await fetchApiServiceJson<WalletResponse>(
        `/api/v1/runs/${activeRun.run.id}/wallet`,
      );

      return NextResponse.json({
        session: sessionPayload.session,
        tournaments: tournamentPayload.tournaments,
        leaderboard,
        currency: {
          balance: walletPayload.wallet.balance,
          tournamentCreditsEarned: walletPayload.recentEntries
            .filter((entry) => entry.source === "TOURNAMENT_REWARD")
            .reduce((total, entry) => total + Math.max(entry.amount, 0), 0),
          packCreditsSpent: walletPayload.recentEntries
            .filter(
              (entry) =>
                entry.source === "PACK_PURCHASE" ||
                entry.source === "DISPLAY_PURCHASE",
            )
            .reduce((total, entry) => total + Math.abs(Math.min(entry.amount, 0)), 0),
          recentEntries: walletPayload.recentEntries.slice(0, 6),
        },
      });
    } catch (error) {
      return toNextErrorResponse(error, "Turnierübersicht konnte nicht geladen werden.");
    }
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const [tournaments, leaderboard, wallet, recentEntries] = await Promise.all([
      listTournamentOverviews(prisma, session.userId),
      getCampaignLeaderboard(prisma, session.userId),
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

    return NextResponse.json({
      session,
      tournaments,
      leaderboard,
      currency: {
        balance: wallet.balance,
        tournamentCreditsEarned: serializedEntries
          .filter((entry) => entry.source === "TOURNAMENT_REWARD")
          .reduce((total, entry) => total + Math.max(entry.amount, 0), 0),
        packCreditsSpent: serializedEntries
          .filter(
            (entry) =>
              entry.source === "PACK_PURCHASE" ||
              entry.source === "DISPLAY_PURCHASE",
          )
          .reduce((total, entry) => total + Math.abs(Math.min(entry.amount, 0)), 0),
        recentEntries: serializedEntries.slice(0, 6),
      },
    });
  } catch (error) {
    return toNextErrorResponse(error, "Turnierübersicht konnte nicht geladen werden.");
  }
}
