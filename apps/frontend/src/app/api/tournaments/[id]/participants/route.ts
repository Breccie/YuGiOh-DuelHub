import { NextResponse } from "next/server";
import { inviteTournamentParticipantRequestSchema } from "@ygo/contracts";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { getPrisma } from "@/lib/prisma";
import { inviteTournamentParticipant } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (shouldProxyToApiService()) {
    const { id } = await context.params;

    return proxyApiRoute(request, `/api/v1/tournaments/${id}/participants`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = inviteTournamentParticipantRequestSchema.parse(rawBody);
    const tournament = await inviteTournamentParticipant(
      prisma,
      session.userId,
      id,
      body.duelistId,
    );

    return NextResponse.json({
      tournament,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Teilnehmer konnte nicht eingeladen werden.");
  }
}
