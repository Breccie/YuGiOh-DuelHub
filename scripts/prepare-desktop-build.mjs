import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = process.cwd();
const frontendRoot = resolve(workspaceRoot, "apps", "frontend");
const standaloneDir = resolve(frontendRoot, ".next", "standalone");
const standaloneStaticDir = resolve(standaloneDir, ".next", "static");
const standalonePublicDir = resolve(standaloneDir, "public");
const standaloneAssetsDir = resolve(standaloneDir, "desktop-assets");
const sourceStaticDir = resolve(frontendRoot, ".next", "static");
const sourcePublicDir = resolve(frontendRoot, "public");
const sourceSeedDb = resolve(workspaceRoot, "prisma", "demo.db");
const targetSeedDb = resolve(standaloneAssetsDir, "seed.db");

function findSymlinkEntries(directory) {
  const symlinkEntries = [];

  for (const entry of readdirSync(directory)) {
    const entryPath = resolve(directory, entry);
    const entryStats = lstatSync(entryPath);

    if (entryStats.isSymbolicLink()) {
      symlinkEntries.push(entryPath);
      continue;
    }

    if (entryStats.isDirectory()) {
      symlinkEntries.push(...findSymlinkEntries(entryPath));
    }
  }

  return symlinkEntries;
}

function dereferenceSymlinkEntry(entryPath) {
  const realSourcePath = realpathSync(entryPath);
  const sourceStats = statSync(realSourcePath);

  rmSync(entryPath, { force: true, recursive: true });

  if (sourceStats.isDirectory()) {
    cpSync(realSourcePath, entryPath, { recursive: true });
    return;
  }

  cpSync(realSourcePath, entryPath);
}

if (!existsSync(standaloneDir)) {
  throw new Error(
    "Missing `apps/frontend/.next/standalone`. Run `next build apps/frontend` before preparing the desktop bundle.",
  );
}

rmSync(standaloneStaticDir, { force: true, recursive: true });
rmSync(standalonePublicDir, { force: true, recursive: true });
rmSync(standaloneAssetsDir, { force: true, recursive: true });

mkdirSync(resolve(standaloneStaticDir, ".."), { recursive: true });
mkdirSync(standaloneAssetsDir, { recursive: true });

cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });

if (existsSync(sourcePublicDir)) {
  cpSync(sourcePublicDir, standalonePublicDir, { recursive: true });
}

if (!existsSync(sourceSeedDb)) {
  throw new Error(
    "Missing `prisma/demo.db`. Run `npm run db:seed:demo` before packaging the desktop app.",
  );
}

cpSync(sourceSeedDb, targetSeedDb);

const symlinkEntries = findSymlinkEntries(standaloneDir);

for (const entryPath of symlinkEntries) {
  dereferenceSymlinkEntry(entryPath);
}

console.log(
  `Prepared standalone desktop bundle${symlinkEntries.length > 0 ? ` and resolved ${symlinkEntries.length} symlink(s)` : ""}.`,
);
