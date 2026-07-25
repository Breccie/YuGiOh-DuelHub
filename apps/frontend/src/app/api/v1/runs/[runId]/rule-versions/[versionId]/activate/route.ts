import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { activateCampaignRuleVersion } from "@/lib/campaign-rule-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; versionId: string }> },
) {
  const { runId, versionId } = await params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/rule-versions/${versionId}/activate`);
  }
  try {
    requireSameOriginMutation(request, "Regelversionen müssen aus der App aktiviert werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await activateCampaignRuleVersion(prisma, {
      runId,
      versionId,
      viewerId: session.userId,
    }));
  } catch (error) {
    return toNextErrorResponse(error, "Regelversion konnte nicht aktiviert werden.");
  }
}
