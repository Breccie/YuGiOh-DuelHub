import { DomainError } from "./errors";

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
  const displaySize = Math.max(1, options.displaySize ?? options.defaultDisplaySize);

  return {
    packPrice,
    displaySize,
    displayCost: calculateDisplayCost({ packPrice, displaySize }),
  };
}
