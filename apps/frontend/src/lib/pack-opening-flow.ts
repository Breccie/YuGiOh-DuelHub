export const openingSpeeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type OpeningSpeed = (typeof openingSpeeds)[number];

export type OpeningFlowPhase =
  | "idle"
  | "tearing"
  | "stacking"
  | "dealing"
  | "ready"
  | "error";

export type OpeningRequestStatus = "idle" | "pending" | "succeeded" | "failed";

export type OpeningFlowState = {
  phase: OpeningFlowPhase;
  requestStatus: OpeningRequestStatus;
  landedSlots: number[];
  animationComplete: boolean;
  stackWasShown: boolean;
};

export type OpeningFlowAction =
  | { type: "start"; skipTear?: boolean }
  | { type: "show-stack" }
  | { type: "start-dealing" }
  | { type: "card-landed"; slotIndex: number }
  | { type: "animation-complete" }
  | { type: "request-succeeded" }
  | { type: "request-failed" }
  | { type: "reset" };

export const DEFAULT_OPENING_SPEED: OpeningSpeed = 1;

export const PACK_OPENING_TIMING = {
  tearDurationMs: 1_120,
  stackEntranceMs: 280,
  stackSettleMs: 180,
  cardIntervalMs: 460,
  cardFlightMs: 420,
} as const;

export const initialOpeningFlowState: OpeningFlowState = {
  phase: "idle",
  requestStatus: "idle",
  landedSlots: [],
  animationComplete: false,
  stackWasShown: false,
};

export function openingFlowReducer(
  state: OpeningFlowState,
  action: OpeningFlowAction,
): OpeningFlowState {
  switch (action.type) {
    case "start":
      if (
        state.requestStatus === "pending" ||
        state.phase === "tearing" ||
        state.phase === "stacking" ||
        state.phase === "dealing"
      ) {
        return state;
      }

      return {
        phase: action.skipTear ? "stacking" : "tearing",
        requestStatus: "pending",
        landedSlots: [],
        animationComplete: false,
        stackWasShown: Boolean(action.skipTear),
      };
    case "show-stack":
      return state.phase === "tearing"
        ? { ...state, phase: "stacking", stackWasShown: true }
        : state;
    case "start-dealing":
      return state.phase === "stacking"
        ? { ...state, phase: "dealing" }
        : state;
    case "card-landed":
      if (state.landedSlots.includes(action.slotIndex)) {
        return state;
      }

      return {
        ...state,
        landedSlots: [...state.landedSlots, action.slotIndex].sort(
          (a, b) => a - b,
        ),
      };
    case "animation-complete":
      return {
        ...state,
        animationComplete: true,
        phase: state.requestStatus === "succeeded" ? "ready" : state.phase,
      };
    case "request-succeeded":
      return {
        ...state,
        requestStatus: "succeeded",
        phase: state.animationComplete ? "ready" : state.phase,
      };
    case "request-failed":
      return {
        ...state,
        requestStatus: "failed",
        phase: "error",
      };
    case "reset":
      return initialOpeningFlowState;
  }
}

export function getPackOpeningTimeline({
  cardCount,
  speed,
  skipTear = false,
}: {
  cardCount: number;
  speed: OpeningSpeed;
  skipTear?: boolean;
}) {
  const scale = 1 / speed;
  const tearEndMs = skipTear ? 0 : PACK_OPENING_TIMING.tearDurationMs * scale;
  const stackEntranceEndMs =
    tearEndMs + PACK_OPENING_TIMING.stackEntranceMs * scale;
  const dealStartMs =
    stackEntranceEndMs + PACK_OPENING_TIMING.stackSettleMs * scale;
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    slotIndex: index + 1,
    launchAtMs:
      dealStartMs + index * PACK_OPENING_TIMING.cardIntervalMs * scale,
    landAtMs:
      dealStartMs +
      index * PACK_OPENING_TIMING.cardIntervalMs * scale +
      PACK_OPENING_TIMING.cardFlightMs * scale,
  }));

  return {
    tearEndMs,
    stackEntranceEndMs,
    dealStartMs,
    cards,
    completeAtMs: cards.at(-1)?.landAtMs ?? dealStartMs,
  };
}

export function hasExpectedPullSlots(
  pulls: Array<{ slotIndex: number }>,
  expectedCount: number,
) {
  if (pulls.length !== expectedCount) {
    return false;
  }

  const slots = new Set(pulls.map((pull) => pull.slotIndex));

  return (
    slots.size === expectedCount &&
    Array.from({ length: expectedCount }, (_, index) => index + 1).every(
      (slotIndex) => slots.has(slotIndex),
    )
  );
}
