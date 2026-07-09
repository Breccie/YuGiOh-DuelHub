import { NextResponse } from "next/server";
import { createDuelRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import {
  createDuelRequest,
  listDuelRequests,
} from "@/lib/duel-service";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/duels");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const [duels, decks] = await Promise.all([
      listDuelRequests(prisma, session.userId, activeRun.id),
      prisma.deck.findMany({
        where: {
          userId: session.userId,
          runId: activeRun.id,
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return NextResponse.json({
      duels,
      decks,
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Duellanfragen konnten nicht geladen werden.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/duels");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createDuelRequestSchema.parse(rawBody);
    const duel = await createDuelRequest(prisma, session.userId, body);

    return NextResponse.json(
      {
        duel,
      },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error instanceof z.ZodError
        ? 400
        : error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Duellanfrage konnte nicht erstellt werden.",
      },
      { status },
    );
  }
}
