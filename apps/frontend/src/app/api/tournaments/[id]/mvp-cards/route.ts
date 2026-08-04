import { NextResponse } from "next/server";
import { updateTournamentMvpCardsRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { updateTournamentMvpCards } from "@/lib/tournament-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/tournaments/${id}/mvp-cards`);
  }
  try {
    requireSameOriginMutation(request, "MVP-Karten müssen aus der App geändert werden.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const input = updateTournamentMvpCardsRequestSchema.parse(await request.json());
    const payload = await updateTournamentMvpCards(prisma, {
      viewerId: session.userId,
      tournamentId: id,
      input,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toNextErrorResponse(error, "MVP-Karten konnten nicht gespeichert werden.");
  }
}
