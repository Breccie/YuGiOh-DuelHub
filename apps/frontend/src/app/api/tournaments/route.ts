import { NextResponse } from "next/server";
import { createTournamentRequestSchema } from "@ygo/contracts";
import { requireViewerSession } from "@/lib/auth";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { getPrisma } from "@/lib/prisma";
import {
  createTournament,
  listTournamentOverviews,
} from "@/lib/tournament-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/tournaments");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const tournaments = await listTournamentOverviews(prisma, session.userId);

    return NextResponse.json({
      tournaments,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Turniere konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/tournaments");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createTournamentRequestSchema.parse(rawBody);

    const tournament = await createTournament(prisma, session.userId, body);

    return NextResponse.json(
      {
        tournament,
      },
      { status: 201 },
    );
  } catch (error) {
    return toNextErrorResponse(error, "Turnier konnte nicht erstellt werden.");
  }
}
