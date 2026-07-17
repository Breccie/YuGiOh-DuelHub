import { NextResponse } from "next/server";
import { createCampaignRuleVersionRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import {
  createCampaignRuleVersion,
  listCampaignRuleVersions,
} from "@/lib/campaign-rule-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/rule-versions`);
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await listCampaignRuleVersions(prisma, session.userId, runId));
  } catch (error) {
    return toNextErrorResponse(error, "Regelversionen konnten nicht geladen werden.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/rule-versions`);
  try {
    requireSameOriginMutation(request, "Regelversionen müssen aus der App erstellt werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createCampaignRuleVersionRequestSchema.parse(await request.json());
    return NextResponse.json(await createCampaignRuleVersion(prisma, {
      runId,
      viewerId: session.userId,
      ...body,
    }), { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Regelversion konnte nicht erstellt werden.");
  }
}
