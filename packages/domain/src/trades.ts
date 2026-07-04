import type { TradeThreadState } from "../../contracts/src";

export function deriveTradeThreadState(options: {
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  viewerIsActiveRecipient: boolean;
  viewerHasConfirmed: boolean;
}) : TradeThreadState {
  if (options.status === "PENDING") {
    return options.viewerIsActiveRecipient
      ? "awaitingYourResponse"
      : "waitingForTheirResponse";
  }

  if (options.status === "ACCEPTED") {
    return options.viewerHasConfirmed
      ? "waitingForTheirConfirmation"
      : "waitingForYourConfirmation";
  }

  if (options.status === "COMPLETED") {
    return "completed";
  }

  if (options.status === "CANCELLED") {
    return "cancelled";
  }

  return "rejected";
}
