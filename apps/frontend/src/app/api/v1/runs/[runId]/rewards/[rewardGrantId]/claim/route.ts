import { NextResponse } from "next/server";
import type { ClaimRewardResponse } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { claimRewardPack } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; rewardGrantId: string }> },
) {
  const { runId, rewardGrantId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/runs/${runId}/rewards/${rewardGrantId}/claim`,
    );
  }

  try {
    if (!isSameOriginMutation(request)) {
      return NextResponse.json(
        { error: "Reward-Claims muessen aus der App heraus kommen." },
        { status: 403 },
      );
    }

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload: ClaimRewardResponse = await claimRewardPack(prisma, {
      viewerId: session.userId,
      runId,
      rewardGrantId,
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Reward konnte nicht geclaimt werden.");
  }
}
