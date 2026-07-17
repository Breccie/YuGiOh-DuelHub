import { NextResponse } from "next/server";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { removeWishlistItem } from "@/lib/wishlist-service";

export async function DELETE(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await context.params;
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/wishlist/${itemId}`);
  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    await removeWishlistItem(prisma, session.userId, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wunschlisteneintrag konnte nicht entfernt werden." }, { status: 500 });
  }
}
