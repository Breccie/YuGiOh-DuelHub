import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type ManifestEntry = {
  code: string;
  setName: string;
  productType: string;
  assetStatus: string;
  sourceUrl: string | null;
  sourceName: string | null;
  source: string | null;
  licenseNote: string | null;
  dimensions: { width: number; height: number } | null;
  qualityScore: number;
  approvedImageUrl: string | null;
  reviewNote: string | null;
};

type Manifest = {
  version: number;
  generatedAt: string;
  referenceStyle: unknown;
  entries: ManifestEntry[];
};

type OriginalSource = {
  url: string;
  source: "YGOPROG" | "YGOPRODECK" | "KONAMI";
  sourceName: string;
  kind: "BOOSTER" | "PRODUCT";
};

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(
  ROOT,
  "apps/frontend/src/data/pack-assets-manifest.json",
);
const OUTPUT_DIR = path.join(ROOT, "apps/frontend/public/pack-renders/original");
const TEST_FIXTURE_PATTERN = /^(?:VITEST|SMOKE|E2E|AUDIT)-/i;
const BOOSTER_CODES = new Set([
  "PGD",
  "MFC",
  "RDS",
  "FET",
  "TLM",
  "CRV",
  "EEN",
  "SOI",
  "EOJ",
  "POTD",
  "CDIP",
  "STON",
  "FOTB",
  "GLAS",
  "LODT",
  "CRMS",
  "DREV",
  "STBL",
  "STOR",
  "GENF",
  "WGRT",
  "PRIO",
  "SECE",
  "PGL2",
  "CORE",
  "RATE",
  "PEVO",
  "GEIM",
]);

const SPECIAL_PRODUCT_SOURCES: Record<string, OriginalSource> = {
  KC01: {
    url: "https://www.yugioh-card.com/en/wp-content/uploads/2023/04/25th-KaibaSet_01_550.jpg",
    source: "KONAMI",
    sourceName: "Konami official Ultimate Kaiba Set product image",
    kind: "PRODUCT",
  },
  TBC1: {
    url: "https://www.yugioh-card.com/en/wp-content/uploads/2023/01/tubo_EN-all.png",
    source: "KONAMI",
    sourceName: "Konami official The Pot Collection product image",
    kind: "PRODUCT",
  },
  MAMO: {
    url: "https://images.ygoprodeck.com/images/sets/MAMO.jpg",
    source: "YGOPRODECK",
    sourceName: "Magnificent Monsters original product render",
    kind: "PRODUCT",
  },
};

function getOriginalSource(code: string): OriginalSource | null {
  if (BOOSTER_CODES.has(code)) {
    return {
      url: `https://images.ygoprog.com/pack/${code}.jpg`,
      source: "YGOPROG",
      sourceName: "Original sealed booster render",
      kind: "BOOSTER",
    };
  }

  return SPECIAL_PRODUCT_SOURCES[code] ?? null;
}

async function downloadImage(source: OriginalSource) {
  const response = await fetch(source.url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
      "User-Agent": "Yu-Gi-Oh-Duel-Hub-Pack-Asset-Audit/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${source.url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unerwarteter Inhaltstyp ${contentType}: ${source.url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function materialize(entry: ManifestEntry, source: OriginalSource) {
  const input = await downloadImage(source);
  const metadata = await sharp(input).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`${entry.code}: Bildabmessungen konnten nicht gelesen werden`);
  }

  const outputPath = path.join(OUTPUT_DIR, `${entry.code}.webp`);
  const bounds =
    source.kind === "BOOSTER"
      ? { width: 800, height: 1260 }
      : { width: 800, height: 1160 };

  const normalized = await sharp(input, { animated: false })
    .resize(bounds.width, bounds.height, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer();

  const resizedMetadata = await sharp(normalized).metadata();
  const left = Math.max(0, Math.round((840 - (resizedMetadata.width ?? 840)) / 2));
  const top = Math.max(0, Math.round((1300 - (resizedMetadata.height ?? 1300)) / 2));

  await sharp({
    create: {
      width: 840,
      height: 1300,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: normalized, left, top }])
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toFile(outputPath);

  entry.assetStatus = "APPROVED_REAL";
  entry.source = source.source;
  entry.sourceName = source.sourceName;
  entry.sourceUrl = source.url;
  entry.approvedImageUrl = `/pack-renders/original/${entry.code}.webp`;
  entry.licenseNote =
    source.source === "KONAMI"
      ? "Official Konami product image, bundled for stable app display."
      : "Original product packaging reference, bundled for stable app display.";
  entry.dimensions = { width: 840, height: 1300 };
  entry.qualityScore = source.kind === "BOOSTER" ? 90 : 88;
  entry.reviewNote =
    source.kind === "BOOSTER"
      ? "Original sealed booster artwork normalized without redesign."
      : "Original product form retained; no fictional booster wrapper added.";
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const targets = manifest.entries.filter(
    (entry) => getOriginalSource(entry.code) && !TEST_FIXTURE_PATTERN.test(entry.code),
  );

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const entry of targets) {
    const source = getOriginalSource(entry.code);
    if (!source) continue;
    await materialize(entry, source);
    console.log(`${entry.code}: Originalverpackung uebernommen`);
  }

  manifest.entries = manifest.entries.filter(
    (entry) => !TEST_FIXTURE_PATTERN.test(entry.code),
  );
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Original-Packassets erstellt: ${targets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
