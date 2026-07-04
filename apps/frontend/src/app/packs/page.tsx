import { redirect } from "next/navigation";
import type { PackSelectionResponse } from "@ygo/contracts";
import { PackSelectionConsole } from "@/components/pack-selection-console";
import { fetchApiServiceJson, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { buildPackSelectionPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

async function getOnlinePackSelectionPayload() {
  try {
    return await fetchApiServiceJson<PackSelectionResponse>("/api/v1/packs");
  } catch (error) {
    if ((error as Error & { status?: number }).status === 401) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function PacksPage() {
  if (shouldProxyToApiService()) {
    return <PackSelectionConsole {...(await getOnlinePackSelectionPayload())} />;
  }

  const prisma = getPrisma();
  const session = await getViewerSession(prisma);

  if (!session) {
    redirect("/login");
  }

  const activeRun = await getActiveRun(prisma, session.userId);

  return (
    <PackSelectionConsole
      {...(await buildPackSelectionPayload(prisma, session.userId, activeRun.id))}
    />
  );
}
