import { NextResponse } from "next/server";
import type { RunRewardsResponse } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { listRunRewardGrants } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/rewards`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload: RunRewardsResponse = await listRunRewardGrants(
      prisma,
      session.userId,
      runId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Rewards konnten nicht geladen werden.");
  }
}
