import { NextResponse } from "next/server";
import { recordTournamentMatchResultRequestSchema } from "@ygo/contracts";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";
import { recordTournamentMatchResult } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { matchId } = await context.params;

    return proxyApiRoute(request, `/api/v1/tournaments/matches/${matchId}`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Matchergebnisse muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { matchId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = recordTournamentMatchResultRequestSchema.parse(rawBody);
    const tournament = await recordTournamentMatchResult(
      prisma,
      session.userId,
      matchId,
      body,
    );

    return NextResponse.json({
      tournament,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Matchergebnis konnte nicht gespeichert werden.");
  }
}
