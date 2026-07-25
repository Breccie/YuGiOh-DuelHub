import { NextResponse } from "next/server";
import { updateCustomPackDraftRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { updateCustomPackDraft } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs/versions/${versionId}`);
  try {
    requireSameOriginMutation(request, "Custom Packs müssen aus der App gespeichert werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = updateCustomPackDraftRequestSchema.parse(await request.json());
    return NextResponse.json(await updateCustomPackDraft(prisma, session.userId, runId, versionId, body));
  } catch (error) {
    return toNextErrorResponse(error, "Custom Pack konnte nicht gespeichert werden.");
  }
}
