import { getPackAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";
import { getPackAssetManifestEntry } from "@/lib/pack-asset-manifest";

const OFFICIAL_PACK_RENDERS: Record<string, string> = {
  LOB: "/pack-renders/LOB.png",
  MRD: "/pack-renders/MRD.png",
  SRL: "/pack-renders/SRL.png",
  PSV: "/pack-renders/PSV.png",
  IOC: "/pack-renders/IOC.png",
};

const OFFICIAL_PACK_BACK_RENDERS: Record<string, string> = {};
const GENERIC_PACK_BACK_RENDER = "/pack-renders/generic-pack-back.svg";

function shouldPreferFallbackImage(code: string) {
  const manifestEntry = getPackAssetManifestEntry(code);

  if (!manifestEntry) {
    return false;
  }

  return (
    (manifestEntry.assetStatus === "SPECIAL_PRODUCT" ||
      manifestEntry.assetStatus === "NO_GOOD_SOURCE") &&
    !manifestEntry.approvedImageUrl &&
    !manifestEntry.sourceUrl
  );
}

export function getPackRenderAssets(
  code: string,
  setName: string | null,
  fallbackImageUrl: string | null,
) {
  const normalizedCode = code.trim().toUpperCase();
  const generatedPackAssetUrl = getPackAssetUrl(normalizedCode, setName);
  const resolvedFallbackImageUrl = resolveAppImageUrl(fallbackImageUrl);
  const preferFallbackImage = shouldPreferFallbackImage(normalizedCode);

  return {
    frontImageUrl:
      OFFICIAL_PACK_RENDERS[normalizedCode] ??
      (preferFallbackImage
        ? resolvedFallbackImageUrl ?? generatedPackAssetUrl
        : generatedPackAssetUrl ?? resolvedFallbackImageUrl),
    backImageUrl: OFFICIAL_PACK_BACK_RENDERS[normalizedCode] ?? GENERIC_PACK_BACK_RENDER,
  };
}

export function getPreferredPackHeroImage(
  code: string,
  setName: string | null,
  fallbackImageUrl: string | null,
) {
  return getPackRenderAssets(code, setName, fallbackImageUrl).frontImageUrl;
}

export function getPreferredPackBackImage(code: string) {
  return OFFICIAL_PACK_BACK_RENDERS[code.trim().toUpperCase()] ?? GENERIC_PACK_BACK_RENDER;
}

export function hasOfficialPackRender(code: string) {
  return code.trim().toUpperCase() in OFFICIAL_PACK_RENDERS;
}
