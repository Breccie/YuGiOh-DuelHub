import { getCachedRemoteAsset } from "@/lib/asset-cache";
import {
  createPackAssetPlaceholder,
  normalizePackImageAsset,
  resolvePackAsset,
} from "@/lib/pack-assets";

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

async function loadPackMatchAsset(match: Awaited<ReturnType<typeof resolvePackAsset>>) {
  if (!match) {
    return null;
  }

  try {
    return {
      asset: await getCachedRemoteAsset(match.imageUrl),
      source: match.source,
    };
  } catch (error) {
    if (!match.fallbackImageUrl || match.fallbackImageUrl === match.imageUrl) {
      throw error;
    }

    return {
      asset: await getCachedRemoteAsset(match.fallbackImageUrl),
      source: `${match.source}-FALLBACK`,
    };
  }
}

function createPackAssetHeaders(
  match: NonNullable<Awaited<ReturnType<typeof resolvePackAsset>>>,
  resolved: NonNullable<Awaited<ReturnType<typeof loadPackMatchAsset>>>,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "X-Asset-Cache": resolved.asset.cacheStatus,
    "X-Pack-Asset": resolved.source,
    "X-Pack-Asset-Provider": match.groupName,
  };

  if (match.assetStatus) {
    headers["X-Pack-Asset-Status"] = match.assetStatus;
  }

  if (match.qualityScore !== undefined) {
    headers["X-Pack-Asset-Quality"] = String(match.qualityScore);
  }

  if (match.licenseNote) {
    headers["X-Pack-Asset-License"] = match.licenseNote;
  }

  if (match.productId) {
    headers["X-TCGplayer-Product-ID"] = String(match.productId);
  }

  if (match.groupId) {
    headers["X-TCGplayer-Group-ID"] = String(match.groupId);
  }

  if (match.width && match.height) {
    headers["X-Pack-Asset-Size"] = `${match.width}x${match.height}`;
  }

  return headers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const { searchParams } = new URL(request.url);
  const setName = searchParams.get("name");

  try {
    const match = await resolvePackAsset(code, setName);

    if (match?.assetStatus === "APPROVED_REAL" && match.imageUrl.startsWith("/")) {
      return new Response(null, {
        status: 307,
        headers: {
          Location: new URL(match.imageUrl, request.url).toString(),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "X-Pack-Asset": match.source,
          "X-Pack-Asset-Status": match.assetStatus,
          "X-Pack-Asset-Render": "STATIC_REDIRECT",
        },
      });
    }

    const resolved = await loadPackMatchAsset(match);

    if (!match || !resolved) {
      const placeholder = createPackAssetPlaceholder(code, setName);

      return createImageResponse(placeholder, "image/svg+xml; charset=utf-8", {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Pack-Asset": "FALLBACK",
      });
    }

    const headers = createPackAssetHeaders(match, resolved);

    if (
      match.assetStatus === "NEEDS_NORMALIZE" ||
      match.assetStatus === "NEEDS_GENERATION"
    ) {
      const normalizedAsset = await normalizePackImageAsset(resolved.asset);

      return createImageResponse(normalizedAsset, "image/png", {
        ...headers,
        "X-Pack-Asset-Render": "NORMALIZED",
      });
    }

    return createImageResponse(resolved.asset.body, resolved.asset.contentType, {
      ...headers,
      "X-Pack-Asset-Render": "RAW",
    });
  } catch (error) {
    const placeholder = createPackAssetPlaceholder(code, setName);

    return createImageResponse(placeholder, "image/svg+xml; charset=utf-8", {
      "Cache-Control": "no-store",
      "X-Pack-Asset": "ERROR",
      "X-Pack-Asset-Error":
        error instanceof Error ? error.message : "Pack-Asset konnte nicht geladen werden.",
    });
  }
}
