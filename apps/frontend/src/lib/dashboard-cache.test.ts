import { describe, expect, it } from "vitest";
import {
  readCachedDashboardSummary,
  writeCachedDashboardSummary,
} from "@/lib/dashboard-cache";
import type { HomeDashboardResponse } from "@ygo/contracts";

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

const dashboardPayload: HomeDashboardResponse = {
  viewer: {
    displayName: "Yugi",
  },
  collectionValue: "12 Karten",
  activeRunName: "DM Progression",
  latestBanlistName: "Genesys",
  activeEra: "DM Ära",
  heroStats: [],
  newsItems: [],
  duelRequests: [],
  tradeRequests: [],
  progressCards: [],
};

describe("dashboard cache", () => {
  it("roundtrips dashboard summaries through storage", () => {
    const storage = createStorage();

    writeCachedDashboardSummary(dashboardPayload, storage);

    expect(readCachedDashboardSummary(storage)).toMatchObject({
      payload: dashboardPayload,
    });
  });

  it("ignores missing, unavailable, and invalid cache records", () => {
    const storage = createStorage();

    expect(readCachedDashboardSummary(null)).toBeNull();
    expect(readCachedDashboardSummary(storage)).toBeNull();

    storage.setItem("ygo:dashboard-summary:v1", "{");

    expect(readCachedDashboardSummary(storage)).toBeNull();
  });
});
