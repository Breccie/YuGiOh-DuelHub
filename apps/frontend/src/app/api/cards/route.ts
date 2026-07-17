import { NextResponse } from "next/server";
import { cardCatalogQuerySchema } from "@ygo/contracts";
import { getCardCatalog } from "@/lib/card-catalog";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    const url = new URL(request.url);
    return proxyApiRoute(request, `/api/v1/cards${url.search}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const url = new URL(request.url);
    const query = cardCatalogQuerySchema.parse(Object.fromEntries(url.searchParams));
    return NextResponse.json(await getCardCatalog(prisma, session.userId, query));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kartenkatalog konnte nicht geladen werden." },
      { status: 500 },
    );
  }
}
