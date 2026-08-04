import { NextResponse } from "next/server";
import {
  campaignPackAccessResponseSchema,
  updateCampaignPackAccessRequestSchema,
} from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import {
  listCampaignPackAccess,
  updateCampaignPackAccess,
} from "@/lib/campaign-pack-access-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/pack-access`);
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload = await listCampaignPackAccess(prisma, {
      runId,
      viewerId: session.userId,
    });
    return NextResponse.json(campaignPackAccessResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Packzugriffe konnten nicht geladen werden.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/pack-access`);
  }
  try {
    requireSameOriginMutation(request, "Packzugriffe müssen aus der App geändert werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const input = updateCampaignPackAccessRequestSchema.parse(await request.json());
    const payload = await updateCampaignPackAccess(prisma, {
      runId,
      viewerId: session.userId,
      input,
    });
    return NextResponse.json(campaignPackAccessResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Packzugriff konnte nicht geändert werden.");
  }
}
