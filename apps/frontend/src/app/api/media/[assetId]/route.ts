import { NextResponse } from "next/server";
import { updateMediaAssetRequestSchema } from "@ygo/contracts";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { proxyApiRoute, shouldProxyToApiService } from "@/lib/api-service-proxy";
import { requireSameOriginMutation } from "@/lib/api-route-security";
import { requireViewerSession } from "@/lib/auth";
import { deleteMediaAsset, renameMediaAsset } from "@/lib/media-service";
import { getPrisma } from "@/lib/prisma";

type Context = { params: Promise<{ assetId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { assetId } = await context.params;
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/media/${encodeURIComponent(assetId)}`);
  try {
    requireSameOriginMutation(request, "Änderungen müssen aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    const body = updateMediaAssetRequestSchema.parse(await request.json());
    return NextResponse.json(await renameMediaAsset(prisma, session.userId, assetId, body.name));
  } catch (error) {
    return toNextErrorResponse(error, "Das Design konnte nicht umbenannt werden.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const { assetId } = await context.params;
  if (shouldProxyToApiService()) return proxyApiRoute(request, `/api/v1/media/${encodeURIComponent(assetId)}`);
  try {
    requireSameOriginMutation(request, "Änderungen müssen aus der App erfolgen.");
    const prisma = getPrisma();
    const session = await requireViewerSession(prisma);
    return NextResponse.json(await deleteMediaAsset(prisma, session.userId, assetId));
  } catch (error) {
    return toNextErrorResponse(error, "Das Design konnte nicht gelöscht werden.");
  }
}
