import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listPendingTradeApprovals } from "@/lib/trade-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/trades/approvals");
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json({
      approvals: await listPendingTradeApprovals(prisma, session.userId),
    });
  } catch (error) {
    const status = error instanceof Error && "status" in error
      ? Number((error as { status: number }).status)
      : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trade-Freigaben konnten nicht geladen werden." },
      { status },
    );
  }
}
