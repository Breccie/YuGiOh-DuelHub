import { NextResponse } from "next/server";
import { getCachedRemoteAsset } from "@/lib/asset-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        {
          error: "Es wurde keine Remote-URL übergeben.",
        },
        { status: 400 },
      );
    }

    const asset = await getCachedRemoteAsset(url);

    return new Response(new Uint8Array(asset.body), {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.body.byteLength),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Asset-Cache": asset.cacheStatus,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Remote-Asset konnte nicht geladen werden.",
      },
      { status: 400 },
    );
  }
}
