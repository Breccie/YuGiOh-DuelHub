import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const prismaCliEntry = require.resolve("prisma/build/index.js");

function readDatabaseUrlFromDotEnv() {
  if (!existsSync(".env")) {
    return null;
  }

  const envContent = readFileSync(".env", "utf8");
  const databaseLine = envContent
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("DATABASE_URL="));

  if (!databaseLine) {
    return null;
  }

  return databaseLine
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^['\"]|['\"]$/g, "");
}

function isLocalDevSqliteDatabase(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    return false;
  }

  const normalizedUrl = databaseUrl.toLowerCase();

  return (
    /(^|[:/\\.-])(dev|local|test)\.db($|[?#])/.test(normalizedUrl) &&
    !/(prod|production|staging)/.test(normalizedUrl)
  );
}

const databaseUrl = process.env.DATABASE_URL ?? readDatabaseUrlFromDotEnv() ?? "";
const allowDestructivePush = process.env.ALLOW_DESTRUCTIVE_DB_PUSH === "1";

if (!allowDestructivePush && !isLocalDevSqliteDatabase(databaseUrl)) {
  console.error(
    "Refusing to run `prisma db push --accept-data-loss` outside a local dev SQLite database. " +
      "Set ALLOW_DESTRUCTIVE_DB_PUSH=1 only for an intentional local reset.",
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [prismaCliEntry, "db", "push", "--skip-generate", "--accept-data-loss"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
