import { redirect } from "next/navigation";
import type { ActiveRunResponse } from "@ygo/contracts";
import { CustomPackStudio } from "@/components/custom-pack-studio";
import { requireActiveCampaign } from "@/lib/active-campaign";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";
import { serializeRun } from "@/lib/run-service";

export default async function CustomPackEditorPage() {
  if (shouldProxyToApiService()) {
    const payload = await fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active").catch(() => null);
    if (!payload) redirect("/campaigns");
    if (payload.run.viewerRole !== "OWNER" && payload.run.viewerRole !== "ORGANIZER") redirect("/packs/custom");
    return <CustomPackStudio session={await getOnlineViewerSession()} activeRun={payload.run} />;
  }
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);
  if (!session) redirect("/login");
  const run = await requireActiveCampaign(prisma, session.userId);
  const role = run.memberships.find((membership) => membership.userId === session.userId)?.role ?? "PLAYER";
  if (role !== "OWNER" && role !== "ORGANIZER") redirect("/packs/custom");
  return <CustomPackStudio session={session} activeRun={serializeRun(run, session.userId)} />;
}
