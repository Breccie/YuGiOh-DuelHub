import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type ManifestEntry = {
  code: string;
  productType: string;
  assetStatus: string;
  approvedImageUrl: string | null;
};

type PackAssetManifest = {
  entries: ManifestEntry[];
};

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "apps", "frontend", "public");
const manifestPath = path.join(
  root,
  "apps",
  "frontend",
  "src",
  "data",
  "pack-assets-manifest.json",
);
const testCodePattern = /^(?:AUDIT|E2E|SMOKE|VITEST)(?:[-_]|$)/i;
const blockingStatuses = new Set([
  "NEEDS_GENERATION",
  "NEEDS_NORMALIZE",
  "NO_GOOD_SOURCE",
]);

async function main() {
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as PackAssetManifest;
  const failures: string[] = [];
  let validatedLocalAssets = 0;

  for (const entry of manifest.entries) {
    if (testCodePattern.test(entry.code)) {
      failures.push(`${entry.code}: Test- oder Audit-Fixture im Produktmanifest`);
    }

    if (
      entry.productType === "CORE_BOOSTER" &&
      blockingStatuses.has(entry.assetStatus)
    ) {
      failures.push(`${entry.code}: offener Assetstatus ${entry.assetStatus}`);
    }

    if (
      entry.assetStatus === "APPROVED_GENERATED" &&
      !entry.approvedImageUrl?.startsWith("/")
    ) {
      failures.push(`${entry.code}: generiertes Asset ist nicht lokal gebuendelt`);
      continue;
    }

    if (!entry.approvedImageUrl?.startsWith("/")) {
      continue;
    }

    const localPath = path.join(
      publicDir,
      ...entry.approvedImageUrl.split("/").filter(Boolean),
    );

    if (!existsSync(localPath)) {
      failures.push(`${entry.code}: lokale Datei fehlt (${entry.approvedImageUrl})`);
      continue;
    }

    try {
      const metadata = await sharp(localPath).metadata();

      if (!metadata.width || !metadata.height) {
        failures.push(`${entry.code}: Bildabmessungen konnten nicht gelesen werden`);
        continue;
      }

      if (metadata.width < 300 || metadata.height < 500) {
        failures.push(
          `${entry.code}: Bild ist zu klein (${metadata.width}x${metadata.height})`,
        );
      }

      validatedLocalAssets += 1;
    } catch (error) {
      failures.push(
        `${entry.code}: lokale Bilddatei ist unlesbar (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("Pack-Asset-Validierung fehlgeschlagen:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Pack-Asset-Validierung bestanden: ${manifest.entries.length} Manifesteintraege, ${validatedLocalAssets} lokale Bilder.`,
  );
}

void main();
