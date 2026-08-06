import { describe, expect, it } from "vitest";
import { shouldNormalizePackAsset } from "./pack-asset-render-policy";

describe("pack asset render policy", () => {
  it("normalizes approved remote Konami renders", () => {
    expect(
      shouldNormalizePackAsset({
        assetStatus: "APPROVED_REAL",
        imageUrl:
          "https://www.yugioh-card.com/en/wp-content/uploads/2020/09/CYHO_mock-foil_EN.png",
        source: "KONAMI",
      }),
    ).toBe(true);
  });

  it("keeps already-cropped local renders unchanged", () => {
    expect(
      shouldNormalizePackAsset({
        assetStatus: "APPROVED_REAL",
        imageUrl: "/pack-renders/LOB.png",
        source: "MANUAL",
      }),
    ).toBe(false);
  });

  it("continues to normalize assets awaiting processing", () => {
    expect(
      shouldNormalizePackAsset({
        assetStatus: "NEEDS_NORMALIZE",
        imageUrl: "https://static.wikia.nocookie.net/example-pack.png",
        source: "FANDOM",
      }),
    ).toBe(true);
  });
});
