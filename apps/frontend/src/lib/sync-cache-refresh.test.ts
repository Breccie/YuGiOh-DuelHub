import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncBootstrapResponse, SyncChangesResponse } from "@ygo/contracts";

const syncMocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  getChanges: vi.fn(),
}));

vi.mock("@/lib/sync-client", () => ({
  syncClient: syncMocks,
}));

import { refreshLocalSyncCache } from "@/lib/sync-cache-refresh";

const bootstrap: SyncBootstrapResponse = {
  serverTime: "2026-07-30T08:00:00.000Z",
  cursor: "2026-07-30T08:00:00.000Z",
  viewer: {
    userId: "user-1",
    duelistId: "YUGI-001",
    displayName: "Yugi",
  },
  activeRunId: "run-1",
  catalog: {
    cards: 10,
    sets: 1,
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
    runSetUnlocks: [],
  },
  run: {
    id: "run-1",
  },
  wallet: {
    balance: 1_000,
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

const changes: SyncChangesResponse = {
  serverTime: "2026-07-30T08:00:01.000Z",
  cursor: "2026-07-30T08:00:01.000Z",
  hasMore: false,
  changes: {
    collectionEntries: [],
    decks: [],
    binders: [],
    trades: [],
    tournaments: [],
    packOpenings: [],
    rewards: [],
  },
};

describe("refreshLocalSyncCache", () => {
  beforeEach(() => {
    syncMocks.bootstrap.mockReset();
    syncMocks.getChanges.mockReset();
    syncMocks.bootstrap.mockResolvedValue(bootstrap);
    syncMocks.getChanges.mockResolvedValue(changes);
  });

  it("publishes the bootstrap cache before delta synchronization finishes", async () => {
    let releaseChanges!: (value: SyncChangesResponse) => void;
    syncMocks.getChanges.mockReturnValue(
      new Promise<SyncChangesResponse>((resolve) => {
        releaseChanges = resolve;
      }),
    );
    const stages: string[] = [];

    const refresh = refreshLocalSyncCache({
      onCacheUpdated: (cache, stage) => {
        stages.push(stage);
        if (stage === "bootstrap") {
          expect(cache.bootstrap?.catalog.packSets[0]?.code).toBe("LOB");
        }
      },
    });

    await vi.waitFor(() => {
      expect(stages).toEqual(["bootstrap"]);
    });

    releaseChanges(changes);
    await refresh;

    expect(stages).toEqual(["bootstrap", "changes"]);
  });
});
