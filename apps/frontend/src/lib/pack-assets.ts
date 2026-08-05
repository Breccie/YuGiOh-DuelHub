import "server-only";

import {
  getPackAssetManifestEntry,
  type PackAssetManifestEntry,
  type PackAssetSource,
  type PackAssetStatus,
} from "@/lib/pack-asset-manifest";

type FandomImageInfo = {
  url: string;
  width?: number;
  height?: number;
  mime?: string;
};

type FandomQueryResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: FandomImageInfo[];
      }
    >;
  };
};

type FandomPageImagesResponse = {
  query?: {
    pages?: Record<
      string,
      {
        images?: Array<{
          title?: string;
        }>;
      }
    >;
  };
};

export type PackAssetMatch = {
  source: PackAssetSource | "OFFICIAL" | "FANDOM";
  assetStatus?: PackAssetStatus;
  productId?: number;
  productName: string;
  productUrl: string | null;
  groupId?: number;
  groupName: string;
  imageUrl: string;
  fallbackImageUrl: string | null;
  approvedImageUrl?: string | null;
  licenseNote?: string | null;
  qualityScore?: number;
  width?: number;
  height?: number;
};

export type PackSourceImage = {
  body: Buffer;
  contentType: string;
};

const PACK_ASSET_USER_AGENT = "Yu-Gi-Oh Duel Hub/1.0 pack-assets";
const OFFICIAL_PACK_ASSET_PAGES = [
  "https://www.yugioh-card.com/en/products/booster-pack/",
  "https://www.yugioh-card.com/en/products/tournament-packs/",
  "https://www.yugioh-card.com/en/products/past_products/booster-pack-archive/",
  "https://www.yugioh-card.com/en/products/past_products/ots-tournament-packs-archive/",
  "https://www.yugioh-card.com/en/products/speed-duel/",
];
const OFFICIAL_PRODUCT_PAGE_PACK_CODES = new Set(["BLCR", "KICO", "MZMU"]);
const FANDOM_API_URL = "https://yugioh.fandom.com/api.php";
const MIN_FANDOM_PACK_AREA = 32_000;
const FANDOM_FILE_ALIASES: Record<string, string[]> = {
  CSOC: ["CSOC-Booster-EN-1E.jpg"],
  DPYG: ["DuelistPackYugi-BoosterEN.jpg"],
  TU04: ["TU04-BoosterSP.png"],
  WGRT: ["WGRT-BoosterEU.png"],
  YS14: ["YS14-PowerUpPackV1.png"],
};

const matchesByLookupKey = new Map<string, Promise<PackAssetMatch | null>>();
let officialPackAssetsPromise: Promise<Map<string, PackAssetMatch>> | null = null;
const officialProductAssetsByCode = new Map<
  string,
  Promise<PackAssetMatch | null>
>();

function createManifestAssetMatch(entry: PackAssetManifestEntry) {
  const imageUrl = entry.approvedImageUrl ?? entry.sourceUrl;

  if (
    !imageUrl ||
    entry.assetStatus === "SPECIAL_PRODUCT" ||
    entry.assetStatus === "NO_GOOD_SOURCE"
  ) {
    return null;
  }

  return {
    source: entry.source ?? "MANUAL",
    assetStatus: entry.assetStatus,
    productName: entry.setName,
    productUrl: entry.sourceUrl,
    groupName: entry.sourceName ?? "Pack Asset Manifest",
    imageUrl,
    fallbackImageUrl: null,
    approvedImageUrl: entry.approvedImageUrl,
    licenseNote: entry.licenseNote,
    qualityScore: entry.qualityScore,
    width: entry.dimensions?.width,
    height: entry.dimensions?.height,
  } satisfies PackAssetMatch;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/yu-gi-oh!|yugioh/g, " ")
    .replace(/25th anniversary edition/g, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function getLookupKey(code: string, name: string | null) {
  return `${normalizeCode(code)}:${normalizeSearchText(name ?? "")}`;
}

function getFilenameFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const revisionIndex = pathSegments.findIndex((segment) => segment === "revision");
    const filename =
      revisionIndex > 0
        ? pathSegments[revisionIndex - 1]
        : pathSegments.at(-1);

    return decodeURIComponent(filename ?? "");
  } catch {
    return "";
  }
}

function isOfficialSinglePackAssetUrl(url: string) {
  const filename = getFilenameFromUrl(url).toLowerCase();

  if (!filename || !/\.(png|jpe?g|webp)$/i.test(filename)) {
    return false;
  }

  if (
    /logo|share|icon|legal|float|comingsoon|remote_duel|display|box|tuck|starter|fan|2card|3foil|3_foils|4_pack|case|mat|sleeve/i.test(
      filename,
    )
  ) {
    return false;
  }

  return /(?:550|lrg|mock|foil|pack|op\d|ots\d|stp\d)/i.test(filename);
}

