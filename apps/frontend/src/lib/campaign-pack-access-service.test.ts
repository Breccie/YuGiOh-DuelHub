import { describe, expect, it } from "vitest";
import { isCampaignPackAvailableNow } from "@/lib/campaign-pack-access-service";

describe("campaign pack availability", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  it("allows available packs without a time window", () => {
    expect(isCampaignPackAvailableNow({
      availabilityStatus: "AVAILABLE",
      availableFrom: null,
      availableUntil: null,
    }, now)).toBe(true);
  });

  it("keeps locked and not-yet-scheduled packs unavailable", () => {
    expect(isCampaignPackAvailableNow({
      availabilityStatus: "LOCKED",
      availableFrom: null,
      availableUntil: null,
    }, now)).toBe(false);
    expect(isCampaignPackAvailableNow({
      availabilityStatus: "SCHEDULED",
      availableFrom: new Date("2026-08-04T13:00:00.000Z"),
      availableUntil: null,
    }, now)).toBe(false);
  });

  it("allows scheduled packs only inside their release window", () => {
    const access = {
      availabilityStatus: "SCHEDULED" as const,
      availableFrom: new Date("2026-08-04T11:00:00.000Z"),
      availableUntil: new Date("2026-08-04T13:00:00.000Z"),
    };
    expect(isCampaignPackAvailableNow(access, now)).toBe(true);
    expect(isCampaignPackAvailableNow(access, new Date("2026-08-04T14:00:00.000Z"))).toBe(false);
  });
});
