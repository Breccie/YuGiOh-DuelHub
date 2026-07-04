import { describe, expect, it } from "vitest";
import {
  assertCheckpointCanApply,
  assertPromoCanBeClaimed,
  getCheckpointStatusAfterTournamentCompletion,
} from "./progression";

describe("progression rules", () => {
  it("marks locked checkpoints ready after the required tournament completes", () => {
    expect(getCheckpointStatusAfterTournamentCompletion("LOCKED")).toBe("READY");
    expect(getCheckpointStatusAfterTournamentCompletion("READY")).toBe("READY");
    expect(getCheckpointStatusAfterTournamentCompletion("APPLIED")).toBe("APPLIED");
  });

  it("allows ready checkpoints and treats already applied checkpoints as idempotent", () => {
    expect(assertCheckpointCanApply("READY")).toBe("can_apply");
    expect(assertCheckpointCanApply("APPLIED")).toBe("already_applied");
  });

  it("rejects locked checkpoints", () => {
    expect(() => assertCheckpointCanApply("LOCKED")).toThrow("noch nicht bereit");
  });

  it("keeps free promo access separate from prize promos and pack rewards", () => {
    expect(() =>
      assertPromoCanBeClaimed({
        sourceType: "PROMO_CHOICE",
        claimMode: "CHOOSE",
      }),
    ).not.toThrow();
    expect(() =>
      assertPromoCanBeClaimed({
        sourceType: "PRIZE_PROMO",
        claimMode: "ORGANIZER_ONLY",
      }),
    ).toThrow("Organizer");
    expect(() =>
      assertPromoCanBeClaimed({
        sourceType: "PACK_REWARD",
        claimMode: "RANDOM",
      }),
    ).toThrow("Pack-Reward");
  });
});
