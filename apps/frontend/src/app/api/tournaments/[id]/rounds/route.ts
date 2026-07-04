import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createSwissRound } from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (shouldProxyToApiService()) {
    const { id } = await context.params;

    return proxyApiRoute(request, `/api/v1/tournaments/${id}/rounds`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { id } = await context.params;
    const tournament = await createSwissRound(prisma, session.userId, id);

    return NextResponse.json({
      tournament,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Swiss-Runde konnte nicht erzeugt werden.",
      },
      { status: 500 },
    );
  }
}
