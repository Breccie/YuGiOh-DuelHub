import { NextResponse } from "next/server";
import type { RunProgressionResponse } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getRunProgression } from "@/lib/progression-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/progression`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload: RunProgressionResponse = await getRunProgression(
      prisma,
      session.userId,
      runId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Run-Fortschritt konnte nicht geladen werden.");
  }
}
