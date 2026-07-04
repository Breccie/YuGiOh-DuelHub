import { NextResponse } from "next/server";
import { updateCollectionPresetRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { updateCollectionPreset } from "@/lib/collection-showcase";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  if (shouldProxyToApiService()) {
    const { presetId } = await context.params;

    return proxyApiRoute(request, `/api/v1/collection/presets/${presetId}`);
  }

  try {
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const { presetId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const body = updateCollectionPresetRequestSchema.parse(rawBody);
    const preset = await updateCollectionPreset(prisma, session.userId, presetId, body);

    return NextResponse.json({ preset });
  } catch (error) {
    return toNextErrorResponse(error, "Preset konnte nicht aktualisiert werden.");
  }
}
