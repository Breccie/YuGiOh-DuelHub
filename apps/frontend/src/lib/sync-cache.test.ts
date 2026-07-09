import { describe, expect, it } from "vitest";
import type { SyncBootstrapResponse, SyncChangesResponse } from "@ygo/contracts";
import {
  applySyncBootstrap,
  applySyncChanges,
  readLocalSyncCache,
  writeLocalSyncCache,
} from "@/lib/sync-cache";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    },
  } satisfies Storage;
}

const bootstrap: SyncBootstrapResponse = {
  serverTime: "2026-07-09T12:00:00.000Z",
  cursor: "2026-07-09T12:00:00.000Z",
  viewer: {
    userId: "user-1",
    duelistId: "YUGI",
    displayName: "Yugi",
  },
  activeRunId: "run-1",
  catalog: {
    cards: 10,
    sets: 2,
    openableSets: 1,
    banlists: 1,
    packSets: [
      {
        id: "set-1",
        code: "LOB",
        name: "Legend of Blue Eyes White Dragon",
        releaseDate: "2002-03-08T00:00:00.000Z",
        productType: "CORE_BOOSTER",
        packSize: 9,
        imageUrl: null,
        cardPoolSize: 126,
      },
    ],
    runSetUnlocks: [
      {
        id: "unlock-1",
        setId: "set-1",
        unlockedAt: "2026-07-09T12:00:00.000Z",
        rewardOnly: false,
        packPrice: 100,
        displaySize: 24,
      },
    ],
  },
  run: {
    id: "run-1",
  },
  wallet: {
    balance: 2400,
  },
  counts: {
    collectionEntries: 0,
    decks: 0,
    binders: 0,
    trades: 0,
    tournaments: 0,
    pendingRewards: 0,
  },
};

function createChanges(cardName: string): SyncChangesResponse {
  return {
    serverTime: "2026-07-09T12:01:00.000Z",
    cursor: "2026-07-09T12:01:00.000Z",
    hasMore: false,
    changes: {
      collectionEntries: [
        {
          id: "entry-1",
          cardName,
        },
      ],
      decks: [],
      binders: [],
      trades: [],
      tournaments: [],
      packOpenings: [
        {
          id: "opening-1",
          setId: "set-1",
        },
      ],
      rewards: [],
    },
  };
}

describe("sync cache", () => {
  it("stores bootstrap data and persists it", () => {
    const storage = createStorage();
    const cache = applySyncBootstrap(bootstrap);

    writeLocalSyncCache(cache, storage);

    expect(readLocalSyncCache(storage)).toMatchObject({
      cursor: bootstrap.cursor,
      bootstrap: {
        activeRunId: "run-1",
        catalog: {
          packSets: expect.arrayContaining([
            expect.objectContaining({
              code: "LOB",
            }),
          ]),
        },
      },
    });
  });

  it("merges change records by id", () => {
    const first = applySyncChanges(createChanges("Dark Magician"));
    const second = applySyncChanges(createChanges("Blue-Eyes White Dragon"), first);

    expect(second.collectionEntries).toHaveLength(1);
    expect(second.collectionEntries[0]).toMatchObject({
      id: "entry-1",
      cardName: "Blue-Eyes White Dragon",
    });
    expect(second.packOpenings).toHaveLength(1);
  });

  it("falls back to an empty cache when storage is unavailable or invalid", () => {
    const storage = createStorage();
    storage.setItem("ygo:sync-cache:v1", "{");

    expect(readLocalSyncCache(null).version).toBe(1);
    expect(readLocalSyncCache(storage).collectionEntries).toEqual([]);
  });
});
