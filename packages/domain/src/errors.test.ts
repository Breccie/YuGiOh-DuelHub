import { describe, expect, it } from "vitest";
import { DomainError, toApiError } from "./errors";

describe("API error conversion", () => {
  it("preserves intentional domain errors", () => {
    expect(
      toApiError(
        new DomainError({
          code: "conflict",
          message: "Konflikt.",
          status: 409,
        }),
        "Fallback.",
      ),
    ).toMatchObject({
      code: "conflict",
      message: "Konflikt.",
      status: 409,
    });
  });

  it("does not expose unexpected internal error messages", () => {
    expect(
      toApiError(
        new Error("postgresql://secret-user:secret-password@internal/db"),
        "Interner Fehler.",
      ),
    ).toEqual({
      code: "internal_error",
      message: "Interner Fehler.",
      status: 500,
    });
  });

  it("preserves explicitly typed client-safe errors", () => {
    const error = new Error("Das Deck ist noch nicht legal.") as Error & {
      code: string;
      status: number;
    };
    error.code = "deck_not_playable";
    error.status = 409;

    expect(toApiError(error, "Export fehlgeschlagen.")).toMatchObject({
      code: "deck_not_playable",
      message: "Das Deck ist noch nicht legal.",
      status: 409,
    });
  });
});
