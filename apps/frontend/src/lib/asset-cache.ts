import "server-only";

import { createHash } from "node:crypto";

const CARD_IMAGE_HOST = "images.ygoprodeck.com";
const ALLOWED_REMOTE_HOSTS = new Set([
  "images.ygoprodeck.com",
  "storage.googleapis.com",
  "db.ygoprodeck.com",
  "tcgplayer-cdn.tcgplayer.com",
  "www.yugioh-card.com",
  "static.wikia.nocookie.net",
  "images.ygoprog.com",
]);
const MAX_REMOTE_ASSET_BYTES = 10 * 1024 * 1024;
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

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Asset-URL muss per HTTP oder HTTPS geladen werden.");
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
  memoryCache.set(descriptor.cacheKey, {
    upstreamUrl: descriptor.upstreamUrl,
    body,
    contentType,
    cachedAt: Date.now(),
  });
}

function createMissingCardPlaceholder(cardId: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 448" role="img" aria-label="Missing card art">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#1a1d26"/>
          <stop offset="100%" stop-color="#0b0d12"/>
        </linearGradient>
      </defs>
      <rect width="320" height="448" rx="20" fill="url(#bg)"/>
      <rect x="20" y="20" width="280" height="408" rx="14" fill="none" stroke="#6f7785" stroke-width="3" stroke-dasharray="10 8"/>
      <circle cx="160" cy="164" r="52" fill="#252a35"/>
      <path d="M160 120l17 34 38 5-28 27 7 38-34-18-34 18 7-38-28-27 38-5z" fill="#8993a4"/>
      <text x="160" y="288" text-anchor="middle" fill="#e8edf5" font-family="Arial, sans-serif" font-size="22" font-weight="700">
        No Card Art
      </text>
      <text x="160" y="320" text-anchor="middle" fill="#9aa4b5" font-family="Arial, sans-serif" font-size="14">
        ${cardId}
      </text>
    </svg>
  `.trim();

  return {
    body: Buffer.from(svg, "utf8"),
    contentType: "image/svg+xml; charset=utf-8",
  };
}

async function fetchUpstreamAsset(descriptor: CachedAssetDescriptor) {
  const response = await fetch(descriptor.upstreamUrl, {
    headers: {
      "User-Agent": "Yu-Gi-Oh Duel Hub/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Asset konnte nicht geladen werden (${response.status} ${response.statusText}).`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Upstream-Antwort ist kein Bild.");
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
    contentType,
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
  const descriptor = createCardDescriptor(cardId);

  try {
    return await loadOrFetchCachedAsset(descriptor);
  } catch {
    const placeholder = createMissingCardPlaceholder(cardId.trim());

    writeCachedAsset(descriptor, placeholder.body, placeholder.contentType);

    return {
      body: placeholder.body,
      contentType: placeholder.contentType,
      cacheStatus: "MISS" as const,
      cachedAt: Date.now(),
    };
  }
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
