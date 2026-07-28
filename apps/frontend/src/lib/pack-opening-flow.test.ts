import { describe, expect, it } from "vitest";
import {
  getPackOpeningTimeline,
  hasExpectedPullSlots,
  initialOpeningFlowState,
  openingFlowReducer,
  openingSpeeds,
} from "@/lib/pack-opening-flow";

describe("getPackOpeningTimeline", () => {
  it("lands the ninth card after about 5.7 seconds at the default speed", () => {
    const timeline = getPackOpeningTimeline({ cardCount: 9, speed: 1 });

    expect(timeline.tearEndMs).toBe(1_120);
    expect(timeline.dealStartMs).toBe(1_580);
    expect(timeline.cards.at(-1)?.landAtMs).toBe(5_680);
    expect(timeline.completeAtMs).toBe(5_680);
  });

  it.each(openingSpeeds.slice(1))(
    "scales the entire timeline at %sx",
    (speed) => {
      const timeline = getPackOpeningTimeline({ cardCount: 9, speed });

      expect(timeline.completeAtMs).toBeCloseTo(5_680 / speed, 6);
      expect(timeline.cards[4]?.launchAtMs).toBeCloseTo(
        (1_580 + 4 * 430) / speed,
        6,
      );
    },
  );

  it("skips only the tear when a manual cut has already completed", () => {
    const timeline = getPackOpeningTimeline({
      cardCount: 9,
      speed: 1,
      skipTear: true,
    });

    expect(timeline.tearEndMs).toBe(0);
    expect(timeline.dealStartMs).toBe(460);
    expect(timeline.completeAtMs).toBe(4_560);
  });
});

describe("openingFlowReducer", () => {
  it("finishes immediately after the animation when the response was fast", () => {
    let state = openingFlowReducer(initialOpeningFlowState, { type: "start" });
    state = openingFlowReducer(state, { type: "request-succeeded" });
    state = openingFlowReducer(state, { type: "show-stack" });
    state = openingFlowReducer(state, { type: "start-dealing" });
    state = openingFlowReducer(state, { type: "animation-complete" });

    expect(state.phase).toBe("ready");
    expect(state.requestStatus).toBe("succeeded");
  });

  it("keeps dealt backs locked until a late response succeeds", () => {
    let state = openingFlowReducer(initialOpeningFlowState, { type: "start" });
    state = openingFlowReducer(state, { type: "show-stack" });
    state = openingFlowReducer(state, { type: "start-dealing" });
    state = openingFlowReducer(state, { type: "card-landed", slotIndex: 1 });
    state = openingFlowReducer(state, { type: "animation-complete" });

    expect(state.phase).toBe("dealing");
    expect(state.animationComplete).toBe(true);
    expect(state.requestStatus).toBe("pending");

    state = openingFlowReducer(state, { type: "request-succeeded" });
    expect(state.phase).toBe("ready");
  });

  it("enters the error phase and rejects a synchronous second start", () => {
    const started = openingFlowReducer(initialOpeningFlowState, {
      type: "start",
    });
    const duplicate = openingFlowReducer(started, { type: "start" });
    const failed = openingFlowReducer(duplicate, { type: "request-failed" });

    expect(duplicate).toBe(started);
    expect(failed.phase).toBe("error");
    expect(failed.requestStatus).toBe("failed");
    expect(failed.stackWasShown).toBe(false);
  });
});

describe("hasExpectedPullSlots", () => {
  it("accepts each expected slot exactly once", () => {
    expect(
      hasExpectedPullSlots(
        Array.from({ length: 9 }, (_, index) => ({ slotIndex: index + 1 })),
        9,
      ),
    ).toBe(true);
  });

  it("rejects an unexpected pull count or duplicate slot", () => {
    expect(hasExpectedPullSlots([{ slotIndex: 1 }], 9)).toBe(false);
    expect(
      hasExpectedPullSlots(
        Array.from({ length: 9 }, (_, index) => ({
          slotIndex: index === 8 ? 8 : index + 1,
        })),
        9,
      ),
    ).toBe(false);
  });
});
