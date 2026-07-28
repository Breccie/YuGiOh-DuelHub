import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.mock("server-only", () => ({}));
});

describe("getConfiguredApiBaseUrl", () => {
  it("requires an explicit production API URL instead of using Oregon", async () => {
    const { getConfiguredApiBaseUrl, getFrontendRuntimeStatus } = await import(
      "@/lib/app-mode"
    );
    const env = {
      APP_MODE: "production",
      NODE_ENV: "production",
      VERCEL: "1",
    } as NodeJS.ProcessEnv;

    expect(getConfiguredApiBaseUrl(env)).toBeNull();
    expect(getFrontendRuntimeStatus(env)).toMatchObject({
      ready: false,
      issues: ["API_BASE_URL ist im Online-Modus erforderlich."],
    });
  });

  it("normalizes an explicitly configured API URL", async () => {
    const { getConfiguredApiBaseUrl } = await import("@/lib/app-mode");

    expect(
      getConfiguredApiBaseUrl({
        APP_MODE: "production",
        NODE_ENV: "production",
        API_BASE_URL: "https://yugioh-duel-hub-api-frankfurt.onrender.com",
      } as NodeJS.ProcessEnv),
    ).toBe("https://yugioh-duel-hub-api-frankfurt.onrender.com/");
  });
});
