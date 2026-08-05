import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "./server";
import { getPrisma } from "./lib/prisma";

vi.mock("./lib/prisma", async (importOriginal) => {
  if (process.env.API_INTEGRATION_TESTS === "1") {
    return importOriginal<typeof import("./lib/prisma")>();
  }

  return {
    getPrisma: vi.fn(() => ({
      $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
    })),
  };
});

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
    expect(response.json()).toMatchObject({
      ok: true,
      service: "ygo-api",
      buildSha: expect.any(String),
      buildTime: expect.any(String),
      schemaVersion: expect.any(String),
      region: expect.any(String),
    });
    expect(response.headers["x-duel-hub-build"]).toBe(response.json().buildSha);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-site");
  });

  it.skipIf(runApiIntegrationTests)(
    "exposes a database readiness endpoint",
    async () => {
      vi.mocked(getPrisma).mockReturnValueOnce({
        $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
      } as unknown as ReturnType<typeof getPrisma>);

      const response = await server.inject({
        method: "GET",
        url: "/ready",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        service: "ygo-api",
        database: "reachable",
        buildSha: expect.any(String),
        buildTime: expect.any(String),
        schemaVersion: expect.any(String),
        region: expect.any(String),
      });
    },
  );

  it.skipIf(runApiIntegrationTests)(
    "reports readiness failure when the database is unreachable",
    async () => {
      vi.mocked(getPrisma).mockReturnValueOnce({
        $queryRaw: vi.fn(async () => {
          throw new Error("database offline");
        }),
      } as unknown as ReturnType<typeof getPrisma>);

      const response = await server.inject({
        method: "GET",
        url: "/ready",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        ok: false,
        service: "ygo-api",
        database: "unreachable",
        buildSha: expect.any(String),
        buildTime: expect.any(String),
        schemaVersion: expect.any(String),
        region: expect.any(String),
      });
    },
  );

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
    const [response, summaryResponse] = await Promise.all([
      server.inject({
        method: "GET",
        url: "/api/v1/dashboard",
      }),
      server.inject({
        method: "GET",
        url: "/api/v1/dashboard/summary",
      }),
    ]);

    expect(response.statusCode).toBe(401);
    expect(response.json().errorDetail.code).toBe("unauthorized");
    expect(summaryResponse.statusCode).toBe(401);
    expect(summaryResponse.json().errorDetail.code).toBe("unauthorized");
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

  it("protects sync endpoints", async () => {
    const [bootstrapResponse, changesResponse] = await Promise.all([
      server.inject({
        method: "GET",
        url: "/api/v1/sync/bootstrap",
      }),
      server.inject({
        method: "GET",
        url: "/api/v1/sync/changes",
      }),
    ]);

    expect(bootstrapResponse.statusCode).toBe(401);
    expect(bootstrapResponse.json().errorDetail.code).toBe("unauthorized");
    expect(changesResponse.statusCode).toBe(401);
    expect(changesResponse.json().errorDetail.code).toBe("unauthorized");
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

  it("rejects cross-origin mutations before route handling", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "https://attacker.test",
      },
      payload: {
        duelistId: "ATTACKER",
        password: "not-relevant",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().errorDetail.code).toBe("invalid_origin");
  });

  it("rate-limits repeated login attempts", async () => {
    const responses = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await server.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: {},
        }),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.statusCode === 400)).toBe(
      true,
    );
    expect(responses[10]?.statusCode).toBe(429);
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

        const createRunResponse = await server.inject({
          method: "POST",
          url: "/api/v1/runs",
          headers: {
            cookie,
          },
          payload: {
            name: "API Smoke Progression",
          },
        });

        expect(createRunResponse.statusCode).toBe(201);

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
        const user = await prisma.user.findUnique({
          where: {
            duelistId,
          },
          select: {
            id: true,
          },
        });

        if (user) {
          await prisma.playGroupRun.deleteMany({
            where: {
              ownerId: user.id,
            },
          });
          await prisma.user.delete({
            where: {
              id: user.id,
            },
          });
        }
      }
    },
  );
});
