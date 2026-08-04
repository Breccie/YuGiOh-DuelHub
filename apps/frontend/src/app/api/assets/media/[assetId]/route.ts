import { NextResponse } from "next/server";
import { toNextErrorResponse } from "@/lib/api-error-response";
import { fetchApiService, shouldProxyToApiService, toProxiedNextResponse } from "@/lib/api-service-proxy";
import { getViewerSession } from "@/lib/auth";
import { readMediaAsset } from "@/lib/media-service";
import { getPrisma } from "@/lib/prisma";

type Context = { params: Promise<{ assetId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { assetId } = await context.params;
    if (shouldProxyToApiService()) {
      const response = await fetchApiService(`/api/v1/media/${encodeURIComponent(assetId)}/content`);
      return toProxiedNextResponse(response);
    }
    const prisma = getPrisma();
    const viewer = await getViewerSession(prisma);
    const asset = await readMediaAsset(prisma, assetId, viewer?.userId);
    if (asset.redirectUrl) return NextResponse.redirect(asset.redirectUrl);
    return new NextResponse(asset.bytes, { headers: { "content-type": asset.mimeType, "cache-control": "public, max-age=31536000, immutable" } });
  } catch (error) {
    return toNextErrorResponse(error, "Das Bild konnte nicht geladen werden.");
  }
}
