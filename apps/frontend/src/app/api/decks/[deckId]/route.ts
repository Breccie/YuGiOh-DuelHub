import { NextResponse } from "next/server";
import { updateDeckRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { deleteDeck, updateDeckMetadata } from "@/lib/deck-editor";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      deckId: string;
    }>;
  },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/decks/${deckId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = updateDeckRequestSchema.parse(rawBody);
    const deck = await updateDeckMetadata(prisma, session.userId, deckId, body);

    return NextResponse.json({
      deck: {
        id: deck.id,
        name: deck.name,
      },
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
          error instanceof Error ? error.message : "Deck konnte nicht aktualisiert werden.",
      },
      { status },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      deckId: string;
    }>;
  },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(_request, `/api/v1/decks/${deckId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    await deleteDeck(prisma, session.userId, deckId);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Deck konnte nicht gelöscht werden.",
      },
      { status },
    );
  }
}
