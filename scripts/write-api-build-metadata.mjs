import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(repoRoot, "apps", "api", ".runtime-build-metadata.json");
const migrationsPath = path.join(repoRoot, "apps", "api", "prisma", "migrations");

function readGitSha() {
  if (process.env.RENDER_GIT_COMMIT?.trim()) {
    return process.env.RENDER_GIT_COMMIT.trim();
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "development";
  }
}

function resolveRegion() {
  const configured = process.env.RENDER_REGION?.trim() || process.env.REGION?.trim();

  if (configured) {
    return configured;
  }

  return process.env.RENDER_SERVICE_NAME?.toLowerCase().includes("frankfurt")
    ? "frankfurt"
    : "local";
}

const schemaVersion = readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .at(-1);

if (!schemaVersion) {
  throw new Error("Keine API-Migration für die Buildmetadaten gefunden.");
}

const metadata = {
  buildSha: readGitSha(),
  buildTime: new Date().toISOString(),
  schemaVersion,
  region: resolveRegion(),
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`API-Buildmetadaten: ${outputPath}`);
console.log(JSON.stringify(metadata));
