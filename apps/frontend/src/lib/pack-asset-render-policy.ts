import type { PackAssetMatch } from "@/lib/pack-assets";

export function shouldNormalizePackAsset(
  match: Pick<PackAssetMatch, "assetStatus" | "imageUrl" | "source">,
) {
  if (
    match.assetStatus === "NEEDS_NORMALIZE" ||
    match.assetStatus === "NEEDS_GENERATION"
  ) {
    return true;
  }

  return (
    match.assetStatus === "APPROVED_REAL" &&
    match.source === "KONAMI" &&
    !match.imageUrl.startsWith("/")
  );
}
