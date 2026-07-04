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
    entry.assetStatus === "NEEDS_GENERATION" ||
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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateSvgText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getPackPalette(code: string, setName: string | null) {
  const palettes = [
    {
      bodyA: "#2b3647",
      bodyB: "#101722",
      accentA: "#cf6041",
      accentB: "#721f15",
      glow: "#f2c172",
    },
    {
      bodyA: "#263a34",
      bodyB: "#0d1b18",
      accentA: "#2f9b82",
      accentB: "#135045",
      glow: "#a8f0d6",
    },
    {
      bodyA: "#322d48",
      bodyB: "#141123",
      accentA: "#9d76d4",
      accentB: "#4b2c72",
      glow: "#d7c4ff",
    },
    {
      bodyA: "#463126",
      bodyB: "#1c100b",
      accentA: "#d39245",
      accentB: "#7a3f14",
      glow: "#ffd59a",
    },
    {
      bodyA: "#243449",
      bodyB: "#0d1521",
      accentA: "#5a96d6",
      accentB: "#1d4d82",
      glow: "#b9dbff",
    },
  ];

  return palettes[hashString(`${code}:${setName ?? ""}`) % palettes.length]!;
}

function createDataUri(sourceImage: PackSourceImage | null) {
  if (!sourceImage || !sourceImage.contentType.toLowerCase().startsWith("image/")) {
    return null;
  }

  return `data:${sourceImage.contentType};base64,${sourceImage.body.toString("base64")}`;
}

function createSourceTextureLayer(sourceImage: PackSourceImage | null) {
  const dataUri = createDataUri(sourceImage);

  if (!dataUri) {
    return "";
  }

  if (!sourceImage) {
    return "";
  }

  return `
    <g clip-path="url(#packBodyClip)">
      <rect x="50" y="72" width="320" height="490" fill="#05070b"/>
      <image href="${dataUri}" x="50" y="72" width="320" height="490" preserveAspectRatio="xMidYMid meet"/>
      <rect x="50" y="72" width="320" height="490" fill="url(#bodyShade)" opacity="0.2"/>
    </g>
  `.trim();
}

