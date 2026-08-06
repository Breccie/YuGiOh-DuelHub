import { NextResponse } from "next/server";
import { packContentsResponseSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireViewerSession } from "@/lib/auth";
import { buildPackContentsPayload } from "@/lib/pack-contents";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ setId: string }> },
) {
  const { setId } = await context.params;

  if (shouldProxyToApiService()) {
    return proxyApiRoute(
      request,
      `/api/v1/packs/${encodeURIComponent(setId)}/contents`,
    );
  }

  try {
    const prisma = getPrisma();
    await requireViewerSession(prisma);
    const payload = await buildPackContentsPayload(prisma, setId);

    if (!payload) {
      return NextResponse.json(
        { error: "Dieses Pack existiert nicht." },
        { status: 404 },
      );
    }

    return NextResponse.json(packContentsResponseSchema.parse(payload));
  } catch (error) {
    return toNextErrorResponse(error, "Packinhalt konnte nicht geladen werden.");
  }
}
