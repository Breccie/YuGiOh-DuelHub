import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getTradeDetail } from "@/lib/trade-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/trades/${tradeId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const trade = await getTradeDetail(prisma, session.userId, tradeId);

    return NextResponse.json({
      trade,
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message.includes("nicht gefunden")
        ? 404
        : error instanceof Error && "status" in error
          ? Number((error as { status: number }).status)
          : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Trade konnte nicht geladen werden.",
      },
      { status },
    );
  }
}
