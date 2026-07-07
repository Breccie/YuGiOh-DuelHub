import { describe, expect, it } from "vitest";
import {
  isSameOriginMutation,
  requireSameOriginMutation,
} from "@/lib/api-route-security";

function requestWithHeaders(headers: HeadersInit) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
  });
}

describe("api-route-security", () => {
  it("accepts same-origin mutation requests", () => {
    const request = requestWithHeaders({
      host: "localhost:3000",
      origin: "http://localhost:3000",
    });

    expect(isSameOriginMutation(request)).toBe(true);
    expect(() => requireSameOriginMutation(request)).not.toThrow();
  });

  it("rejects missing or cross-origin mutation requests", () => {
    const missingOrigin = requestWithHeaders({
      host: "localhost:3000",
    });
    const crossOrigin = requestWithHeaders({
      host: "localhost:3000",
      origin: "https://example.test",
    });

    expect(isSameOriginMutation(missingOrigin)).toBe(false);
    expect(isSameOriginMutation(crossOrigin)).toBe(false);
    expect(() => requireSameOriginMutation(crossOrigin, "Nope.")).toThrow(
      expect.objectContaining({
        code: "invalid_origin",
        message: "Nope.",
        status: 403,
      }),
    );
  });
});
