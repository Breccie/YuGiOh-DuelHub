import { NextResponse } from "next/server";
import type { ApplyRunProgressionResponse } from "@ygo/contracts";
import { applyRunProgressionRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { applyProgressionCheckpoint } from "@/lib/progression-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; checkpointId: string }> },
) {
  const { runId, checkpointId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/runs/${runId}/progression/${checkpointId}/apply`,
    );
  }

  try {
    requireSameOriginMutation(
      request,
      "Progression-Mutationen muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = applyRunProgressionRequestSchema.parse(
      await request.json().catch(() => ({})),
    );
    const payload: ApplyRunProgressionResponse = await applyProgressionCheckpoint(
      prisma,
      session.userId,
      runId,
      checkpointId,
      {
        force: body.force,
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Run-Fortschritt konnte nicht angewendet werden.");
  }
}
