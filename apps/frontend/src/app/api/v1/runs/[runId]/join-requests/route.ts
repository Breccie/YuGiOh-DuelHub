import { NextResponse } from "next/server";
import { runJoinRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listRunJoinRequests } from "@/lib/run-service";

const paramsSchema = z.object({ runId: z.string().trim().min(1) });

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = paramsSchema.parse(await context.params);
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/join-requests`);
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const requests = await listRunJoinRequests(prisma, {
      runId,
      viewerId: session.userId,
    });
    return NextResponse.json(z.array(runJoinRequestSchema).parse(requests));
  } catch (error) {
    return toNextErrorResponse(error, "Beitrittsanträge konnten nicht geladen werden.");
  }
}
