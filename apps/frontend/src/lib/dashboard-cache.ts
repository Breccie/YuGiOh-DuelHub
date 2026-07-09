import type { HomeDashboardResponse } from "@ygo/contracts";

const DASHBOARD_SUMMARY_CACHE_KEY = "ygo:dashboard-summary:v1";

type DashboardCacheRecord = {
  savedAt: string;
  payload: HomeDashboardResponse;
};

function canUseStorage(storage: Storage | undefined | null): storage is Storage {
  return Boolean(storage);
}

export function readCachedDashboardSummary(
  storage: Storage | undefined | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!canUseStorage(storage)) {
    return null;
  }

  try {
    const rawValue = storage.getItem(DASHBOARD_SUMMARY_CACHE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<DashboardCacheRecord>;

    if (!parsed.payload || typeof parsed.savedAt !== "string") {
      return null;
    }

    return parsed as DashboardCacheRecord;
  } catch {
    return null;
  }
}

export function writeCachedDashboardSummary(
  payload: HomeDashboardResponse,
  storage: Storage | undefined | null =
    typeof window === "undefined" ? null : window.localStorage,
) {
  if (!canUseStorage(storage)) {
    return;
  }

  try {
    storage.setItem(
      DASHBOARD_SUMMARY_CACHE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      } satisfies DashboardCacheRecord),
    );
  } catch {
    // Cache writes are best-effort; dashboard freshness must not block the app.
  }
}
