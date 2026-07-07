import { redirect } from "next/navigation";
import type { RunListResponse } from "@ygo/contracts";
import { CampaignSelect } from "@/components/campaigns/campaign-select";
import { DuelConsoleScaffold } from "@/components/duel-console-scaffold";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listRuns } from "@/lib/run-service";

async function getOnlineRunsPayload() {
  try {
    return await fetchApiServiceJson<RunListResponse>("/api/v1/runs");
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function CampaignsPage() {
  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const payload = shouldProxyToApiService()
    ? await getOnlineRunsPayload()
    : await listRuns(prisma, session.userId);
  const activeRun =
    payload.runs.find((run) => run.id === payload.activeRunId) ??
    payload.runs[0] ??
    null;

  return (
    <DuelConsoleScaffold
      activePath="/campaigns"
      viewer={{
        displayName: session.displayName,
        duelistId: session.duelistId,
      }}
      metrics={[
        {
          icon: "shield",
          label: "Kampagne",
          value: activeRun?.name ?? "Keine",
        },
        {
          icon: "users",
          label: "Mitgliedschaften",
          value: `${payload.runs.length}`,
        },
        {
          icon: "hourglass",
          label: "Status",
          value: activeRun?.status ?? "Offen",
        },
      ]}
    >
      <CampaignSelect
        activeRunId={payload.activeRunId}
        runs={payload.runs}
      />
    </DuelConsoleScaffold>
  );
}
