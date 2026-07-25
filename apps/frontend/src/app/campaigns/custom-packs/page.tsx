import { redirect } from "next/navigation";
import type { ActiveRunResponse } from "@ygo/contracts";
import { CustomPackStudio } from "@/components/custom-pack-studio";
import { requireActiveCampaign } from "@/lib/active-campaign";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";

export default async function CustomPacksPage() {
  if (shouldProxyToApiService()) {
    const payload = await fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active").catch(() => null);
    if (!payload) redirect("/campaigns");
    return <CustomPackStudio session={await getOnlineViewerSession()} activeRun={payload.run} />;
  }
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);
  if (!session) redirect("/login");
  const run = await requireActiveCampaign(prisma, session.userId);
  return <CustomPackStudio session={session} activeRun={{
    id: run.id,
    ownerId: run.ownerId,
    name: run.name,
    inviteCode: run.inviteCode,
    description: run.description,
    status: run.status,
    historyCursor: run.historyCursor?.toISOString() ?? null,
    defaultPackPrice: run.defaultPackPrice,
    defaultDisplaySize: run.defaultDisplaySize,
    freePacksPerSetUnlock: run.freePacksPerSetUnlock,
    initialSetUnlockCount: run.initialSetUnlockCount,
    setsPerProgressionStep: run.setsPerProgressionStep,
    separatePromoProgression: run.separatePromoProgression,
    tournamentWinnerCredits: run.tournamentWinnerCredits,
    tournamentRunnerUpCredits: run.tournamentRunnerUpCredits,
    tournamentParticipationCredits: run.tournamentParticipationCredits,
    startingCredits: run.startingCredits,
    viewerRole: run.memberships.find((membership) => membership.userId === session.userId)?.role ?? "PLAYER",
    memberCount: run._count.memberships,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }} />;
}
