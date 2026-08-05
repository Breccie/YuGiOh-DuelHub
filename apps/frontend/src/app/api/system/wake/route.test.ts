import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/system/wake", () => {
  const originalAppMode = process.env.APP_MODE;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  afterEach(() => {
    process.env.APP_MODE = originalAppMode;
    process.env.API_BASE_URL = originalApiBaseUrl;
    vi.unstubAllGlobals();
  });

  it("liefert im Desktopmodus sofort ready", async () => {
    process.env.APP_MODE = "desktop-demo";
    delete process.env.API_BASE_URL;

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ ready: true, mode: "desktop" });
  });

  it("wartet im Onlinemodus auf die API-Readiness", async () => {
    process.env.APP_MODE = "online-dev";
    process.env.API_BASE_URL = "https://api.example.test";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.example.test/ready"),
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });
});
