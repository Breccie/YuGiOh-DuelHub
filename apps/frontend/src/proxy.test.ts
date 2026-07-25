import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOriginApiRequest, proxy } from "./proxy";

function apiRequest(
  method: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest("https://duelhub.test/api/decks", {
    method,
    headers: {
      host: "duelhub.test",
      ...headers,
    },
  });
}

describe("API mutation proxy", () => {
  it("allows safe methods without an Origin header", () => {
    const response = proxy(apiRequest("GET"));

    expect(response.status).toBe(200);
  });

  it("allows same-origin mutations behind a trusted proxy", () => {
    const request = apiRequest("POST", {
      origin: "https://duelhub.test",
      "x-forwarded-host": "duelhub.test",
      "x-forwarded-proto": "https",
    });

    expect(isSameOriginApiRequest(request)).toBe(true);
    expect(proxy(request).status).toBe(200);
  });

  it("rejects missing, cross-origin, and protocol-mismatched origins", async () => {
    const requests = [
      apiRequest("POST"),
      apiRequest("PATCH", { origin: "https://attacker.test" }),
      apiRequest("DELETE", { origin: "http://duelhub.test" }),
    ];

    for (const request of requests) {
      const response = proxy(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        errorDetail: {
          code: "invalid_origin",
        },
      });
    }
  });
});
