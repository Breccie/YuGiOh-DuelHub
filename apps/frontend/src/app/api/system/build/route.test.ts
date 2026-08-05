import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/system/build", () => {
  const originalSha = process.env.DUEL_HUB_BUILD_SHA;
  const originalTime = process.env.DUEL_HUB_BUILD_TIME;

  afterEach(() => {
    process.env.DUEL_HUB_BUILD_SHA = originalSha;
    process.env.DUEL_HUB_BUILD_TIME = originalTime;
  });

  it("liefert SHA und Buildzeit auch als Header", async () => {
    process.env.DUEL_HUB_BUILD_SHA = "release-sha";
    process.env.DUEL_HUB_BUILD_TIME = "2026-08-05T18:00:00.000Z";

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      buildSha: "release-sha",
      buildTime: "2026-08-05T18:00:00.000Z",
    });
    expect(response.headers.get("x-duel-hub-frontend-build")).toBe("release-sha");
  });
});
