import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAssetCache,
  getAssetCacheStats,
  getCachedRemoteAsset,
} from "./asset-cache";

describe("asset cache limits", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearAssetCache();
  });

  it("evicts old entries instead of growing without bounds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    for (let index = 0; index < 257; index += 1) {
      await getCachedRemoteAsset(
        `https://images.ygoprodeck.com/cache-test-${index}.png`,
      );
    }

    const stats = await getAssetCacheStats();

    expect(stats.assetCount).toBe(256);
    expect(stats.totalBytes).toBe(256);
  });
});