function isOfficialProductPageAssetUrl(url: string) {
  const filename = getFilenameFromUrl(url).toLowerCase();

  if (!filename || !/\.(png|jpe?g|webp)$/i.test(filename)) {
    return false;
  }

  if (/logo|share|icon|legal|float|comingsoon|remote_duel|box|display|case|mat|sleeve/i.test(filename)) {
    return false;
  }

  return /(?:550|lrg|mock|foil|3foil|3_foils|pack|op\d|ots\d|stp\d)/i.test(
    filename,
  );
}

function getOfficialAssetCode(url: string) {
  const filename = getFilenameFromUrl(url);
  const basename = filename.replace(/\.[^.]+$/, "");
  const specialCases = new Map<string, string>([
    ["SRL__25th_550", "SRL"],
    ["DRG2_lrg", "DRL2"],
    ["Millenium_Pack_lrg", "MIL1"],
    ["StarPack_ARC-V_lrg", "SP15"],
    ["StraPack2_lrg", "SP14"],
  ]);

  if (specialCases.has(basename)) {
    return specialCases.get(basename)!;
  }

  const cleaned = basename.toUpperCase().replace(/^MOCKUP_/, "").replace(/-EN$/, "");
  const otsMatch = cleaned.match(/^OTS-?0?(\d{1,2})/);

  if (otsMatch) {
    return `OP${otsMatch[1].padStart(2, "0")}`;
  }

  const match = cleaned.match(/^([A-Z]{2,5}\d{0,2})(?:\b|[_-])/);

  if (!match) {
    return null;
  }

  return match[1];
}

async function fetchOfficialAssetPage(pageUrl: string, includeProductPageRenders = false) {
  const response = await fetch(pageUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": PACK_ASSET_USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const urls = Array.from(
    html.matchAll(/(?:src|data-src|srcset|href)=["']([^"']+(?:png|jpe?g|webp)(?:\?[^"']*)?)["']/gi),
    (match) => match[1],
  )
    .flatMap((value) =>
      value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean),
    )
    .map((value) => new URL(value, pageUrl).toString())
    .filter((url) =>
      includeProductPageRenders
        ? isOfficialProductPageAssetUrl(url)
        : isOfficialSinglePackAssetUrl(url),
    );

  return Array.from(new Set(urls));
}

async function getOfficialPackAssets() {
  if (!officialPackAssetsPromise) {
    officialPackAssetsPromise = (async () => {
      const assets = new Map<string, PackAssetMatch>();
      const pages = await Promise.all(
        OFFICIAL_PACK_ASSET_PAGES.map((pageUrl) => fetchOfficialAssetPage(pageUrl)),
      );

      for (const imageUrl of pages.flat()) {
        const code = getOfficialAssetCode(imageUrl);

        if (!code || assets.has(code)) {
          continue;
        }

        assets.set(code, {
          source: "OFFICIAL",
          productName: `${code} offizieller Packshot`,
          productUrl: null,
          groupName: "Yu-Gi-Oh! Official Card Game",
          imageUrl,
          fallbackImageUrl: null,
        });
      }

      return assets;
    })();
  }

  return officialPackAssetsPromise;
}

async function resolveOfficialPackAsset(code: string) {
  const normalizedCode = normalizeCode(code);
  const assets = await getOfficialPackAssets();

  return (
    assets.get(normalizedCode) ??
    resolveOfficialProductPagePackAsset(normalizedCode)
  );
}

function resolveOfficialProductPagePackAsset(code: string) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode || !OFFICIAL_PRODUCT_PAGE_PACK_CODES.has(normalizedCode)) {
    return null;
  }

  let matchPromise = officialProductAssetsByCode.get(normalizedCode);

  if (!matchPromise) {
    matchPromise = (async () => {
      const pageUrl = `https://www.yugioh-card.com/en/products/${normalizedCode.toLowerCase()}/`;
      let urls: string[];

      try {
        urls = await fetchOfficialAssetPage(pageUrl, true);
      } catch {
        return null;
      }

      const imageUrl = urls.find(
        (candidateUrl) => getOfficialAssetCode(candidateUrl) === normalizedCode,
      );

      if (!imageUrl) {
        return null;
      }

      return {
        source: "OFFICIAL" as const,
        productName: `${normalizedCode} offizieller Packshot`,
        productUrl: pageUrl,
        groupName: "Yu-Gi-Oh! Official Card Game",
        imageUrl,
        fallbackImageUrl: null,
      };
    })();
    officialProductAssetsByCode.set(normalizedCode, matchPromise);
  }

  return matchPromise;
}

