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
  const titleStart = titleLines.length === 1 ? 1088 : 1052;
  const title = titleLines
    .map(
      (line, index) =>
        `<text x="420" y="${titleStart + index * 48}" text-anchor="middle" class="title">${escapeXml(line.toUpperCase())}</text>`,
    )
    .join("");

  return Buffer.from(`
    <svg width="840" height="1300" viewBox="0 0 840 1300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="titleBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#03060a" stop-opacity="0"/>
          <stop offset="0.24" stop-color="#03060a" stop-opacity="0.82"/>
          <stop offset="1" stop-color="#03060a" stop-opacity="0.98"/>
        </linearGradient>
        <linearGradient id="logoPlate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 64% 32%)" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#090c12" stop-opacity="0.94"/>
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset="0.48" stop-color="#fff" stop-opacity="0.2"/>
          <stop offset="0.54" stop-color="#fff" stop-opacity="0"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <style>
          .brand { font: 700 27px Georgia, serif; letter-spacing: 6px; fill: #fff1d2; }
          .subbrand { font: 700 12px Arial, sans-serif; letter-spacing: 4px; fill: #f2d9ad; }
          .edition { font: 700 13px Arial, sans-serif; letter-spacing: 1.4px; fill: #f7e7cf; }
          .title { font: 700 36px Georgia, serif; letter-spacing: 1.5px; fill: #fff2d8; paint-order: stroke; stroke: #05070a; stroke-width: 3px; }
          .meta { font: 700 18px Arial, sans-serif; letter-spacing: 3.5px; fill: #ead7b7; }
        </style>
      </defs>
      <rect x="42" y="74" width="756" height="1148" fill="none" stroke="#f4dfb8" stroke-opacity="0.42" stroke-width="3"/>
      <path d="M48 80 L790 80 L758 122 L80 122 Z" fill="#05080d" fill-opacity="0.34"/>
      <path d="M52 932 H788 V1220 H52 Z" fill="url(#titleBand)"/>
      <path d="M0 210 L840 22 L840 164 L0 352 Z" fill="url(#shine)" opacity="0.7"/>

      <path d="M58 98 H315 L292 170 H58 Z" fill="url(#logoPlate)" stroke="#f0d39c" stroke-opacity="0.62" stroke-width="2"/>
      <text x="176" y="132" text-anchor="middle" class="brand">DUEL HUB</text>
      <text x="176" y="154" text-anchor="middle" class="subbrand">TRADING CARD GAME</text>

      <path d="M620 99 H782 V154 L757 174 H620 Z" fill="#090c12" fill-opacity="0.9" stroke="#e7c58b" stroke-opacity="0.58" stroke-width="2"/>
      <text x="701" y="127" text-anchor="middle" class="edition">DEUTSCHE</text>
      <text x="701" y="147" text-anchor="middle" class="edition">AUSGABE</text>

      <path d="M205 960 H635" stroke="#e7c58b" stroke-opacity="0.7" stroke-width="2"/>
      <path d="M420 944 l14 16 -14 16 -14-16z" fill="#0a0d12" stroke="#e7c58b" stroke-opacity="0.75" stroke-width="2"/>
      <text x="420" y="1014" text-anchor="middle" class="subbrand">DUEL HUB BOOSTER</text>
      ${title}
      <text x="420" y="1186" text-anchor="middle" class="meta">${escapeXml(entry.code)} · 9 KARTEN PRO PACK</text>
    </svg>
  `.trim());
}

function createWrapperBaseSvg(hue: number) {
  return Buffer.from(`
    <svg width="840" height="1300" viewBox="0 0 840 1300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#3b3d40"/>
          <stop offset="0.08" stop-color="#f3f0e8"/>
          <stop offset="0.17" stop-color="#85878b"/>
          <stop offset="0.28" stop-color="#fcfaf2"/>
          <stop offset="0.4" stop-color="hsl(${hue} 30% 62%)"/>
          <stop offset="0.51" stop-color="#f4f0e7"/>
          <stop offset="0.64" stop-color="#777a80"/>
          <stop offset="0.78" stop-color="#f8f5ec"/>
          <stop offset="0.91" stop-color="hsl(${hue} 34% 48%)"/>
          <stop offset="1" stop-color="#44474b"/>
        </linearGradient>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#11151c"/>
          <stop offset="0.08" stop-color="hsl(${hue} 35% 22%)"/>
          <stop offset="0.5" stop-color="#080b10"/>
          <stop offset="0.92" stop-color="hsl(${hue} 35% 20%)"/>
          <stop offset="1" stop-color="#11151c"/>
        </linearGradient>
        <pattern id="crimp" width="14" height="64" patternUnits="userSpaceOnUse">
          <rect width="7" height="64" fill="#ffffff" fill-opacity="0.2"/>
          <rect x="7" width="7" height="64" fill="#15181c" fill-opacity="0.26"/>
        </pattern>
        <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-opacity="0.62"/></filter>
      </defs>
      <path d="M24 30 H816 V1270 H24 Z" fill="#05070a" filter="url(#shadow)"/>
      <path d="M28 34 H812 V1266 H28 Z" fill="url(#foil)"/>
      <path d="M42 76 H798 V1224 H42 Z" fill="url(#body)"/>
      <rect x="28" y="34" width="784" height="54" fill="url(#crimp)"/>
      <rect x="28" y="1212" width="784" height="54" fill="url(#crimp)"/>
      <path d="M28 88 H812 M28 1209 H812" stroke="#272a2e" stroke-width="5"/>
      <path d="M42 76 V1224 M798 76 V1224" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
    </svg>
  `.trim());
}

async function compose(entry: ManifestEntry, index: number) {
  const hash = hashText(entry.code);
  const baseName = BASE_ARTWORKS[(hash + index) % BASE_ARTWORKS.length];
  const hue = hash % 360;
  const artwork = await sharp(path.join(BASE_DIR, baseName))
    .resize(756, 1148, { fit: "cover", position: "attention" })
    .modulate({ hue, saturation: 0.92 + (hash % 16) / 100, brightness: 0.9 })
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
      { input: artwork, left: 42, top: 76 },
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
