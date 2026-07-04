import { getCachedRemoteAsset } from "@/lib/asset-cache";
import {
  createDisplayAssetPlaceholder,
  resolveDisplayAsset,
} from "@/lib/display-assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createImageResponse(
  body: Buffer,
  contentType: string,
  headers: Record<string, string>,
) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      ...headers,
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const { searchParams } = new URL(request.url);
  const setName = searchParams.get("name");

  try {
    const match = await resolveDisplayAsset(code, setName);

    if (!match) {
      const placeholder = createDisplayAssetPlaceholder(code, setName);

      return createImageResponse(placeholder, "image/svg+xml; charset=utf-8", {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Display-Asset": "FALLBACK",
      });
    }

    const asset = await getCachedRemoteAsset(match.imageUrl);

    return createImageResponse(asset.body, asset.contentType, {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Asset-Cache": asset.cacheStatus,
      "X-Display-Asset": "TCGCSV",
      "X-TCGplayer-Group-ID": String(match.groupId),
      "X-TCGplayer-Product-ID": String(match.productId),
    });
  } catch (error) {
    const placeholder = createDisplayAssetPlaceholder(code, setName);

    return createImageResponse(placeholder, "image/svg+xml; charset=utf-8", {
      "Cache-Control": "no-store",
      "X-Display-Asset": "ERROR",
      "X-Display-Asset-Error":
        error instanceof Error ? error.message : "Display-Asset konnte nicht geladen werden.",
    });
  }
}
