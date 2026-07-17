import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { publishCustomPackVersion } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs/versions/${versionId}/publish`);
  try {
    requireSameOriginMutation(request, "Custom Packs müssen aus der App veröffentlicht werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await publishCustomPackVersion(prisma, session.userId, runId, versionId));
  } catch (error) {
    return toNextErrorResponse(error, "Custom Pack konnte nicht veröffentlicht werden.");
  }
}
