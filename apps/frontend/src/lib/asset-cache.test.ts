import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAssetCache,
  getAssetCacheStats,
  getCachedRemoteAsset,
} from "./asset-cache";
import { GET as getRemoteAsset } from "@/app/api/assets/remote/route";

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

  it("rejects SVG and other non-raster upstream content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" />", {
          headers: { "content-type": "image/svg+xml" },
        }),
      ),
    );

    await expect(
      getCachedRemoteAsset("https://storage.googleapis.com/example/unsafe.svg"),
    ).rejects.toThrow(/Rasterbild/i);
  });

  it("rejects redirects to hosts outside the allowlist", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: {
          location: "http://127.0.0.1/private.png",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getCachedRemoteAsset("https://images.ygoprodeck.com/redirect.png"),
    ).rejects.toThrow(/HTTPS|freigeschaltet/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves allowed raster assets with sandboxing and sniffing protection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png; charset=binary" },
        }),
      ),
    );

    const response = await getRemoteAsset(
      new Request(
        "http://localhost/api/assets/remote?url=https%3A%2F%2Fimages.ygoprodeck.com%2Fsafe.png",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-security-policy")).toBe(
      "sandbox; default-src 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
