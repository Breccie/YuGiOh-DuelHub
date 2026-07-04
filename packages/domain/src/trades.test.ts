import { describe, expect, it } from "vitest";
import { deriveTradeThreadState } from "./trades";

describe("trade thread state", () => {
  it("marks pending recipient threads as awaiting response", () => {
    expect(
      deriveTradeThreadState({
        status: "PENDING",
        viewerIsActiveRecipient: true,
        viewerHasConfirmed: false,
      }),
    ).toBe("awaitingYourResponse");
  });

  it("marks accepted threads based on confirmation", () => {
    expect(
      deriveTradeThreadState({
        status: "ACCEPTED",
        viewerIsActiveRecipient: false,
        viewerHasConfirmed: false,
      }),
    ).toBe("waitingForYourConfirmation");

    expect(
      deriveTradeThreadState({
        status: "ACCEPTED",
        viewerIsActiveRecipient: false,
        viewerHasConfirmed: true,
      }),
    ).toBe("waitingForTheirConfirmation");
  });
});
