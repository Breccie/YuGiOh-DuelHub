import { DomainError } from "./errors";

export const STANDARD_DISPLAY_SIZE = 24;

export function calculateDisplayCost(options: {
  packPrice: number;
  displaySize: number;
}): number {
  return options.packPrice * options.displaySize;
}

export function assertSufficientCredits(options: {
  balance: number;
  cost: number;
}): void {
  if (options.balance < options.cost) {
    throw new DomainError({
      code: "insufficient_credits",
      message: "Nicht genug Credits für diesen Kauf.",
      status: 409,
      details: {
        balance: options.balance,
        cost: options.cost,
      },
    });
  }
}

export function applyLedgerAmount(options: {
  balance: number;
  amount: number;
}): number {
  return options.balance + options.amount;
}

export function normalizePackEconomy(options: {
  packPrice?: number | null;
  displaySize?: number | null;
  defaultPackPrice: number;
  defaultDisplaySize: number;
}): { packPrice: number; displaySize: number; displayCost: number } {
  const packPrice = Math.max(0, options.packPrice ?? options.defaultPackPrice);
  // Regular TCG booster displays always contain 24 packs. Keep the legacy
  // inputs in the public shape for backwards compatibility, but do not let an
  // old per-run override produce a mismatching quantity or price anymore.
  const displaySize = STANDARD_DISPLAY_SIZE;

  return {
    packPrice,
    displaySize,
    displayCost: calculateDisplayCost({ packPrice, displaySize }),
  };
}
