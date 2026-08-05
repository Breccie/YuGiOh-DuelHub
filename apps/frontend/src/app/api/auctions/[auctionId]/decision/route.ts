import { NextResponse } from "next/server";
import { auctionDecisionRequestSchema } from "@ygo/contracts";
import { ZodError } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { cancelAuction, settleAuction } from "@/lib/auction-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ auctionId: string }> },
) {
  const { auctionId } = await context.params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/auctions/${auctionId}/decision`);
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = auctionDecisionRequestSchema.parse(
      await request.json().catch(() => ({})),
    );
    if (body.action === "cancel") {
      await cancelAuction(prisma, session.userId, auctionId);
    } else {
      await settleAuction(prisma, session.userId, auctionId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ZodError
      ? 400
      : error instanceof Error && "status" in error
        ? Number((error as Error & { status: number }).status)
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auktion konnte nicht aktualisiert werden." },
      { status },
    );
  }
}