export function createStyledPackAsset(
  code: string,
  setName: string | null,
  sourceImage: PackSourceImage | null = null,
) {
  const safeCode = escapeSvgText(normalizeCode(code) || "PACK");
  const safeName = escapeSvgText(
    truncateSvgText(setName?.trim() || "Booster-Pack", 34),
  );
  const palette = getPackPalette(code, setName);
  const textureLayer = createSourceTextureLayer(sourceImage);
  const hasSourceImage = Boolean(sourceImage);
  const fallbackArtworkLayer = hasSourceImage
    ? ""
    : `
        <path d="M78 124h264v286H78z" fill="url(#accent)" opacity="0.92"/>
        <path d="M92 142h236v250H92z" fill="none" stroke="rgba(255,238,207,0.62)" stroke-width="4" stroke-dasharray="14 11" opacity="0.76"/>
        <rect x="68" y="96" width="108" height="34" rx="2" fill="#e8efe9"/>
        <text x="122" y="121" text-anchor="middle" fill="#d81919" font-family="Arial Black, Arial, sans-serif" font-size="24" font-weight="900">KONAMI</text>
        <rect x="242" y="94" width="98" height="44" rx="7" fill="#b91514" stroke="#2b0b0b" stroke-width="3"/>
        <text x="291" y="121" text-anchor="middle" fill="#fff6e6" font-family="Georgia, serif" font-size="16" font-weight="800">ENGLISH</text>
        <text x="291" y="136" text-anchor="middle" fill="#fff6e6" font-family="Georgia, serif" font-size="12" font-weight="800">EDITION</text>
        <circle cx="314" cy="172" r="28" fill="rgba(0,0,0,0.58)" stroke="${palette.glow}" stroke-width="2" opacity="0.9"/>
        <text x="314" y="166" text-anchor="middle" fill="#fff7e9" font-family="Arial, sans-serif" font-size="10" font-weight="900">DUEL</text>
        <text x="314" y="180" text-anchor="middle" fill="#fff7e9" font-family="Arial, sans-serif" font-size="10" font-weight="900">HUB</text>
        <path d="M78 430h264l-18 82H96z" fill="rgba(0,0,0,0.68)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
        <text x="210" y="462" text-anchor="middle" fill="#fff2df" font-family="Georgia, serif" font-size="28" font-weight="900" letter-spacing="-1">Yu-Gi-Oh!</text>
        <text x="210" y="482" text-anchor="middle" fill="#fff2df" font-family="Arial, sans-serif" font-size="11" font-weight="800" letter-spacing="1.5">TRADING CARD GAME</text>
        <text x="210" y="530" text-anchor="middle" fill="#f8ead7" stroke="rgba(0,0,0,0.62)" stroke-width="3" paint-order="stroke" font-family="Georgia, serif" font-size="27" font-weight="900">${safeName}</text>
        <text x="210" y="557" text-anchor="middle" fill="#d9c2a3" font-family="Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="1.3">${safeCode}</text>
        <text x="72" y="594" fill="#f5ead8" font-family="Georgia, serif" font-size="18" font-weight="800">9 CARDS</text>
        <text x="72" y="614" fill="#f5ead8" font-family="Georgia, serif" font-size="18" font-weight="800">PER PACK</text>
        <text x="210" y="614" text-anchor="middle" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="10">© Studio Dice/SHUEISHA, TV TOKYO, KONAMI</text>
      `.trim();
  const sourcePolishLayer = hasSourceImage
    ? `
        <rect x="50" y="72" width="320" height="490" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
        <path d="M62 96c70-18 205-18 296-2" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
        <path d="M64 542c76 16 192 16 292-2" fill="none" stroke="rgba(0,0,0,0.26)" stroke-width="3"/>
      `.trim()
    : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 650" role="img" aria-label="${safeName}">
      <defs>
        <linearGradient id="foil" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#f4efe3"/>
          <stop offset="18%" stop-color="#bfc6ca"/>
          <stop offset="44%" stop-color="#f9f4ec"/>
          <stop offset="67%" stop-color="#9aa4ac"/>
          <stop offset="100%" stop-color="#f8f2e6"/>
        </linearGradient>
        <linearGradient id="pack" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette.bodyA}"/>
          <stop offset="48%" stop-color="${palette.bodyB}"/>
          <stop offset="100%" stop-color="#070a0f"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette.accentA}"/>
          <stop offset="100%" stop-color="${palette.accentB}"/>
        </linearGradient>
        <linearGradient id="bodyShade" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>
          <stop offset="42%" stop-color="rgba(0,0,0,0.04)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.72)"/>
        </linearGradient>
        <clipPath id="packBodyClip">
          <path d="M50 72h320v490H50z"/>
        </clipPath>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#000000" flood-opacity="0.38"/>
        </filter>
        <pattern id="foilLines" width="18" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4c5-5 13 5 18 0" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
          <path d="M0 7h18" stroke="rgba(0,0,0,0.13)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="420" height="650" rx="34" fill="none"/>
      <g filter="url(#softShadow)">
        <path d="M36 18h348l-14 72H50z" fill="url(#foil)"/>
        <path d="M50 72h320v490H50z" fill="url(#pack)" stroke="#e1c38d" stroke-width="3"/>
        ${textureLayer}
        <path d="M36 632h348l-14-72H50z" fill="url(#foil)"/>
        <path d="M42 22h336l-8 22H50z" fill="url(#foilLines)" opacity="0.78"/>
        <path d="M50 586h320l8 38H42z" fill="url(#foilLines)" opacity="0.82"/>
        <path d="M66 94h288v352H66z" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
        ${fallbackArtworkLayer}
        ${sourcePolishLayer}
        <path d="M50 72h320v490H50z" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>
        <path d="M54 78c68 20 142 18 304-3" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
        <path d="M57 555c84-16 186-14 306 2" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="3"/>
      </g>
    </svg>
  `.trim();

  return Buffer.from(svg, "utf8");
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

export function createPackAssetPlaceholder(code: string, setName: string | null) {
  return createStyledPackAsset(code, setName);
}