function getFandomCandidateCodes(code: string) {
  const normalizedCode = normalizeCode(code);
  const codes = new Set([normalizedCode]);

  if (normalizedCode.startsWith("OP0")) {
    codes.add(normalizedCode.replace(/^OP0/, "OP"));
  }

  return Array.from(codes).filter(Boolean);
}

function getFandomCandidateFiles(code: string) {
  const suffixes = [
    "BoosterEN.png",
    "BoosterEN.jpg",
    "BoosterNA.png",
    "BoosterNA.jpg",
    "PackEN.png",
    "PackEN.jpg",
    "PackNA.png",
    "PackNA.jpg",
  ];
  const normalizedCode = normalizeCode(code);

  return [
    ...(FANDOM_FILE_ALIASES[normalizedCode] ?? []),
    ...getFandomCandidateCodes(code).flatMap((candidateCode) =>
      suffixes.map((suffix) => `${candidateCode}-${suffix}`),
    ),
  ];
}

async function fetchFandomImageInfos(files: string[]) {
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    format: "json",
    origin: "*",
    titles: files.map((file) => `File:${file}`).join("|"),
  });
  const response = await fetch(`${FANDOM_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": PACK_ASSET_USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as FandomQueryResponse;
  const pages = Object.values(payload.query?.pages ?? {});

  return pages.flatMap((page) =>
    (page.imageinfo ?? []).map((imageInfo) => ({
      ...imageInfo,
      title: page.title ?? "",
    })),
  );
}

function getFandomImageScore(imageInfo: FandomImageInfo & { title: string }) {
  const title = imageInfo.title.toLowerCase();
  const area = (imageInfo.width ?? 0) * (imageInfo.height ?? 0);
  let score = area;

  if (title.includes("boosteren")) {
    score += 120_000;
  }

  if (title.includes("packen")) {
    score += 120_000;
  }

  if (title.includes("boosterna")) {
    score += 60_000;
  }

  if (title.includes("packna")) {
    score += 60_000;
  }

  if (/booster(?:de|fr|it|pt|sp)|pack(?:de|fr|it|pt|sp)/.test(title)) {
    score -= 80_000;
  }

  if (imageInfo.mime === "image/png") {
    score += 35_000;
  }

  return score;
}

function hasPlausibleFandomPackShape(imageInfo: FandomImageInfo) {
  const width = imageInfo.width ?? 0;
  const height = imageInfo.height ?? 0;

  if (!width || !height) {
    return false;
  }

  const ratio = width / height;

  return ratio >= 0.25 && ratio <= 1.1;
}

async function resolveFandomPackAsset(code: string, setName: string | null) {
  const files = getFandomCandidateFiles(code);
  const imageInfos = await fetchFandomImageInfos(files);
  const bestImageInfo = imageInfos
    .filter((imageInfo) => {
      const area = (imageInfo.width ?? 0) * (imageInfo.height ?? 0);

      return (
        imageInfo.url &&
        area >= MIN_FANDOM_PACK_AREA &&
        hasPlausibleFandomPackShape(imageInfo)
      );
    })
    .sort(
      (left, right) => getFandomImageScore(right) - getFandomImageScore(left),
    )[0];

  if (bestImageInfo) {
    return createFandomAssetMatch(bestImageInfo, setName);
  }

  return (
    (await resolveFandomGalleryPackAsset(setName)) ??
    resolveFandomPagePackAsset(setName)
  );
}

function createFandomAssetMatch(
  imageInfo: FandomImageInfo & { title: string },
  setName: string | null,
): PackAssetMatch {
  return {
    source: "FANDOM" as const,
    productName: imageInfo.title.replace(/^File:/i, ""),
    productUrl: setName
      ? `https://yugioh.fandom.com/wiki/${encodeURIComponent(
          setName.replace(/\s+/g, "_"),
        )}`
      : null,
    groupName: "Yu-Gi-Oh! Wiki",
    imageUrl: imageInfo.url,
    fallbackImageUrl: null,
    width: imageInfo.width,
    height: imageInfo.height,
  };
}

function getFandomFilenameFromTitle(title: string) {
  return title.replace(/^File:/i, "").trim();
}

function isFandomPackImageTitle(title: string) {
  const filename = getFandomFilenameFromTitle(title).toLowerCase();

  if (!filename || !/\.(png|jpe?g|webp)$/i.test(filename)) {
    return false;
  }

  if (/box|display|case|tin|deck|logo|icon|mat|sleeve|poster/i.test(filename)) {
    return false;
  }

  return /booster|pack/.test(filename);
}

async function fetchFandomPageImageFiles(setName: string | null) {
  const normalizedSetName = setName?.replace(/\s+/g, "_").trim();

  if (!normalizedSetName) {
    return [];
  }

  const params = new URLSearchParams({
    action: "query",
    prop: "images",
    imlimit: "500",
    format: "json",
    titles: normalizedSetName,
  });
  const response = await fetch(`${FANDOM_API_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": PACK_ASSET_USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as FandomPageImagesResponse;
  const pages = Object.values(payload.query?.pages ?? {});

  return Array.from(
    new Set(
      pages
        .flatMap((page) => page.images ?? [])
        .map((image) => image.title ?? "")
        .filter(isFandomPackImageTitle)
        .map(getFandomFilenameFromTitle),
    ),
  );
}

