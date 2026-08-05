import { NextResponse } from "next/server";
import { createAuctionRequestSchema } from "@ygo/contracts";
import { ZodError } from "zod";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { createAuction, getAuctionOverview } from "@/lib/auction-service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof ZodError
    ? 400
    : error instanceof Error && "status" in error
      ? Number((error as Error & { status: number }).status)
      : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/auctions");
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await getAuctionOverview(prisma, session.userId));
  } catch (error) {
    return errorResponse(error, "Auktionen konnten nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/auctions");
  }
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = createAuctionRequestSchema.parse(
      await request.json().catch(() => ({})),
    );
    const auction = await createAuction(prisma, session.userId, {
      ...body,
      endsAt: new Date(body.endsAt),
    });
    return NextResponse.json({ auction }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Auktion konnte nicht erstellt werden.");
  }
}
