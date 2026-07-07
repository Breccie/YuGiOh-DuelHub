import { NextResponse } from "next/server";
import { openDisplayRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { openDisplay } from "@/lib/pack-openings";
import { getPrisma } from "@/lib/prisma";
import { getActiveRun } from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, "/api/v1/packs/displays");
  }

  try {
    requireSameOriginMutation(
      request,
      "Display openings must be requested from the app origin.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const rawBody = await request.json().catch(() => ({}));
    const body = openDisplayRequestSchema.parse(rawBody);
    const activeRun = await getActiveRun(prisma, session.userId);
    const payload = await openDisplay(prisma, {
      viewerId: session.userId,
      runId: activeRun.id,
      setId: body.setId,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toNextErrorResponse(error, "Display konnte nicht geöffnet werden.");
  }
}
