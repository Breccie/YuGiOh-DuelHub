import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { duplicateDeck } from "@/lib/deck-editor";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      deckId: string;
    }>;
  },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/decks/${deckId}/duplicate`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const deck = await duplicateDeck(prisma, session.userId, deckId);

    return NextResponse.json(
      {
        deck: {
          id: deck.id,
          name: deck.name,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Deck konnte nicht dupliziert werden.",
      },
      { status },
    );
  }
}
