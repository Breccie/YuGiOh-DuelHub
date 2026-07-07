import { NextResponse } from "next/server";
import type { GenerateRunProgressionResponse } from "@ygo/contracts";
import { generateRunProgressionRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { generateRunProgression } from "@/lib/progression-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/progression/generate`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Progression-Mutationen muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = generateRunProgressionRequestSchema.parse(await request.json());
    const payload: GenerateRunProgressionResponse = await generateRunProgression(
      prisma,
      session.userId,
      runId,
      body,
    );

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Run-Fortschritt konnte nicht generiert werden.");
  }
}
