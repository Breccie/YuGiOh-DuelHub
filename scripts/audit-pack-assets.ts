import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type CardSetRow = {
  code: string;
  name: string;
  releaseDate: Date;
  productType: string;
  imageUrl: string | null;
};

type AssetStatus =
  | "APPROVED_REAL"
  | "NEEDS_NORMALIZE"
  | "NEEDS_GENERATION"
  | "SPECIAL_PRODUCT"
  | "NO_GOOD_SOURCE";

type AssetSource =
  | "KONAMI"
  | "YGOPROG"
  | "FANDOM"
  | "TCGPLAYER"
  | "CARDMARKET"
  | "GENERATED"
  | "MANUAL";

type Candidate = {
  source: AssetSource;
  sourceName: string;
  sourceUrl: string;
  licenseNote: string;
  width: number;
  height: number;
  contentType: string;
  qualityScore: number;
};

type ManifestEntry = {
  code: string;
  setName: string;
  productType: string;
  assetStatus: AssetStatus;
  sourceUrl: string | null;
  sourceName: string | null;
  source: AssetSource | null;
  licenseNote: string | null;
  dimensions: {
    width: number;
    height: number;
  } | null;
  qualityScore: number;
  approvedImageUrl: string | null;
  reviewNote: string | null;
};

const ROOT = path.resolve(__dirname, "..");
const FRONTEND_PUBLIC_DIR = path.join(ROOT, "apps", "frontend", "public");
const MANIFEST_PATH = path.join(
  ROOT,
  "apps",
  "frontend",
  "src",
  "data",
  "pack-assets-manifest.json",
);
const REPORT_DIR = path.join(ROOT, "data", "pack-assets");
const CONTACT_SHEET_PATH = path.join(REPORT_DIR, "pack-asset-contact-sheet.png");
const REPORT_PATH = path.join(REPORT_DIR, "pack-asset-audit-report.json");
const GENERATION_JOBS_PATH = path.join(REPORT_DIR, "pack-generation-jobs.json");
const REFERENCE_CODES = ["LOB", "MRD", "SRL", "PSV", "IOC"];
const USER_AGENT = "Yu-Gi-Oh Duel Hub/1.0 pack-asset-audit";
const MIN_NORMALIZABLE_QUALITY_SCORE = 55;
const OFFICIAL_PACK_ASSET_PAGES = [
  "https://www.yugioh-card.com/en/products/booster-pack/",
  "https://www.yugioh-card.com/en/products/tournament-packs/",
  "https://www.yugioh-card.com/en/products/past_products/booster-pack-archive/",
  "https://www.yugioh-card.com/en/products/past_products/ots-tournament-packs-archive/",
  "https://www.yugioh-card.com/en/products/speed-duel/",
];
const SPECIAL_PRODUCT_PATTERN =
  /adidas|advent calendar|anniversary pack|collector|dark beginning|dark legends|dark revelation|demo pack|duel disk|duel terminal|egyptian god|elemental hero collection|exclusive pack|forbidden legacy|gx next generation|legendary|light and darkness power pack|limited edition|master collection|movie pack|power-up pack|premium pack|power of chaos|retro pack|samurai assault|special edition|speed duel|starter chronicles|super starter|sweepstakes|twilight edition|ultimate beginner|ultimate edition|world championship|x-saber power-up/i;
const CODE_ALIASES: Record<string, string[]> = {
  MRL: ["SRL"],
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function getFilenameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "");
  } catch {
    return "";
  }
}

function isOfficialPackImageUrl(url: string) {
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

function getOfficialAssetCode(url: string) {
  const basename = getFilenameFromUrl(url).replace(/\.[^.]+$/, "");
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

  return cleaned.match(/^([A-Z]{2,5}\d{0,2})(?:\b|[_-])/)?.[1] ?? null;
}

async function fetchImageCandidate(
  source: AssetSource,
  sourceName: string,
  sourceUrl: string,
  licenseNote: string,
) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (!contentType.toLowerCase().startsWith("image/")) {
    return null;
  }

  const body = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(body).metadata();

  if (!metadata.width || !metadata.height) {
    return null;
  }

  return {
    source,
    sourceName,
    sourceUrl,
    licenseNote,
    width: metadata.width,
    height: metadata.height,
    contentType,
    qualityScore: scoreCandidate(source, metadata.width, metadata.height),
  } satisfies Candidate;
}

