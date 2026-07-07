import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server";
import { getPrisma } from "./lib/prisma";

const runApiIntegrationTests = process.env.API_INTEGRATION_TESTS === "1";

function extractSessionCookie(response: { headers: Record<string, unknown> }) {
  const setCookie = response.headers["set-cookie"];
  const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (typeof rawCookie !== "string") {
    throw new Error("Expected registration to return a session cookie.");
  }

  return rawCookie.split(";")[0];
}

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
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-site");
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

  it.skipIf(!runApiIntegrationTests)(
    "supports an authenticated run through Fastify API v1 routes",
    async () => {
      const prisma = getPrisma();
      const duelistId = `API-SMOKE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      try {
        const registerResponse = await server.inject({
          method: "POST",
          url: "/api/v1/auth/register",
          payload: {
            duelistId,
            displayName: "API Smoke Tester",
            password: "smoke-password",
            favoriteEra: "GX",
          },
        });

        expect(registerResponse.statusCode).toBe(201);
        const cookie = extractSessionCookie(registerResponse);
        const userId = registerResponse.json().session.userId as string;

        const activeRunResponse = await server.inject({
          method: "GET",
          url: "/api/v1/runs/active",
          headers: {
            cookie,
          },
        });

        expect(activeRunResponse.statusCode).toBe(200);
        const activeRunPayload = activeRunResponse.json();
        expect(activeRunPayload.run.viewerRole).toBe("OWNER");
        expect(activeRunPayload.wallet.balance).toBe(
          activeRunPayload.run.startingCredits,
        );

        const runId = activeRunPayload.run.id as string;

        const [runsResponse, collectionResponse, progressionResponse] =
          await Promise.all([
            server.inject({
              method: "GET",
              url: "/api/v1/runs",
              headers: {
                cookie,
              },
            }),
            server.inject({
              method: "GET",
              url: "/api/v1/collection",
              headers: {
                cookie,
              },
            }),
            server.inject({
              method: "GET",
              url: `/api/v1/runs/${runId}/progression`,
              headers: {
                cookie,
              },
            }),
          ]);

        expect(runsResponse.statusCode).toBe(200);
        expect(runsResponse.json().activeRunId).toBe(runId);
        expect(runsResponse.json().runs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: runId,
              viewerRole: "OWNER",
            }),
          ]),
        );

        expect(collectionResponse.statusCode).toBe(200);
        expect(collectionResponse.json().viewer.id).toBe(userId);
        expect(collectionResponse.json().totals.totalCopies).toBe(0);

        expect(progressionResponse.statusCode).toBe(200);
        expect(progressionResponse.json().run.id).toBe(runId);
        expect(progressionResponse.json().currentCheckpoint).toBeNull();
        expect(progressionResponse.json().nextCheckpoint).toBeNull();
        expect(progressionResponse.json().readyCheckpoints).toEqual([]);

        const binderResponse = await server.inject({
          method: "POST",
          url: "/api/v1/collection/binders",
          headers: {
            cookie,
          },
          payload: {
            name: "API Smoke Binder",
            coverKey: "inferno-vortex",
            description: "Created through Fastify smoke coverage.",
          },
        });

        expect(binderResponse.statusCode).toBe(201);
        const binder = await prisma.collectionBinder.findUnique({
          where: {
            id: binderResponse.json().binder.id,
          },
          select: {
            runId: true,
          },
        });
        expect(binder?.runId).toBe(runId);

        const rewardResponse = await server.inject({
          method: "POST",
          url: `/api/v1/runs/${runId}/rewards`,
          headers: {
            cookie,
          },
          payload: {
            recipientDuelistId: duelistId,
            amountCredits: 25,
            reason: "Fastify API smoke",
          },
        });

        expect(rewardResponse.statusCode).toBe(201);
        expect(rewardResponse.json()).toMatchObject({
          runId,
          amountCredits: 25,
          packSetId: null,
          packQuantity: 0,
          status: "CLAIMED",
        });
      } finally {
        await prisma.user.deleteMany({
          where: {
            duelistId,
          },
        });
      }
    },
  );
});
