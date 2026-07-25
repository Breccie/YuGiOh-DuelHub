import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApiRoute } from "@/lib/api-service-proxy";

describe("api-service-proxy", () => {
  const originalAppMode = process.env.APP_MODE;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  afterEach(() => {
    process.env.APP_MODE = originalAppMode;
    process.env.API_BASE_URL = originalApiBaseUrl;
    vi.unstubAllGlobals();
  });

  it("returns service_unavailable when the API service cannot be reached", async () => {
    process.env.APP_MODE = "online-dev";
    process.env.API_BASE_URL = "http://127.0.0.1:65535";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    );

    const response = await proxyApiRoute(
      new Request("http://localhost/api/v1/runs/run-1/progression"),
      "/api/v1/runs/run-1/progression",
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorDetail).toMatchObject({
      code: "service_unavailable",
      status: 503,
    });
  });

  it("adds a timeout signal to upstream requests", async () => {
    process.env.APP_MODE = "online-dev";
    process.env.API_BASE_URL = "http://api.example.test";
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRoute(
      new Request("http://localhost/api/v1/rules"),
      "/api/v1/rules",
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
