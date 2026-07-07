import { NextResponse } from "next/server";
import type { RewardGrantDto, RunRewardsResponse } from "@ygo/contracts";
import { createRewardGrantRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { createRunRewardGrant, listRunRewardGrants } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/rewards`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload: RunRewardsResponse = await listRunRewardGrants(
      prisma,
      session.userId,
      runId,
    );

    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "Rewards konnten nicht geladen werden.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/rewards`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Reward-Mutationen muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createRewardGrantRequestSchema.parse(await request.json());
    const payload = await createRunRewardGrant(prisma, {
      organizerId: session.userId,
      runId,
      recipientDuelistId: body.recipientDuelistId,
      amountCredits: body.amountCredits,
      packSetId: body.packSetId,
      packQuantity: body.packQuantity,
      reason: body.reason,
    });

    return NextResponse.json(payload.reward satisfies RewardGrantDto, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Reward konnte nicht vergeben werden.");
  }
}
