import { getPackAssetUrl, resolveAppImageUrl } from "@/lib/asset-urls";

const OFFICIAL_PACK_RENDERS: Record<string, string> = {
  LOB: "/pack-renders/LOB.png",
  MRD: "/pack-renders/MRD.png",
  SRL: "/pack-renders/SRL.png",
  PSV: "/pack-renders/PSV.png",
  IOC: "/pack-renders/IOC.png",
};

const OFFICIAL_PACK_BACK_RENDERS: Record<string, string> = {};
const GENERIC_PACK_BACK_RENDER = "/pack-renders/generic-pack-back.svg";

export function getPackRenderAssets(
  code: string,
  setName: string | null,
  fallbackImageUrl: string | null,
) {
  return {
    frontImageUrl:
      OFFICIAL_PACK_RENDERS[code] ??
      getPackAssetUrl(code, setName) ??
      resolveAppImageUrl(fallbackImageUrl),
    backImageUrl: OFFICIAL_PACK_BACK_RENDERS[code] ?? GENERIC_PACK_BACK_RENDER,
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
  return OFFICIAL_PACK_BACK_RENDERS[code] ?? GENERIC_PACK_BACK_RENDER;
}

export function hasOfficialPackRender(code: string) {
  return code in OFFICIAL_PACK_RENDERS;
}
