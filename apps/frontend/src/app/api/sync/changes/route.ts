import { NextResponse } from "next/server";
import { syncChangesResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { buildSyncChangesPayload } from "@/lib/sync-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    const url = new URL(request.url);
    return proxyApiRoute(
      request,
      `/api/v1/sync/changes${url.search}`,
    );
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const url = new URL(request.url);
    const payload = await buildSyncChangesPayload(
      prisma,
      session.userId,
      url.searchParams.get("cursor"),
    );

    return NextResponse.json(syncChangesResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Sync-Delta konnte nicht geladen werden.");
  }
}
