import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server";

describe("api server", () => {
  const server = createServer();

  beforeAll(async () => {
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("exposes a health endpoint", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "ygo-api",
    });
  });

  it("exposes rules through api v1", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/rules",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "progression",
        }),
        expect.objectContaining({
          slug: "edopro",
        }),
      ]),
    );
  });

  it("protects the dashboard endpoint", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/dashboard",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().errorDetail.code).toBe("unauthorized");
  });

  it("protects pack endpoints", async () => {
    const [packsResponse, openingsResponse] = await Promise.all([
      server.inject({
        method: "GET",
        url: "/api/v1/packs",
      }),
      server.inject({
        method: "POST",
        url: "/api/v1/packs/openings",
        payload: {},
      }),
    ]);

    expect(packsResponse.statusCode).toBe(401);
    expect(openingsResponse.statusCode).toBe(401);
  });

  it("protects friends and profile mutation endpoints", async () => {
    const [friendsResponse, profileResponse] = await Promise.all([
      server.inject({
        method: "GET",
        url: "/api/v1/friends",
      }),
      server.inject({
        method: "PATCH",
        url: "/api/v1/profiles/me",
        payload: {
          displayName: "Kaiba",
        },
      }),
    ]);

    expect(friendsResponse.statusCode).toBe(401);
    expect(profileResponse.statusCode).toBe(401);
  });
});
