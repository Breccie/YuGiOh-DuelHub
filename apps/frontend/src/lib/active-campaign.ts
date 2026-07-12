import "server-only";

import type { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { getActiveRun, listRuns } from "@/lib/run-service";

export async function requireActiveCampaign(
  prisma: PrismaClient,
  userId: string,
) {
  const runs = await listRuns(prisma, userId);

  if (!runs.activeRunId) {
    redirect("/campaigns");
  }

  return getActiveRun(prisma, userId);
}
