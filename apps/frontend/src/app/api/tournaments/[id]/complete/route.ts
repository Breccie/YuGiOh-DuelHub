import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { completeTournament } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/tournaments/${id}/complete`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Turnierabschluss muss aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const tournament = await completeTournament(prisma, session.userId, id);

    return NextResponse.json({ tournament });
  } catch (error) {
    return toNextErrorResponse(error, "Turnier konnte nicht abgeschlossen werden.");
  }
}
