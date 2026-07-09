import { NextResponse } from "next/server";
import { packSelectionResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { buildPackSelectionPayload } from "@/lib/packs-data";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/packs");
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const activeRun = await getActiveRun(prisma, session.userId);
    const payload = await buildPackSelectionPayload(
      prisma,
      session.userId,
      activeRun.id,
    );

    return NextResponse.json(packSelectionResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Pack-Auswahl konnte nicht geladen werden.");
  }
}
