import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DATABASE_SCHEMA_VERSION,
  getAllowedCorsOrigins,
  getApiBuildMetadata,
  getCookieSecret,
} from "./runtime-config";

describe("api runtime config", () => {
  it("keeps local CORS defaults outside production", () => {
    expect(getAllowedCorsOrigins({ APP_MODE: "online-dev" })).toEqual([
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]);
  });

  it("requires explicit non-wildcard CORS origins in production", () => {
    expect(() => getAllowedCorsOrigins({ APP_MODE: "production" })).toThrow(
      "CORS_ORIGIN muss in production explizit gesetzt sein.",
    );
    expect(() =>
      getAllowedCorsOrigins({
        APP_MODE: "production",
        CORS_ORIGIN: "https://duel.example,*",
      }),
    ).toThrow("CORS_ORIGIN darf in production kein Wildcard-Origin sein.");
  });

  it("deduplicates configured CORS origins", () => {
    expect(
      getAllowedCorsOrigins({
        APP_MODE: "production",
        CORS_ORIGIN: "https://duel.example, https://duel.example",
      }),
    ).toEqual(["https://duel.example"]);
  });

  it("requires a strong cookie secret in production", () => {
    expect(() =>
      getCookieSecret({
        APP_MODE: "production",
        COOKIE_SECRET: "short",
      }),
    ).toThrow("COOKIE_SECRET muss in production mindestens 32 Zeichen lang sein.");
  });
});

describe("API-Buildmetadaten", () => {
  it("meldet die neueste PostgreSQL-Migration als Schema-Version", () => {
    const migrations = readdirSync(resolve(process.cwd(), "apps/api/prisma/migrations"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(DATABASE_SCHEMA_VERSION).toBe(migrations.at(-1));
  });

  it("bevorzugt explizite Laufzeitmetadaten", () => {
    expect(getApiBuildMetadata({
      BUILD_SHA: "build-sha",
      BUILD_TIME: "2026-08-05T16:00:00.000Z",
      SCHEMA_VERSION: "schema-version",
      REGION: "frankfurt",
    })).toEqual({
      buildSha: "build-sha",
      buildTime: "2026-08-05T16:00:00.000Z",
      schemaVersion: "schema-version",
      region: "frankfurt",
    });
  });

  it("erkennt den Frankfurter Render-Dienst am Servicenamen", () => {
    expect(getApiBuildMetadata({
      RENDER_GIT_COMMIT: "render-sha",
      RENDER_SERVICE_NAME: "yugioh-duel-hub-api-frankfurt",
    })).toMatchObject({
      buildSha: "render-sha",
      region: "frankfurt",
    });
  });
});
