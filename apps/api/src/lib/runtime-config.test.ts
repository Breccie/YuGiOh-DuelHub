import { describe, expect, it } from "vitest";
import { getAllowedCorsOrigins, getCookieSecret } from "./runtime-config";

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
