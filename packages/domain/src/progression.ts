import { DomainError } from "./errors";

export type RunProgressionStatusValue = "LOCKED" | "READY" | "APPLIED";

export type PromoSourceTypeValue =
  | "PACK_REWARD"
  | "PROMO_CHOICE"
  | "FIXED_PROMO_GRANT"
  | "PRIZE_PROMO";

export type PromoClaimModeValue =
  | "CHOOSE"
  | "RANDOM"
  | "FIXED"
  | "ORGANIZER_ONLY";

export function assertCheckpointCanApply(status: RunProgressionStatusValue) {
  if (status === "APPLIED") {
    return "already_applied" as const;
  }

  if (status !== "READY") {
    throw new DomainError({
      code: "checkpoint_not_ready",
      message: "Dieser Fortschritt ist noch nicht bereit.",
      status: 409,
    });
  }

  return "can_apply" as const;
}

export function getCheckpointStatusAfterTournamentCompletion(
  status: RunProgressionStatusValue,
) {
  return status === "LOCKED" ? "READY" : status;
}

export function assertPromoCanBeClaimed(options: {
  sourceType: PromoSourceTypeValue;
  claimMode: PromoClaimModeValue;
}) {
  if (
    options.sourceType === "PRIZE_PROMO" ||
    options.claimMode === "ORGANIZER_ONLY"
  ) {
    throw new DomainError({
      code: "promo_not_claimable",
      message: "Diese Promo kann nur durch Organizer vergeben werden.",
      status: 403,
    });
  }

  if (options.sourceType === "PACK_REWARD") {
    throw new DomainError({
      code: "reward_only_pack",
      message: "Diese Quelle ist ein Pack-Reward und keine frei claimbare Promo.",
      status: 409,
    });
  }
}