async function resolveFandomGalleryPackAsset(setName: string | null) {
  const files = await fetchFandomPageImageFiles(setName);

  if (files.length === 0) {
    return null;
  }

  const imageInfos = await fetchFandomImageInfos(files);
  const bestImageInfo = imageInfos
    .filter((imageInfo) => {
      const area = (imageInfo.width ?? 0) * (imageInfo.height ?? 0);

      return (
        imageInfo.url &&
        area >= MIN_FANDOM_PACK_AREA &&
        hasPlausibleFandomPackShape(imageInfo)
      );
    })
    .sort(
      (left, right) => getFandomImageScore(right) - getFandomImageScore(left),
    )[0];

  return bestImageInfo ? createFandomAssetMatch(bestImageInfo, setName) : null;
}

function isFandomPagePackImageUrl(url: string) {
  const filename = getFilenameFromUrl(url).toLowerCase();

  if (!filename) {
    return false;
  }

  if (/site-logo|favicon|box|display|case|tin|deck|logo|icon/i.test(filename)) {
    return false;
  }

  return /booster|pack/.test(filename);
}

async function resolveFandomPagePackAsset(setName: string | null) {
  const normalizedSetName = setName?.replace(/\s+/g, "_").trim();

  if (!normalizedSetName) {
    return null;
  }

  const pageUrl = `https://yugioh.fandom.com/wiki/${encodeURIComponent(
    normalizedSetName,
  )}`;
  const response = await fetch(pageUrl, {
    headers: {
      Accept: "text/html",
      "User-Agent": PACK_ASSET_USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const imageUrl = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];

  if (!imageUrl || !isFandomPagePackImageUrl(imageUrl)) {
    return null;
  }

  return {
    source: "FANDOM" as const,
    productName: getFilenameFromUrl(imageUrl),
    productUrl: response.url,
    groupName: "Yu-Gi-Oh! Wiki",
    imageUrl,
    fallbackImageUrl: null,
  };
}

async function resolvePackAssetInternal(
  code: string,
  setName: string | null,
): Promise<PackAssetMatch | null> {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    return null;
  }

  const manifestEntry = getPackAssetManifestEntry(normalizedCode);

  if (manifestEntry) {
    return createManifestAssetMatch(manifestEntry);
  }

  const officialMatch = await resolveOfficialPackAsset(normalizedCode);

  if (officialMatch) {
    return officialMatch;
  }

  if (process.env.PACK_ASSET_ENABLE_UNREVIEWED_FANDOM === "1") {
    const fandomMatch = await resolveFandomPackAsset(normalizedCode, setName);

    if (fandomMatch) {
      return {
        ...fandomMatch,
        assetStatus: "NEEDS_NORMALIZE",
        licenseNote:
          "Unreviewed development fallback; not approved for the final Pack-Hero manifest.",
      };
    }
  }

  // Unreviewed wiki and marketplace product photos are intentionally not used
  // for Pack-Heros. They frequently include white backgrounds, scans, boxes, or
  // inconsistent crops. New packs should be added through the audit manifest.
  return null;
}

export function resolvePackAsset(code: string, setName: string | null) {
  const lookupKey = getLookupKey(code, setName);
  let matchPromise = matchesByLookupKey.get(lookupKey);

  if (!matchPromise) {
    matchPromise = resolvePackAssetInternal(code, setName).catch(() => null);
    matchesByLookupKey.set(lookupKey, matchPromise);
  }

  return matchPromise;
}

export async function normalizePackImageAsset(sourceImage: PackSourceImage) {
  const sharp = (await import("sharp")).default;
  const normalized = sharp(sourceImage.body, { animated: false })
    .rotate()
    .ensureAlpha()
    .trim({
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      threshold: 22,
    });
  const metadata = await normalized.metadata();
  const shouldSharpen = (metadata.width ?? 0) < 260 || (metadata.height ?? 0) < 430;
  const resized = normalized.resize({
    width: 420,
    height: 650,
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: false,
  });

  return (shouldSharpen ? resized.sharpen({ sigma: 0.45 }) : resized)
    .png({ compressionLevel: 9 })
    .toBuffer();
}
