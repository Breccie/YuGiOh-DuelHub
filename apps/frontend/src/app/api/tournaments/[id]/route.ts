import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getTournamentDetail } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (shouldProxyToApiService()) {
    const { id } = await context.params;

    return proxyApiRoute(request, `/api/v1/tournaments/${id}`);
  }

  try {
    const { id } = await context.params;
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const tournament = await getTournamentDetail(prisma, session.userId, id);

    return NextResponse.json({
      tournament,
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message.includes("nicht gefunden") ? 404 : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Turnier konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
