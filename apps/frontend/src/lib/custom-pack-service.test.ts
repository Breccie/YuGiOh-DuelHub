import { describe, expect, it } from "vitest";
import { createDeterministicRandom, validatePackDraft } from "@/lib/custom-pack-service";

const validDraft = {
  poolEntries: [
    { cardId: "card-common", setCardId: null, rarity: "Common", weight: 3 },
    { cardId: "card-rare", setCardId: null, rarity: "Rare", weight: 1 },
  ],
  slots: [
    { slotIndex: 0, count: 8, allowedRarities: ["Common"], weight: 1 },
    { slotIndex: 1, count: 1, allowedRarities: ["Rare"], weight: 1 },
  ],
};

describe("custom pack validation and simulation primitives", () => {
  it("accepts a complete reachable slot configuration", () => {
    expect(() => validatePackDraft(validDraft, 9)).not.toThrow();
  });

  it("rejects empty rarity pools and unreachable cards", () => {
    expect(() => validatePackDraft({
      poolEntries: [validDraft.poolEntries[0]],
      slots: validDraft.slots,
    }, 9)).toThrow(/Rare/);

    expect(() => validatePackDraft({
      poolEntries: validDraft.poolEntries,
      slots: [validDraft.slots[0]],
    }, 8)).toThrow(/Rare/);
  });

  it("is reproducible for the same seed", () => {
    const first = createDeterministicRandom("same-seed");
    const second = createDeterministicRandom("same-seed");
    expect(Array.from({ length: 20 }, () => first())).toEqual(
      Array.from({ length: 20 }, () => second()),
    );
  });
});
