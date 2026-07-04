import { NextResponse } from "next/server";
import { createTradeRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { createTradeOffer, listTradesForViewer } from "@/lib/trade-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/trades");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const trades = await listTradesForViewer(prisma, session.userId);

    return NextResponse.json({
      trades,
    });
  } catch (error) {
    const status =
      error instanceof Error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Trades konnten nicht geladen werden.",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/trades");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = createTradeRequestSchema.parse(rawBody);
    const trade = await createTradeOffer(prisma, session.userId, {
      responderDuelistId: body.responderDuelistId,
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
        error: error instanceof Error ? error.message : "Trade konnte nicht erstellt werden.",
      },
      { status },
    );
  }
}
