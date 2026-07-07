import { NextResponse } from "next/server";
import type { PlayGroupRunDto } from "@ygo/contracts";
import { updateRunSettingsRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { updateRunSettings } from "@/lib/run-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(request, `/api/v1/runs/${runId}/settings`);
  }

  try {
    requireSameOriginMutation(
      request,
      "Kampagnen-Einstellungen muessen aus der App heraus kommen.",
    );

    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = updateRunSettingsRequestSchema.parse(await request.json());
    const run = await updateRunSettings(prisma, {
      runId,
      viewerId: session.userId,
      defaultPackPrice: body.defaultPackPrice,
      defaultDisplaySize: body.defaultDisplaySize,
      freePacksPerSetUnlock: body.freePacksPerSetUnlock,
    });

    return NextResponse.json(run satisfies PlayGroupRunDto);
  } catch (error) {
    return toNextErrorResponse(error, "Kampagnen-Einstellungen konnten nicht gespeichert werden.");
  }
}
