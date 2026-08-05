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
import { serializeRun } from "@/lib/run-service";

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
      activeRun={serializeRun(activeRun, session.userId)}
    />
  );
}
