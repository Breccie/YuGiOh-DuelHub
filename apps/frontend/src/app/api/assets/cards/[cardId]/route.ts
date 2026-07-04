import { NextResponse } from "next/server";
import { getCachedCardAsset } from "@/lib/asset-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kartenbild konnte nicht geladen werden.",
      },
      { status: 400 },
    );
  }
}
