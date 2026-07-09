import type { SyncBootstrapResponse, SyncChangesResponse } from "@ygo/contracts";

const SYNC_CACHE_KEY = "ygo:sync-cache:v1";

type SyncEntity = Record<string, unknown> & {
  id?: unknown;
};

export type LocalSyncCache = {
  version: 1;
  updatedAt: string;
  cursor: string | null;
  bootstrap: SyncBootstrapResponse | null;
  collectionEntries: SyncEntity[];
  decks: SyncEntity[];
  binders: SyncEntity[];
  trades: SyncEntity[];
  tournaments: SyncEntity[];
  packOpenings: SyncEntity[];
  rewards: SyncEntity[];
};

function createEmptySyncCache(): LocalSyncCache {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    cursor: null,
    bootstrap: null,
    collectionEntries: [],
    decks: [],
    binders: [],
    trades: [],
    tournaments: [],
    packOpenings: [],
    rewards: [],
  };
}

function canUseStorage(storage: Storage | undefined | null): storage is Storage {
  return Boolean(storage);
}

function toEntityArray(values: unknown[]): SyncEntity[] {
  return values.filter(
    (value): value is SyncEntity =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
}

function mergeById(currentValues: SyncEntity[], incomingValues: unknown[]) {
  const byId = new Map<string, SyncEntity>();
  const anonymousValues: SyncEntity[] = [];

  for (const value of currentValues) {
    if (typeof value.id === "string") {
      byId.set(value.id, value);
    } else {
      anonymousValues.push(value);
    }
  }

  for (const value of toEntityArray(incomingValues)) {
    if (typeof value.id === "string") {
      byId.set(value.id, value);
    } else {
      anonymousValues.push(value);
    }
  }

  return [...anonymousValues, ...byId.values()];
}

export function readLocalSyncCache(
  storage: Storage | undefined | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!canUseStorage(storage)) {
    return createEmptySyncCache();
  }

  try {
    const rawValue = storage.getItem(SYNC_CACHE_KEY);

    if (!rawValue) {
      return createEmptySyncCache();
    }

    const parsed = JSON.parse(rawValue) as Partial<LocalSyncCache>;

    if (parsed.version !== 1) {
      return createEmptySyncCache();
    }

    return {
      ...createEmptySyncCache(),
      ...parsed,
      collectionEntries: toEntityArray(parsed.collectionEntries ?? []),
      decks: toEntityArray(parsed.decks ?? []),
      binders: toEntityArray(parsed.binders ?? []),
      trades: toEntityArray(parsed.trades ?? []),
      tournaments: toEntityArray(parsed.tournaments ?? []),
      packOpenings: toEntityArray(parsed.packOpenings ?? []),
      rewards: toEntityArray(parsed.rewards ?? []),
    };
  } catch {
    return createEmptySyncCache();
  }
}

export function writeLocalSyncCache(
  cache: LocalSyncCache,
  storage: Storage | undefined | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!canUseStorage(storage)) {
    return;
  }

  try {
    storage.setItem(SYNC_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Sync cache is a performance layer; failed writes must not break gameplay.
  }
}

export function applySyncBootstrap(
  bootstrap: SyncBootstrapResponse,
  cache = readLocalSyncCache(),
) {
  return {
    ...cache,
    updatedAt: bootstrap.serverTime,
    cursor: bootstrap.cursor,
    bootstrap,
  } satisfies LocalSyncCache;
}

export function applySyncChanges(
  changes: SyncChangesResponse,
  cache = readLocalSyncCache(),
) {
  return {
    ...cache,
    updatedAt: changes.serverTime,
    cursor: changes.cursor,
    collectionEntries: mergeById(
      cache.collectionEntries,
      changes.changes.collectionEntries,
    ),
    decks: mergeById(cache.decks, changes.changes.decks),
    binders: mergeById(cache.binders, changes.changes.binders),
    trades: mergeById(cache.trades, changes.changes.trades),
    tournaments: mergeById(cache.tournaments, changes.changes.tournaments),
    packOpenings: mergeById(cache.packOpenings, changes.changes.packOpenings),
    rewards: mergeById(cache.rewards, changes.changes.rewards),
  } satisfies LocalSyncCache;
}
