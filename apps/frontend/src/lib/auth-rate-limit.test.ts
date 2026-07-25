import { afterEach, describe, expect, it } from "vitest";
import {
  requireAuthRateLimit,
  resetAuthRateLimitsForTests,
} from "./auth-rate-limit";

describe("auth rate limiting", () => {
  afterEach(() => {
    resetAuthRateLimitsForTests();
  });

  it("limits repeated login attempts by client address", () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(() => requireAuthRateLimit(request, "login")).not.toThrow();
    }

    expect(() => requireAuthRateLimit(request, "login")).toThrow(
      expect.objectContaining({
        code: "rate_limit_exceeded",
        status: 429,
      }),
    );
  });
});
