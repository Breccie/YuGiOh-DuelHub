import type {
  OpenDisplayRequest,
  OpenDisplayResponse,
  OpenPackRequest,
  OpenPackResponse,
  PackDashboardSnapshotDto,
} from "@ygo/contracts";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import {
  applySyncChanges,
  readLocalSyncCache,
  writeLocalSyncCache,
} from "@/lib/sync-cache";

function cachePackOpening(opening: OpenPackResponse["opening"]) {
  const now = new Date().toISOString();
  const cache = readLocalSyncCache();
  const updatedCache = applySyncChanges(
    {
      serverTime: now,
      cursor: now,
      hasMore: false,
      changes: {
        collectionEntries: [],
        decks: [],
        binders: [],
        trades: [],
        tournaments: [],
        packOpenings: [
          {
            id: opening.id,
            setId: opening.set.id,
            openedAt: opening.openedAt,
            addedToCollection: opening.addedToCollection,
          },
        ],
        rewards: [],
      },
    },
    cache,
  );

  writeLocalSyncCache(updatedCache);
}

export const packOpeningClient = {
  getDashboard() {
    return apiGetJson<PackDashboardSnapshotDto>("/api/pack-openings", {
      cache: "no-store",
    });
  },

  async open(input: OpenPackRequest) {
    const payload = await apiPostJson<OpenPackResponse, OpenPackRequest>(
      "/api/pack-openings",
      input,
    );
    cachePackOpening(payload.opening);

    return payload;
  },

  async openDisplay(input: OpenDisplayRequest) {
    const payload = await apiPostJson<OpenDisplayResponse, OpenDisplayRequest>(
      "/api/pack-openings/displays",
      input,
    );

    for (const opening of payload.openings) {
      cachePackOpening(opening);
    }

    return payload;
  },
};
