import { NextResponse } from "next/server";
import { placeAuctionBidRequestSchema } from "@ygo/contracts";
import { ZodError } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { placeAuctionBid } from "@/lib/auction-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ auctionId: string }> },
) {
  const { auctionId } = await context.params;
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/auctions/${auctionId}/bids`);
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = placeAuctionBidRequestSchema.parse(
      await request.json().catch(() => ({})),
    );
    const auction = await placeAuctionBid(
      prisma,
      session.userId,
      auctionId,
      body.amount,
    );
    return NextResponse.json({ auction });
  } catch (error) {
    const status = error instanceof ZodError
      ? 400
      : error instanceof Error && "status" in error
        ? Number((error as Error & { status: number }).status)
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gebot konnte nicht abgegeben werden." },
      { status },
    );
  }
}
