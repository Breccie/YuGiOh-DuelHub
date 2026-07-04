import { NextResponse } from "next/server";
import { createTradeVersionRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createTradeCounterOffer } from "@/lib/trade-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/trades/${tradeId}/versions`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createTradeVersionRequestSchema.parse(rawBody);
    const trade = await createTradeCounterOffer(prisma, session.userId, tradeId, {
      note: body.note ?? null,
      offeredEntryIds: body.offeredEntryIds,
      requestedEntryIds: body.requestedEntryIds,
    });

    return NextResponse.json(
      {
        trade,
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
          error instanceof Error
            ? error.message
            : "Gegenangebot konnte nicht erstellt werden.",
      },
      { status },
    );
  }
}
