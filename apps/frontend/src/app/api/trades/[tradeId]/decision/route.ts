import { NextResponse } from "next/server";
import { tradeDecisionRequestSchema } from "@ygo/contracts";
import { z } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  acceptTradeVersion,
  cancelTrade,
  confirmTradeCompletion,
  rejectTrade,
} from "@/lib/trade-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/trades/${tradeId}/decision`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = tradeDecisionRequestSchema.parse(rawBody);
    const trade =
      body.action === "accept"
        ? await acceptTradeVersion(prisma, session.userId, tradeId)
        : body.action === "reject"
          ? await rejectTrade(prisma, session.userId, tradeId)
          : body.action === "cancel"
            ? await cancelTrade(prisma, session.userId, tradeId)
            : await confirmTradeCompletion(prisma, session.userId, tradeId);

    return NextResponse.json({
      trade,
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
        error: error instanceof Error ? error.message : "Trade konnte nicht aktualisiert werden.",
      },
      { status },
    );
  }
}