function scoreCandidate(source: AssetSource, width: number, height: number) {
  const ratio = width / height;
  const areaScore = Math.min(42, Math.round((width * height) / 9000));
  const shapeScore = ratio >= 0.45 && ratio <= 0.68 ? 22 : ratio >= 0.35 && ratio <= 0.8 ? 12 : 0;
  const resolutionScore = width >= 350 && height >= 550 ? 22 : width >= 250 && height >= 430 ? 15 : 6;
  const sourceScore = source === "KONAMI" ? 14 : source === "MANUAL" ? 14 : source === "YGOPROG" ? 9 : 4;

  return Math.min(100, areaScore + shapeScore + resolutionScore + sourceScore);
}

function isStandardBooster(set: CardSetRow) {
  if (set.productType !== "CORE_BOOSTER") {
    return false;
  }

  return !SPECIAL_PRODUCT_PATTERN.test(set.name);
}

function getLocalRenderCandidate(set: CardSetRow) {
  const code = normalizeCode(set.code);
  const localPath = path.join(FRONTEND_PUBLIC_DIR, "pack-renders", `${code}.png`);

  if (!existsSync(localPath)) {
    return null;
  }

  return {
    source: "MANUAL" as const,
    sourceName: "Lokaler freigegebener Pack-Render",
    sourceUrl: `/pack-renders/${code}.png`,
    licenseNote: "Bundled, already approved for the app reference style.",
    localPath,
  };
}

async function getLocalRenderMetadata(candidate: NonNullable<ReturnType<typeof getLocalRenderCandidate>>) {
  const metadata = await sharp(candidate.localPath).metadata();

  if (!metadata.width || !metadata.height) {
    return null;
  }

  return {
    source: candidate.source,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    licenseNote: candidate.licenseNote,
    width: metadata.width,
    height: metadata.height,
    contentType: "image/png",
    qualityScore: scoreCandidate(candidate.source, metadata.width, metadata.height),
  } satisfies Candidate;
}

