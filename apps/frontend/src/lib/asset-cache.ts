import "server-only";

import { createHash } from "node:crypto";

const CARD_IMAGE_HOST = "images.ygoprodeck.com";
const ALLOWED_REMOTE_HOSTS = new Set([
  "images.ygoprodeck.com",
  "storage.googleapis.com",
  "db.ygoprodeck.com",
  "tcgplayer-cdn.tcgplayer.com",
  "www.yugioh-card.com",
  "img.yugioh-card.com",
  "static.wikia.nocookie.net",
  "images.ygoprog.com",
]);
const MAX_REMOTE_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_MEMORY_CACHE_BYTES = 128 * 1024 * 1024;
const MAX_MEMORY_CACHE_ENTRIES = 256;
const UPSTREAM_FETCH_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_REDIRECTS = 3;
const ALLOWED_RASTER_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CARD_ASSET_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const REMOTE_ASSET_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MEMORY_CACHE_DIRECTORY = "memory://desktop-asset-cache";

type CachedAssetDescriptor = {
  cacheKey: string;
  upstreamUrl: string;
  ttlMs: number;
};

type CachedAssetResult = {
  body: Buffer;
  contentType: string;
  cacheStatus: "HIT" | "MISS" | "STALE";
  cachedAt: number;
};

type MemoryAssetRecord = {
  upstreamUrl: string;
  body: Buffer;
  contentType: string;
  cachedAt: number;
};

export type AssetCacheStats = {
  cacheDirectory: string;
  totalBytes: number;
  assetCount: number;
  metadataCount: number;
  lastUpdatedAt: number | null;
};

const inFlightRequests = new Map<string, Promise<CachedAssetResult>>();
const memoryCache = new Map<string, MemoryAssetRecord>();

function buildCardUpstreamUrl(cardId: string) {
  return `https://${CARD_IMAGE_HOST}/images/cards/${encodeURIComponent(cardId)}.jpg`;
}

function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function getNormalizedRemoteUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Ungültige Asset-URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Asset-URL muss per HTTPS geladen werden.");
  }

  if (!ALLOWED_REMOTE_HOSTS.has(url.hostname)) {
    throw new Error(`Remote-Host \`${url.hostname}\` ist nicht freigeschaltet.`);
  }

  return url.toString();
}

function createCardDescriptor(cardId: string): CachedAssetDescriptor {
  const normalized = cardId.trim();

  if (!/^[0-9A-Za-z_-]+$/.test(normalized)) {
    throw new Error("Ungültige Karten-ID.");
  }

  return {
    cacheKey: `card:${normalized}`,
    upstreamUrl: buildCardUpstreamUrl(normalized),
    ttlMs: CARD_ASSET_TTL_MS,
  };
}

function createRemoteDescriptor(rawUrl: string): CachedAssetDescriptor {
  const normalizedUrl = getNormalizedRemoteUrl(rawUrl);

  return {
    cacheKey: `remote:${sha1(normalizedUrl)}`,
    upstreamUrl: normalizedUrl,
    ttlMs: REMOTE_ASSET_TTL_MS,
  };
}

function readCachedAsset(descriptor: CachedAssetDescriptor) {
  const record = memoryCache.get(descriptor.cacheKey);

  if (!record) {
    return null;
  }

  return {
    ...record,
    isFresh: Date.now() - record.cachedAt <= descriptor.ttlMs,
  };
}

function writeCachedAsset(
  descriptor: CachedAssetDescriptor,
  body: Buffer,
  contentType: string,
) {
  const existingRecord = memoryCache.get(descriptor.cacheKey);
  let totalBytes = body.byteLength;

  for (const [cacheKey, record] of memoryCache) {
    if (cacheKey !== descriptor.cacheKey) {
      totalBytes += record.body.byteLength;
    }
  }

  const oldestRecords = [...memoryCache.entries()]
    .filter(([cacheKey]) => cacheKey !== descriptor.cacheKey)
    .sort(([, left], [, right]) => left.cachedAt - right.cachedAt);

  while (
    oldestRecords.length > 0 &&
    (totalBytes > MAX_MEMORY_CACHE_BYTES ||
      memoryCache.size - (existingRecord ? 1 : 0) + 1 > MAX_MEMORY_CACHE_ENTRIES)
  ) {
    const [cacheKey, record] = oldestRecords.shift()!;
    memoryCache.delete(cacheKey);
    totalBytes -= record.body.byteLength;
  }

  memoryCache.set(descriptor.cacheKey, {
    upstreamUrl: descriptor.upstreamUrl,
    body,
    contentType,
    cachedAt: Date.now(),
  });
}

