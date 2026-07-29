import { NextResponse } from "next/server";
import { moveDeckCardRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { moveDeckCard } from "@/lib/deck-editor";
import { getDeckLegalitySnapshot } from "@/lib/deck-legality";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/decks/${deckId}/cards/move`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = moveDeckCardRequestSchema.parse(
      await request.json().catch(() => ({})),
    );
    const deckCard = await moveDeckCard(
      prisma,
      session.userId,
      deckId,
      body,
    );
    const snapshot = await getDeckLegalitySnapshot({
      viewerId: session.userId,
      deckId,
    });

    return NextResponse.json({
      deckCard: { id: deckCard.id },
      activeDeck: snapshot.activeDeck,
    });
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
          error instanceof Error
            ? error.message
            : "Karte konnte nicht verschoben werden.",
      },
      { status },
    );
  }
}
