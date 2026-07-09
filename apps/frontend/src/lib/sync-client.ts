import type {
  DashboardSummaryResponse,
  PackSelectionResponse,
  SyncBootstrapResponse,
  SyncChangesResponse,
} from "@ygo/contracts";
import type {
  CachedCollectionPagePayload,
  CachedDeckOverviewPayload,
} from "@/lib/sync-cache-projections";
import { apiGetJson } from "@/lib/api-client";

export const syncClient = {
  getDashboardSummary() {
    return apiGetJson<DashboardSummaryResponse>("/api/dashboard/summary", {
      cache: "no-store",
    });
  },

  getPackSelection() {
    return apiGetJson<PackSelectionResponse>("/api/packs", {
      cache: "no-store",
    });
  },

  getCollection(search?: string) {
    return apiGetJson<CachedCollectionPagePayload>(
      `/api/collection${search ?? ""}`,
      {
        cache: "no-store",
      },
    );
  },

  getDeckOverview(search?: string) {
    return apiGetJson<CachedDeckOverviewPayload>(`/api/decks${search ?? ""}`, {
      cache: "no-store",
    });
  },

  bootstrap() {
    return apiGetJson<SyncBootstrapResponse>("/api/sync/bootstrap", {
      cache: "no-store",
    });
  },

  getChanges(cursor?: string | null) {
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";

    return apiGetJson<SyncChangesResponse>(`/api/sync/changes${params}`, {
      cache: "no-store",
    });
  },
};
