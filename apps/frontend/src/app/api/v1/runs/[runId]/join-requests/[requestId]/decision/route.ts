import { NextResponse } from "next/server";
import { decideRunJoinRequestSchema, runJoinRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { decideRunJoinRequest } from "@/lib/run-service";

const paramsSchema = z.object({
  runId: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string; requestId: string }> },
) {
  const { runId, requestId } = paramsSchema.parse(await context.params);
  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/runs/${runId}/join-requests/${requestId}/decision`,
    );
  }
  try {
    requireSameOriginMutation(request, "Beitrittsanträge müssen aus der App entschieden werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = decideRunJoinRequestSchema.parse(await request.json());
    const result = await decideRunJoinRequest(prisma, {
      runId,
      requestId,
      viewerId: session.userId,
      decision: body.decision,
    });
    return NextResponse.json(runJoinRequestSchema.parse(result));
  } catch (error) {
    return toNextErrorResponse(error, "Beitrittsantrag konnte nicht entschieden werden.");
  }
}
