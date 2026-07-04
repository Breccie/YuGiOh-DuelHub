import packAssetManifest from "@/data/pack-assets-manifest.json";

export type PackAssetSource =
  | "KONAMI"
  | "YGOPROG"
  | "FANDOM"
  | "TCGPLAYER"
  | "CARDMARKET"
  | "GENERATED"
  | "MANUAL";

export type PackAssetStatus =
  | "APPROVED_REAL"
  | "NEEDS_NORMALIZE"
  | "NEEDS_GENERATION"
  | "SPECIAL_PRODUCT"
  | "NO_GOOD_SOURCE";

export type PackAssetManifestEntry = {
  code: string;
  setName: string;
  productType: string;
  assetStatus: PackAssetStatus;
  sourceUrl: string | null;
  sourceName: string | null;
  source: PackAssetSource | null;
  licenseNote: string | null;
  dimensions: {
    width: number;
    height: number;
  } | null;
  qualityScore: number;
  approvedImageUrl: string | null;
  reviewNote: string | null;
};

type PackAssetManifest = {
  version: number;
  generatedAt: string;
  referenceStyle: {
    codes: string[];
    description: string;
  };
  entries: PackAssetManifestEntry[];
};

const typedManifest = packAssetManifest as PackAssetManifest;
const entriesByCode = new Map(
  typedManifest.entries.map((entry) => [entry.code.toUpperCase(), entry]),
);

export function getPackAssetManifestEntry(code: string) {
  const normalizedCode = code.trim().toUpperCase();

  return entriesByCode.get(normalizedCode) ?? null;
}

export function getPackAssetManifestMetadata() {
  return {
    version: typedManifest.version,
    generatedAt: typedManifest.generatedAt,
    referenceStyle: typedManifest.referenceStyle,
    entryCount: typedManifest.entries.length,
  };
}
