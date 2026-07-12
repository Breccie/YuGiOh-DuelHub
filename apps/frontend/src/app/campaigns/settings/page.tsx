import { redirect } from "next/navigation";
import type { ActiveRunResponse } from "@ygo/contracts";
import { CampaignSettingsConsole } from "@/components/campaign-settings-console";
import { requireActiveCampaign } from "@/lib/active-campaign";
import {
  fetchApiServiceJson,
  shouldProxyToApiService,
} from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";

export default async function CampaignSettingsPage() {
  if (shouldProxyToApiService()) {
    let activeRun: ActiveRunResponse;

    try {
      activeRun = await fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active");
    } catch (error) {
      if ((error as Error & { status?: number }).status === 409) {
        redirect("/campaigns");
      }

      throw error;
    }

    const session = await getOnlineViewerSession();

    return <CampaignSettingsConsole session={session} activeRun={activeRun.run} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await requireActiveCampaign(prisma, session.userId);

  return (
    <CampaignSettingsConsole
      session={session}
      activeRun={{
        id: activeRun.id,
        ownerId: activeRun.ownerId,
        name: activeRun.name,
        inviteCode: activeRun.inviteCode,
        description: activeRun.description ?? null,
        status: activeRun.status,
        historyCursor: activeRun.historyCursor?.toISOString() ?? null,
        defaultPackPrice: activeRun.defaultPackPrice,
        defaultDisplaySize: activeRun.defaultDisplaySize,
        freePacksPerSetUnlock: activeRun.freePacksPerSetUnlock,
        initialSetUnlockCount: activeRun.initialSetUnlockCount,
        setsPerProgressionStep: activeRun.setsPerProgressionStep,
        separatePromoProgression: activeRun.separatePromoProgression,
        tournamentWinnerCredits: activeRun.tournamentWinnerCredits,
        tournamentRunnerUpCredits: activeRun.tournamentRunnerUpCredits,
        tournamentParticipationCredits: activeRun.tournamentParticipationCredits,
        startingCredits: activeRun.startingCredits,
        viewerRole:
          activeRun.memberships.find((membership) => membership.userId === session.userId)
            ?.role ?? "PLAYER",
        memberCount: activeRun._count.memberships,
        createdAt: activeRun.createdAt.toISOString(),
        updatedAt: activeRun.updatedAt.toISOString(),
      }}
    />
  );
}
