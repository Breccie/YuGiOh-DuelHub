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

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(
  ROOT,
  "apps/frontend/src/data/pack-assets-manifest.json",
);
const BASE_DIR = path.join(ROOT, "apps/frontend/public/pack-artwork-bases");
const OUTPUT_DIR = path.join(ROOT, "apps/frontend/public/pack-renders/generated");
const TEST_FIXTURE_PATTERN = /^(?:VITEST|SMOKE|E2E|AUDIT)-/i;
const BASE_ARTWORKS = [
  "ancient-gate.png",
  "elemental-guardian.png",
  "astral-storm.png",
  "prismatic-serpent.png",
];

function hashText(value: string) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapTitle(value: string) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > 24 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function createWrapperSvg(entry: ManifestEntry, hue: number) {
  const titleLines = wrapTitle(entry.setName);
  const titleStart = titleLines.length === 1 ? 1080 : 1045;
  const title = titleLines
    .map(
      (line, index) =>
        `<text x="420" y="${titleStart + index * 52}" text-anchor="middle" class="title">${escapeXml(line.toUpperCase())}</text>`,
    )
    .join("");

  return Buffer.from(`
    <svg width="840" height="1300" viewBox="0 0 840 1300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#15191f"/>
          <stop offset="0.16" stop-color="#9a835d"/>
          <stop offset="0.3" stop-color="#232a32"/>
          <stop offset="0.5" stop-color="hsl(${hue} 38% 48%)"/>
          <stop offset="0.7" stop-color="#252b31"/>
          <stop offset="0.86" stop-color="#aa9167"/>
          <stop offset="1" stop-color="#11151a"/>
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#05080d" stop-opacity="0.2"/>
          <stop offset="0.7" stop-color="#05080d" stop-opacity="0.12"/>
          <stop offset="1" stop-color="#05080d" stop-opacity="0.94"/>
        </linearGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-opacity="0.65"/></filter>
        <style>
          .brand { font: 600 22px Georgia, serif; letter-spacing: 9px; fill: #f0d7a7; }
          .title { font: 600 36px Georgia, serif; letter-spacing: 2px; fill: #f6e6c9; }
          .meta { font: 600 22px Arial, sans-serif; letter-spacing: 5px; fill: #d8c49f; }
        </style>
      </defs>
      <rect x="54" y="52" width="732" height="1196" rx="12" fill="url(#panel)"/>
      <path d="M38 94 H802 M38 112 H802 M38 130 H802 M38 1170 H802 M38 1188 H802 M38 1206 H802" stroke="#dfc89c" stroke-opacity="0.5" stroke-width="3"/>
      <path d="M60 76 l28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 M60 1224 l28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30 28 30 28-30" fill="none" stroke="#bca06d" stroke-opacity="0.75" stroke-width="4"/>
      <rect x="82" y="144" width="676" height="84" rx="8" fill="#05080d" fill-opacity="0.76" stroke="#b59a6a" stroke-opacity="0.5"/>
      <text x="420" y="198" text-anchor="middle" class="brand">DUEL HUB</text>
      <rect x="82" y="970" width="676" height="205" rx="8" fill="#05080d" fill-opacity="0.9" stroke="#b59a6a" stroke-opacity="0.55"/>
      ${title}
      <text x="420" y="1150" text-anchor="middle" class="meta">${escapeXml(entry.code)} · 9 KARTEN</text>
    </svg>
  `.trim());
}

function createWrapperBaseSvg(hue: number) {
  return Buffer.from(`
    <svg width="840" height="1300" viewBox="0 0 840 1300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#15191f"/>
          <stop offset="0.16" stop-color="#9a835d"/>
          <stop offset="0.3" stop-color="#232a32"/>
          <stop offset="0.5" stop-color="hsl(${hue} 38% 48%)"/>
          <stop offset="0.7" stop-color="#252b31"/>
          <stop offset="0.86" stop-color="#aa9167"/>
          <stop offset="1" stop-color="#11151a"/>
        </linearGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-opacity="0.65"/></filter>
      </defs>
      <rect x="24" y="18" width="792" height="1264" rx="30" fill="#080b10" stroke="#07090c" stroke-width="20" filter="url(#shadow)"/>
      <rect x="36" y="30" width="768" height="1240" rx="20" fill="none" stroke="url(#foil)" stroke-width="24"/>
      <rect x="54" y="52" width="732" height="1196" rx="12" fill="#06090e"/>
    </svg>
  `.trim());
}

async function compose(entry: ManifestEntry, index: number) {
  const hash = hashText(entry.code);
  const baseName = BASE_ARTWORKS[(hash + index) % BASE_ARTWORKS.length];
  const hue = hash % 360;
  const artwork = await sharp(path.join(BASE_DIR, baseName))
    .resize(676, 900, { fit: "cover", position: "attention" })
    .modulate({ hue, saturation: 0.88 + (hash % 20) / 100, brightness: 0.84 })
    .webp({ quality: 88 })
    .toBuffer();
  const outputPath = path.join(OUTPUT_DIR, `${entry.code}.webp`);

  await sharp({
    create: {
      width: 840,
      height: 1300,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: createWrapperBaseSvg(hue), left: 0, top: 0 },
      { input: artwork, left: 82, top: 228 },
      { input: createWrapperSvg(entry, hue), left: 0, top: 0 },
    ])
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(outputPath);

  entry.assetStatus = "APPROVED_GENERATED";
  entry.source = "GENERATED";
  entry.sourceName = "Original Duel Hub pack artwork";
  entry.sourceUrl = `/pack-renders/generated/${entry.code}.webp`;
  entry.approvedImageUrl = entry.sourceUrl;
  entry.licenseNote = "Original Duel Hub artwork generated for this project; no official packaging reproduction.";
  entry.dimensions = { width: 840, height: 1300 };
  entry.qualityScore = 100;
  entry.reviewNote = "Deterministically composed Duel Hub wrapper with original artwork.";
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const targets = manifest.entries.filter(
    (entry) =>
      (entry.assetStatus === "NEEDS_GENERATION" ||
        entry.assetStatus === "APPROVED_GENERATED") &&
      !TEST_FIXTURE_PATTERN.test(entry.code),
  );

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [index, entry] of targets.entries()) {
    await compose(entry, index);
  }

  manifest.entries = manifest.entries.filter((entry) => !TEST_FIXTURE_PATTERN.test(entry.code));
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Duel-Hub-Packassets erstellt: ${targets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
