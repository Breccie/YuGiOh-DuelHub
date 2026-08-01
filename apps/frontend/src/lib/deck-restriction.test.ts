import { describe, expect, it } from "vitest";
import {
  buildDeckCopyStartOffsets,
  getDeckRestrictionSectionKey,
  getDeckRestrictionPresentation,
  getDeckRestrictionStatus,
  isDeckCopyExcess,
} from "@/lib/deck-restriction";

describe("deck restriction presentation", () => {
  it("maps the standard copy limits to distinct restriction states", () => {
    expect(getDeckRestrictionStatus(0)).toBe("FORBIDDEN");
    expect(getDeckRestrictionStatus(1)).toBe("LIMITED");
    expect(getDeckRestrictionStatus(2)).toBe("SEMI_LIMITED");
    expect(getDeckRestrictionStatus(3)).toBe("UNLIMITED");
  });

  it("marks only copies beyond the configured limit", () => {
    expect(isDeckCopyExcess(3, 3)).toBe(false);
    expect(isDeckCopyExcess(0, 1)).toBe(true);
    expect(isDeckCopyExcess(1, 1)).toBe(false);
    expect(isDeckCopyExcess(1, 2)).toBe(true);
    expect(isDeckCopyExcess(2, 2)).toBe(false);
    expect(isDeckCopyExcess(2, 3)).toBe(true);
  });

  it("counts copies deterministically across main, extra and side", () => {
    const offsets = buildDeckCopyStartOffsets([
      { cardId: "shared", section: "SIDE", quantity: 1 },
      { cardId: "other", section: "MAIN", quantity: 2 },
      { cardId: "shared", section: "EXTRA", quantity: 1 },
      { cardId: "shared", section: "MAIN", quantity: 1 },
    ]);

    expect(offsets.get(getDeckRestrictionSectionKey("shared", "MAIN"))).toBe(0);
    expect(offsets.get(getDeckRestrictionSectionKey("shared", "EXTRA"))).toBe(1);
    expect(offsets.get(getDeckRestrictionSectionKey("shared", "SIDE"))).toBe(2);
  });

  it("keeps point costs separate from point-format prohibitions", () => {
    expect(
      getDeckRestrictionPresentation({
        allowedCopies: 3,
        copyOrdinal: 3,
        usesPointLimit: true,
      }),
    ).toEqual({ status: "UNLIMITED", isExcess: false });
    expect(
      getDeckRestrictionPresentation({
        allowedCopies: 0,
        copyOrdinal: 1,
        usesPointLimit: true,
      }),
    ).toEqual({ status: "FORBIDDEN", isExcess: true });
  });
});
