import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type ManifestEntry = {
  code: string;
  setName: string;
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
  generatedAt: string;
  entries: ManifestEntry[];
};

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(
  ROOT,
  "apps/frontend/src/data/pack-assets-manifest.json",
);
const OUTPUT_DIR = path.join(ROOT, "apps/frontend/public/pack-renders/normalized");
const USER_AGENT = "Yu-Gi-Oh Duel Hub/1.0 pack-asset-materializer";

async function materialize(entry: ManifestEntry) {
  if (!entry.sourceUrl?.startsWith("http")) {
    throw new Error(`${entry.code}: keine entfernte Bildquelle`);
  }

  const response = await fetch(entry.sourceUrl, {
    headers: { Accept: "image/*,*/*;q=0.8", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(35_000),
  });

  if (!response.ok) {
    throw new Error(`${entry.code}: HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const outputPath = path.join(OUTPUT_DIR, `${entry.code}.webp`);
  await sharp(body, { animated: false })
    .rotate()
    .ensureAlpha()
    .trim({
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      threshold: 22,
    })
    .resize({
      width: 840,
      height: 1300,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: false,
    })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(outputPath);

  entry.assetStatus = "APPROVED_REAL";
  entry.approvedImageUrl = `/pack-renders/normalized/${entry.code}.webp`;
  entry.dimensions = { width: 840, height: 1300 };
  entry.qualityScore = Math.max(entry.qualityScore, 80);
  entry.reviewNote = "Audited source normalized and bundled as a local WebP asset.";
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const targets = manifest.entries.filter((entry) => entry.assetStatus === "NEEDS_NORMALIZE");
  const failures: string[] = [];
  let cursor = 0;

  mkdirSync(OUTPUT_DIR, { recursive: true });

  async function worker() {
    while (cursor < targets.length) {
      const entry = targets[cursor++];

      try {
        await materialize(entry);
        console.log(`Normalisiert: ${entry.code}`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()));
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  if (failures.length > 0) {
    console.error(`Nicht normalisiert (${failures.length}):\n${failures.join("\n")}`);
    process.exitCode = 1;
  }

  console.log(`Lokale normalisierte Packassets: ${targets.length - failures.length}/${targets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
