import { NextResponse } from "next/server";
import { simulateCustomPackRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { simulateCustomPackVersion } from "@/lib/custom-pack-service";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim() ?? "";
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/runs/${runId}/custom-packs/versions/${versionId}/simulate`);
  try {
    requireSameOriginMutation(request, "Simulationen müssen aus der App gestartet werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = simulateCustomPackRequestSchema.parse(await request.json());
    return NextResponse.json(await simulateCustomPackVersion(prisma, session.userId, runId, versionId, body));
  } catch (error) {
    return toNextErrorResponse(error, "Custom Pack konnte nicht simuliert werden.");
  }
}
