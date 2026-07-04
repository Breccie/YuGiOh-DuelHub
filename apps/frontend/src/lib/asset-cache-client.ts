import { apiDeleteJson, apiGetJson } from "@/lib/api-client";

export type AssetCacheSnapshot = {
  cacheDirectory: string;
  totalBytes: number;
  assetCount: number;
  metadataCount: number;
  lastUpdatedAt: number | null;
};

type AssetCacheResponse = {
  cache: AssetCacheSnapshot;
};

export const assetCacheClient = {
  get() {
    return apiGetJson<AssetCacheResponse>("/api/assets/cache", {
      cache: "no-store",
    });
  },

  clear() {
    return apiDeleteJson<AssetCacheResponse>("/api/assets/cache");
  },
};
