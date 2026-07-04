import { NextResponse } from "next/server";
import {
  removeDeckCardRequestSchema,
  upsertDeckCardRequestSchema,
} from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { removeDeckCard, upsertDeckCard } from "@/lib/deck-editor";
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
    return proxyApiRoute(request, `/api/v1/decks/${deckId}/cards`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = upsertDeckCardRequestSchema.parse(rawBody);
    const deckCard = await upsertDeckCard(prisma, session.userId, deckId, body);

    return NextResponse.json({
      deckCard: {
        id: deckCard.id,
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
          error instanceof Error
            ? error.message
            : "Deckkarte konnte nicht gespeichert werden.",
      },
      { status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      deckId: string;
    }>;
  },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/decks/${deckId}/cards`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = removeDeckCardRequestSchema.parse(rawBody);
    await removeDeckCard(prisma, session.userId, deckId, body);

    return NextResponse.json({
      ok: true,
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
            : "Deckkarte konnte nicht entfernt werden.",
      },
      { status },
    );
  }
}