async function fetchUpstreamAsset(descriptor: CachedAssetDescriptor) {
  let upstreamUrl = descriptor.upstreamUrl;
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount <= MAX_UPSTREAM_REDIRECTS; redirectCount += 1) {
    response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Yu-Gi-Oh Duel Hub/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new Error("Asset-Weiterleitung enthält kein Ziel.");
    }

    if (redirectCount >= MAX_UPSTREAM_REDIRECTS) {
      throw new Error("Asset enthält zu viele Weiterleitungen.");
    }

    upstreamUrl = getNormalizedRemoteUrl(new URL(location, upstreamUrl).toString());
  }

  if (!response) {
    throw new Error("Asset konnte nicht geladen werden.");
  }

  if (!response.ok) {
    throw new Error(
      `Asset konnte nicht geladen werden (${response.status} ${response.statusText}).`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const normalizedContentType = contentType.split(";", 1)[0]!.trim().toLowerCase();

  if (!ALLOWED_RASTER_CONTENT_TYPES.has(normalizedContentType)) {
    throw new Error("Upstream-Antwort ist kein erlaubtes Rasterbild.");
  }

  const contentLength = response.headers.get("content-length");

  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);

    if (Number.isFinite(parsedLength) && parsedLength > MAX_REMOTE_ASSET_BYTES) {
      throw new Error("Asset überschreitet die erlaubte Größe.");
    }
  }

  const body = Buffer.from(await response.arrayBuffer());

  if (body.byteLength > MAX_REMOTE_ASSET_BYTES) {
    throw new Error("Asset überschreitet die erlaubte Größe.");
  }

  return {
    body,
    contentType: normalizedContentType,
  };
}

async function loadOrFetchCachedAsset(descriptor: CachedAssetDescriptor) {
  const cached = readCachedAsset(descriptor);

  if (cached?.isFresh) {
    return {
      body: cached.body,
      contentType: cached.contentType,
      cacheStatus: "HIT" as const,
      cachedAt: cached.cachedAt,
    };
  }

  const existingRequest = inFlightRequests.get(descriptor.cacheKey);

  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise = (async () => {
    try {
      const upstream = await fetchUpstreamAsset(descriptor);
      writeCachedAsset(descriptor, upstream.body, upstream.contentType);

      return {
        body: upstream.body,
        contentType: upstream.contentType,
        cacheStatus: cached ? ("STALE" as const) : ("MISS" as const),
        cachedAt: Date.now(),
      };
    } catch (error) {
      if (cached) {
        return {
          body: cached.body,
          contentType: cached.contentType,
          cacheStatus: "STALE" as const,
          cachedAt: cached.cachedAt,
        };
      }

      throw error;
    } finally {
      inFlightRequests.delete(descriptor.cacheKey);
    }
  })();

  inFlightRequests.set(descriptor.cacheKey, requestPromise);

  return requestPromise;
}

export async function getCachedCardAsset(cardId: string) {
  return loadOrFetchCachedAsset(createCardDescriptor(cardId));
}

export async function getCachedRemoteAsset(url: string) {
  return loadOrFetchCachedAsset(createRemoteDescriptor(url));
}

export async function getAssetCacheStats(): Promise<AssetCacheStats> {
  let totalBytes = 0;
  let lastUpdatedAt: number | null = null;

  for (const record of memoryCache.values()) {
    totalBytes += record.body.byteLength;
    lastUpdatedAt =
      lastUpdatedAt === null
        ? record.cachedAt
        : Math.max(lastUpdatedAt, record.cachedAt);
  }

  return {
    cacheDirectory: MEMORY_CACHE_DIRECTORY,
    totalBytes,
    assetCount: memoryCache.size,
    metadataCount: memoryCache.size,
    lastUpdatedAt,
  };
}

export async function clearAssetCache() {
  memoryCache.clear();
  inFlightRequests.clear();

  return getAssetCacheStats();
}
