import { describe, expect, it } from "vitest";
import { toNextErrorResponse } from "@/lib/api-error-response";

describe("api-error-response", () => {
  it("keeps API service connectivity failures as service_unavailable", async () => {
    const error = new Error("API-Service nicht erreichbar.");
    (error as Error & { status?: number }).status = 503;

    const response = toNextErrorResponse(error, "Fallback");
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorDetail).toEqual({
      code: "service_unavailable",
      message: "API-Service nicht erreichbar.",
      status: 503,
    });
  });
});
