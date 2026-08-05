import { getCachedCardAsset } from "@/lib/asset-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createFallbackResponse(request: Request, reason: "FALLBACK" | "ERROR") {
  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL("/app-assets/fallback-card.webp", request.url).toString(),
      "Cache-Control":
        reason === "FALLBACK"
          ? "public, max-age=3600, stale-while-revalidate=86400"
          : "no-store",
      "X-Asset-Cache": reason,
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId } = await context.params;
    const asset = await getCachedCardAsset(cardId);

    return new Response(new Uint8Array(asset.body), {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.body.byteLength),
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
        "X-Asset-Cache": asset.cacheStatus,
      },
    });
  } catch {
    return createFallbackResponse(request, "FALLBACK");
  }
}
