import {
  applySyncBootstrap,
  applySyncChanges,
  readLocalSyncCache,
  writeLocalSyncCache,
  type LocalSyncCache,
} from "@/lib/sync-cache";
import { syncClient } from "@/lib/sync-client";

const DEFAULT_MAX_DELTA_PAGES = 3;

function hasCachedEntities(cache: LocalSyncCache) {
  return (
    cache.collectionEntries.length > 0 ||
    cache.decks.length > 0 ||
    cache.binders.length > 0 ||
    cache.trades.length > 0 ||
    cache.tournaments.length > 0 ||
    cache.packOpenings.length > 0 ||
    cache.rewards.length > 0
  );
}

export async function refreshLocalSyncCache(options?: {
  forceFullDelta?: boolean;
  maxDeltaPages?: number;
  shouldContinue?: () => boolean;
}) {
  let cache = readLocalSyncCache();
  const previousCursor = cache.cursor;
  const bootstrap = await syncClient.bootstrap();

  if (options?.shouldContinue && !options.shouldContinue()) {
    return cache;
  }

  cache = applySyncBootstrap(bootstrap, cache);
  writeLocalSyncCache(cache);

  const shouldStartFromBeginning =
    options?.forceFullDelta || !hasCachedEntities(cache);
  let cursor = shouldStartFromBeginning ? null : previousCursor;
  const maxDeltaPages = options?.maxDeltaPages ?? DEFAULT_MAX_DELTA_PAGES;

  for (let page = 0; page < maxDeltaPages; page += 1) {
    const changes = await syncClient.getChanges(cursor);

    if (options?.shouldContinue && !options.shouldContinue()) {
      return cache;
    }

    cache = applySyncChanges(changes, cache);
    writeLocalSyncCache(cache);
    cursor = changes.cursor;

    if (!changes.hasMore) {
      break;
    }
  }

  return cache;
}

export function refreshLocalSyncCacheSoon(options?: {
  forceFullDelta?: boolean;
  maxDeltaPages?: number;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    void refreshLocalSyncCache(options).catch(() => null);
  }, 0);
}
