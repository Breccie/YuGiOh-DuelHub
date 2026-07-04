import { NextResponse } from "next/server";
import { deckExportRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { createDeckExport } from "@/lib/deck-export";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/decks/${deckId}/export`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = deckExportRequestSchema.parse(rawBody);
    const result = await createDeckExport(prisma, session.userId, deckId, body);

    return NextResponse.json({
      export: result,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Deck konnte nicht exportiert werden.",
      },
      { status },
    );
  }
}