async function fetchOfficialPackAssets() {
  const assets = new Map<string, string>();

  for (const pageUrl of OFFICIAL_PACK_ASSET_PAGES) {
    const response = await fetch(pageUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      continue;
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
      .filter(isOfficialPackImageUrl);

    for (const url of new Set(urls)) {
      const code = getOfficialAssetCode(url);

      if (code && !assets.has(code)) {
        assets.set(code, url);
      }
    }
  }

  return assets;
}

function getCodeVariants(code: string) {
  const normalizedCode = normalizeCode(code);

  return [normalizedCode, ...(CODE_ALIASES[normalizedCode] ?? [])];
}

async function getYgoProgCandidate(set: CardSetRow) {
  for (const code of getCodeVariants(set.code)) {
    const candidate = await fetchImageCandidate(
      "YGOPROG",
      "YGO Prog Pack-CDN",
      `https://images.ygoprog.com/pack/${code}.jpg`,
      "Third-party pack image CDN; use as real-image source and normalize before display.",
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function chooseManifestEntry(set: CardSetRow, candidates: Candidate[]) {
  const code = normalizeCode(set.code);

  if (!isStandardBooster(set)) {
    return {
      code,
      setName: set.name,
      productType: set.productType,
      assetStatus: "SPECIAL_PRODUCT",
      sourceUrl: null,
      sourceName: null,
      source: null,
      licenseNote: null,
      dimensions: null,
      qualityScore: 0,
      approvedImageUrl: null,
      reviewNote: "Not part of the unified standard-booster asset pool.",
    } satisfies ManifestEntry;
  }

  const best = [...candidates].sort((left, right) => right.qualityScore - left.qualityScore)[0];

  if (!best) {
    return {
      code,
      setName: set.name,
      productType: set.productType,
      assetStatus: "NEEDS_GENERATION",
      sourceUrl: set.imageUrl,
      sourceName: set.imageUrl ? "Seed image from imported set metadata" : null,
      source: null,
      licenseNote: set.imageUrl ? "Seed only; not approved for direct hero display." : null,
      dimensions: null,
      qualityScore: 0,
      approvedImageUrl: null,
      reviewNote: "No acceptable real pack image source found; prepare a generation job.",
    } satisfies ManifestEntry;
  }

  if (best.qualityScore < MIN_NORMALIZABLE_QUALITY_SCORE) {
    return {
      code,
      setName: set.name,
      productType: set.productType,
      assetStatus: "NEEDS_GENERATION",
      sourceUrl: best.sourceUrl,
      sourceName: best.sourceName,
      source: best.source,
      licenseNote: `${best.licenseNote} Seed only; quality is below the normalized Pack-Hero threshold.`,
      dimensions: {
        width: best.width,
        height: best.height,
      },
      qualityScore: best.qualityScore,
      approvedImageUrl: null,
      reviewNote:
        "Best real source is too low-resolution or off-style; use it only as generation/reference input.",
    } satisfies ManifestEntry;
  }

  const localOrKonami = best.source === "MANUAL" || best.source === "KONAMI";
  const assetStatus: AssetStatus =
    localOrKonami && best.qualityScore >= 70 ? "APPROVED_REAL" : "NEEDS_NORMALIZE";

  return {
    code,
    setName: set.name,
    productType: set.productType,
    assetStatus,
    sourceUrl: best.sourceUrl,
    sourceName: best.sourceName,
    source: best.source,
    licenseNote: best.licenseNote,
    dimensions: {
      width: best.width,
      height: best.height,
    },
    qualityScore: best.qualityScore,
    approvedImageUrl: assetStatus === "APPROVED_REAL" ? best.sourceUrl : null,
    reviewNote:
      assetStatus === "APPROVED_REAL"
        ? "Real pack render is approved for direct display."
        : "Real pack image exists but must be normalized before display.",
  } satisfies ManifestEntry;
}

async function createContactSheet(entries: ManifestEntry[]) {
  const candidates = entries
    .filter((entry) => entry.sourceUrl && entry.assetStatus !== "SPECIAL_PRODUCT")
    .slice(0, 48);
  const columns = 6;
  const cellWidth = 260;
  const cellHeight = 310;
  const width = columns * cellWidth;
  const height = Math.ceil(candidates.length / columns) * cellHeight + 90;
  const composites: sharp.OverlayOptions[] = [];

  const background = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#08070a"/>
      <text x="${width / 2}" y="42" fill="#fff1d8" font-family="Georgia, serif" font-size="30" font-weight="900" text-anchor="middle">Pack-Asset Audit Kontaktbogen</text>
      <text x="${width / 2}" y="72" fill="#c0a783" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="600" text-anchor="middle">Erste ${candidates.length} Standard-Booster nach Manifest-Reihenfolge</text>
    </svg>
  `.trim());

  for (const [index, entry] of candidates.entries()) {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight + 90;
    const panel = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="${x + 14}" y="${y + 8}" width="${cellWidth - 28}" height="${cellHeight - 18}" rx="18" fill="#151118" stroke="#5a452a" stroke-width="2"/>
        <text x="${x + cellWidth / 2}" y="${y + 35}" fill="#fff1d8" font-family="Georgia, serif" font-size="22" font-weight="900" text-anchor="middle">${entry.code}</text>
        <text x="${x + cellWidth / 2}" y="${y + 270}" fill="#c0a783" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="650" text-anchor="middle">${entry.source ?? "NONE"} · ${entry.qualityScore} · ${entry.dimensions?.width ?? "?"}x${entry.dimensions?.height ?? "?"}</text>
        <text x="${x + cellWidth / 2}" y="${y + 291}" fill="#8f7b60" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${entry.assetStatus}</text>
      </svg>
    `.trim());

    composites.push({ input: panel, left: 0, top: 0 });

    try {
      const input =
        entry.sourceUrl!.startsWith("/")
          ? path.join(FRONTEND_PUBLIC_DIR, entry.sourceUrl!.replace(/^\//, ""))
          : Buffer.from(
              await (
                await fetch(entry.sourceUrl!, {
                  headers: {
                    Accept: "image/*,*/*;q=0.8",
                    "User-Agent": USER_AGENT,
                  },
                })
              ).arrayBuffer(),
            );
      const image = await sharp(input)
        .resize({
          width: 150,
          height: 205,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      composites.push({
        input: image,
        left: x + Math.round((cellWidth - 150) / 2),
        top: y + 52,
      });
    } catch {
      // The JSON report remains the source of truth when a preview cannot load.
    }
  }

  await sharp(background).composite(composites).png().toFile(CONTACT_SHEET_PATH);
}

function createGenerationJobs(entries: ManifestEntry[]) {
  return entries
    .filter((entry) => entry.assetStatus === "NEEDS_GENERATION")
    .map((entry) => ({
      code: entry.code,
      setName: entry.setName,
      seedImageUrl: entry.sourceUrl,
      sourceName: entry.sourceName,
      sourceDimensions: entry.dimensions,
      targetOutput: {
        width: 420,
        height: 650,
        format: "png",
        background: "transparent",
      },
      prompt:
        `Create a clean front-facing English Yu-Gi-Oh! TCG booster pack render for "${entry.setName}" (${entry.code}). ` +
        "Use the supplied seed image only as composition and label reference. Match the app reference style: sealed foil wrapper, visible silver crimp at the top and bottom, straight-on product render, no display box, no hand, no table, no white product-photo background, no perspective tilt. Preserve the original set colors, monster artwork composition, Konami logo position, English Edition badge, Yu-Gi-Oh! logo, set title, and cards-per-pack text as closely as possible. Output a single centered booster pack with transparent background.",
      negativePrompt:
        "display box, booster box, blister packaging, card single, loose cards, hand, table, shelf, white border, product photo background, watermark, distorted text, misspelled logo, wrong language, Japanese pack, fake set name, extra packs, cropped wrapper, angled perspective",
      reviewChecklist: [
        "English booster pack only",
        "No box, display, blister, hand, or table",
        "Visible top and bottom foil crimps",
        "Set name and core labels are readable enough for app hero usage",
        "Transparent or cleanly removable background",
        "Consistent scale with LOB/MRD/SRL/PSV/IOC reference renders",
      ],
    }));
}

async function main() {
  loadEnvFile();
  process.env.DATABASE_URL ??= "file:./prisma/dev.db";

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const sets = await prisma.cardSet.findMany({
      where: {
        isOpenable: true,
      },
      orderBy: {
        releaseDate: "asc",
      },
      select: {
        code: true,
        name: true,
        releaseDate: true,
        productType: true,
        imageUrl: true,
      },
    });
    const officialAssets = await fetchOfficialPackAssets();
    const entries: ManifestEntry[] = [];

    for (const set of sets) {
      const candidates: Candidate[] = [];
      const localRender = getLocalRenderCandidate(set);

      if (localRender) {
        const candidate = await getLocalRenderMetadata(localRender);

        if (candidate) {
          candidates.push(candidate);
        }
      }

      for (const code of getCodeVariants(set.code)) {
        const officialUrl = officialAssets.get(code);

        if (!officialUrl) {
          continue;
        }

        const candidate = await fetchImageCandidate(
          "KONAMI",
          "Konami official product image",
          officialUrl,
          "Official Konami product image.",
        );

        if (candidate) {
          candidates.push(candidate);
        }
      }

      const ygoProgCandidate = await getYgoProgCandidate(set);

      if (ygoProgCandidate) {
        candidates.push(ygoProgCandidate);
      }

      entries.push(chooseManifestEntry(set, candidates));
    }

    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      referenceStyle: {
        codes: REFERENCE_CODES,
        description:
          "Front-facing English booster pack render with visible foil crimps, no display box, no white product background.",
      },
      entries,
    };
    const report = {
      generatedAt: manifest.generatedAt,
      totals: entries.reduce(
        (acc, entry) => {
          acc[entry.assetStatus] += 1;

          return acc;
        },
        {
          APPROVED_REAL: 0,
          NEEDS_NORMALIZE: 0,
          NEEDS_GENERATION: 0,
          SPECIAL_PRODUCT: 0,
          NO_GOOD_SOURCE: 0,
        } satisfies Record<AssetStatus, number>,
      ),
      entries,
    };
    const generationJobs = {
      generatedAt: manifest.generatedAt,
      count: report.totals.NEEDS_GENERATION,
      jobs: createGenerationJobs(entries),
    };

    mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(GENERATION_JOBS_PATH, `${JSON.stringify(generationJobs, null, 2)}\n`);
    await createContactSheet(entries);

    console.log(`Manifest: ${MANIFEST_PATH}`);
    console.log(`Report: ${REPORT_PATH}`);
    console.log(`Generation jobs: ${GENERATION_JOBS_PATH}`);
    console.log(`Contact sheet: ${CONTACT_SHEET_PATH}`);
    console.log(JSON.stringify(report.totals, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
