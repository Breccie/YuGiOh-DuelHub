import { describe, expect, it } from "vitest";

import {
  applyLedgerAmount,
  assertSufficientCredits,
  calculateDisplayCost,
  normalizePackEconomy,
} from "./economy";

describe("credit economy", () => {
  it("calculates display costs from pack price and display size", () => {
    expect(calculateDisplayCost({ packPrice: 100, displaySize: 24 })).toBe(2400);
  });

  it("rejects purchases without enough credits", () => {
    expect(() =>
      assertSufficientCredits({ balance: 500, cost: 2400 }),
    ).toThrow("Nicht genug Credits");
  });

  it("applies ledger amounts to balances", () => {
    expect(applyLedgerAmount({ balance: 2400, amount: -100 })).toBe(2300);
    expect(applyLedgerAmount({ balance: 2300, amount: 300 })).toBe(2600);
  });

  it("normalizes run economy defaults", () => {
    expect(
      normalizePackEconomy({
        defaultPackPrice: 100,
        defaultDisplaySize: 24,
      }),
    ).toEqual({
      packPrice: 100,
      displaySize: 24,
      displayCost: 2400,
    });
  });
});
