import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getCollectionSnapshot } from "@/lib/collection-ledger";
import { getCollectionShowcaseSnapshot } from "@/lib/collection-showcase";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    const url = new URL(request.url);
    return proxyApiRoute(request, `/api/v1/collection${url.search}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const kind = url.searchParams.get("kind") ?? undefined;
    const duplicatesOnly = url.searchParams.get("duplicatesOnly") === "true";
    const [collection, showcase, totalCards] = await Promise.all([
      getCollectionSnapshot(
        {
          viewerId: session.userId,
          query,
          kind:
            kind === "MONSTER" || kind === "SPELL" || kind === "TRAP" || kind === "TOKEN"
              ? kind
              : "ALL",
          duplicatesOnly,
        },
        prisma,
      ),
      getCollectionShowcaseSnapshot(prisma, session.userId),
      prisma.card.count(),
    ]);

    return NextResponse.json({
      viewer: collection.viewer,
      binders: showcase.binders,
      presets: showcase.presets,
      totals: collection.totals,
      cards: collection.cards,
      recentEntries: collection.recentEntries,
      totalCards,
    });
  } catch (error) {
    return toNextErrorResponse(error, "Sammlung konnte nicht geladen werden.");
  }
}
