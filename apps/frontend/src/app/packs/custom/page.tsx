import { redirect } from "next/navigation";
import type { ActiveRunResponse } from "@ygo/contracts";
import { CustomPackSelectionConsole } from "@/components/custom-pack-selection-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireActiveCampaign } from "@/lib/active-campaign";
import { getViewerSession } from "@/lib/auth";
import { getOnlineViewerSession } from "@/lib/online-session";
import { getPrisma } from "@/lib/prisma";
import { listCustomPacks } from "@/lib/custom-pack-service";

export const dynamic = "force-dynamic";

export default async function CustomPacksPage() {
  if (shouldProxyToApiService()) {
    const active = await fetchApiServiceJson<ActiveRunResponse>("/api/v1/runs/active").catch(() => null);
    if (!active) redirect("/campaigns");
    const [session, packs] = await Promise.all([
      getOnlineViewerSession(),
      fetchApiServiceJson<Awaited<ReturnType<typeof listCustomPacks>>>(
        `/api/v1/runs/${encodeURIComponent(active.run.id)}/custom-packs`,
      ),
    ]);
    return <CustomPackSelectionConsole session={session} activeRun={active.run} packs={JSON.parse(JSON.stringify(packs)) as import("@/lib/custom-pack-client").CustomPackRecord[]} />;
  }
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);
  if (!session) redirect("/login");
  const run = await requireActiveCampaign(prisma, session.userId);
  const role = run.memberships.find((membership) => membership.userId === session.userId)?.role ?? "PLAYER";
  const activeRun = { ...run, viewerRole: role, memberCount: run._count.memberships, historyCursor: run.historyCursor?.toISOString() ?? null, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() };
  return <CustomPackSelectionConsole session={session} activeRun={activeRun} packs={JSON.parse(JSON.stringify(await listCustomPacks(prisma, session.userId, run.id))) as import("@/lib/custom-pack-client").CustomPackRecord[]} />;
}
