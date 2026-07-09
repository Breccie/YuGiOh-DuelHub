import { NextResponse } from "next/server";
import { syncBootstrapResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { buildSyncBootstrapPayload } from "@/lib/sync-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/sync/bootstrap");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const payload = await buildSyncBootstrapPayload(prisma, session.userId);

    return NextResponse.json(syncBootstrapResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Sync-Bootstrap konnte nicht geladen werden.");
  }
}
