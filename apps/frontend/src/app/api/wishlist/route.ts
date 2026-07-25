import { NextResponse } from "next/server";
import { upsertWishlistItemRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { listWishlistItems, upsertWishlistItem } from "@/lib/wishlist-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) return proxyApiRoute(request, "/api/v1/wishlist");
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json({ items: await listWishlistItems(prisma, session.userId) });
  } catch (error) {
    return toNextErrorResponse(error, "Wunschliste konnte nicht geladen werden.");
  }
}

export async function POST(request: Request) {
  if (shouldProxyToApiService()) return proxyApiRoute(request, "/api/v1/wishlist");
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = upsertWishlistItemRequestSchema.parse(await request.json());
    return NextResponse.json({ items: await upsertWishlistItem(prisma, session.userId, body) });
  } catch (error) {
    return toNextErrorResponse(error, "Wunschliste konnte nicht gespeichert werden.");
  }
}
