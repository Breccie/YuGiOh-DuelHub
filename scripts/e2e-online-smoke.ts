import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PrismaClient as FrontendPrismaClient } from "@prisma/client";
import { chromium, type Page } from "playwright";
import { PrismaClient as ApiPrismaClient } from "../apps/api/generated/prisma";

const repoRoot = process.cwd();
const frontendPort = Number(process.env.E2E_ONLINE_PORT ?? 3211);
const apiPort = Number(process.env.E2E_API_PORT ?? 3234);
const baseUrl = `http://127.0.0.1:${frontendPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const apiDatabaseUrl =
  process.env.API_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/yugioh_duel_hub?schema=public";
const frontendDatabaseUrl =
  process.env.E2E_ONLINE_FRONTEND_DATABASE_URL ??
  "file:./codex-e2e-online-frontend.db";
const sourceDbPath = path.join(repoRoot, "prisma", "dev.db");
const frontendSmokeDbPath = path.join(
  repoRoot,
  "prisma",
  "codex-e2e-online-frontend.db",
);
const frontendSmokeDatabaseUrl = `file:${frontendSmokeDbPath.replace(/\\/g, "/")}`;

type SmokeUser = {
  duelistId: string;
  password: string;
  displayName: string;
};

function pipeServerOutput(
  label: "api" | "next",
  child: ChildProcessWithoutNullStreams,
) {
  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

function startApiServer() {
  const child = spawn(
    "npx",
    [
      "tsx",
      "--tsconfig",
      "apps/api/tsconfig.json",
      "apps/api/src/server.ts",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_MODE: "online-dev",
        API_DATABASE_URL: apiDatabaseUrl,
        API_PORT: String(apiPort),
        API_HOST: "127.0.0.1",
        CORS_ORIGIN: baseUrl,
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  pipeServerOutput("api", child);
  return child;
}

function startFrontendServer() {
  const child = spawn(
    "npx",
    [
      "next",
      "dev",
      "apps/frontend",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(frontendPort),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_MODE: "online-dev",
        API_BASE_URL: apiBaseUrl,
        DATABASE_URL: frontendDatabaseUrl,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  pipeServerOutput("next", child);
  return child;
}

async function stopProcess(child: ChildProcessWithoutNullStreams | null) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
  } else {
    child.kill();
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 3_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForHttp(url: string, label: string) {
  const deadline = Date.now() + 60_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
      });

      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `${label} did not become ready at ${url}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function resetFrontendSmokeDatabase() {
  await Promise.all([
    rm(frontendSmokeDbPath, { force: true }),
    rm(`${frontendSmokeDbPath}-journal`, { force: true }),
    rm(`${frontendSmokeDbPath}-shm`, { force: true }),
    rm(`${frontendSmokeDbPath}-wal`, { force: true }),
  ]);
  await copyFile(sourceDbPath, frontendSmokeDbPath);
}

async function mirrorCatalogToApiWhenEmpty() {
  const apiPrisma = new ApiPrismaClient({
    datasources: {
      db: {
        url: apiDatabaseUrl,
      },
    },
  });
  const frontendPrisma = new FrontendPrismaClient({
    datasources: {
      db: {
        url: frontendSmokeDatabaseUrl,
      },
    },
  });

  try {
    const [apiCardCount, apiSetCount, apiSetCardCount] = await Promise.all([
      apiPrisma.card.count(),
      apiPrisma.cardSet.count(),
      apiPrisma.setCard.count(),
    ]);

    if (apiCardCount > 0 && apiSetCount > 0 && apiSetCardCount > 0) {
      return;
    }

    const sourceSets = await frontendPrisma.cardSet.findMany({
      where: {
        isOpenable: true,
      },
      orderBy: {
        releaseDate: "asc",
      },
      take: 30,
      include: {
        setCards: {
          orderBy: {
            setCode: "asc",
          },
          take: 12,
          include: {
            card: true,
          },
        },
      },
    });
    const sourceSet = sourceSets.find((set) => set.setCards.length > 0);

    if (!sourceSet) {
      throw new Error(
        "Frontend mirror database has no openable catalog data to copy into the API smoke database.",
      );
    }

    const apiSet = await apiPrisma.cardSet.upsert({
      where: {
        code: sourceSet.code,
      },
      update: {
        name: sourceSet.name,
        releaseDate: sourceSet.releaseDate,
        region: sourceSet.region,
        productType: sourceSet.productType,
        isOpenable: true,
        packSize: Math.max(1, Math.min(sourceSet.packSize, sourceSet.setCards.length)),
        imageUrl: sourceSet.imageUrl,
        notes: sourceSet.notes,
      },
      create: {
        id: sourceSet.id,
        code: sourceSet.code,
        name: sourceSet.name,
        releaseDate: sourceSet.releaseDate,
        region: sourceSet.region,
        productType: sourceSet.productType,
        isOpenable: true,
        packSize: Math.max(1, Math.min(sourceSet.packSize, sourceSet.setCards.length)),
        imageUrl: sourceSet.imageUrl,
        notes: sourceSet.notes,
      },
    });

    for (const sourceSetCard of sourceSet.setCards) {
      const sourceCard = sourceSetCard.card;
      const apiCard = await apiPrisma.card.upsert({
        where: {
          slug: sourceCard.slug,
        },
        update: {
          externalCardId: sourceCard.externalCardId,
          name: sourceCard.name,
          kind: sourceCard.kind,
          attribute: sourceCard.attribute,
          monsterType: sourceCard.monsterType,
          levelRankLink: sourceCard.levelRankLink,
          atk: sourceCard.atk,
          def: sourceCard.def,
          currentOracleText: sourceCard.currentOracleText,
          currentPendulumText: sourceCard.currentPendulumText,
        },
        create: {
          id: sourceCard.id,
          slug: sourceCard.slug,
          externalCardId: sourceCard.externalCardId,
          name: sourceCard.name,
          kind: sourceCard.kind,
          attribute: sourceCard.attribute,
          monsterType: sourceCard.monsterType,
          levelRankLink: sourceCard.levelRankLink,
          atk: sourceCard.atk,
          def: sourceCard.def,
          currentOracleText: sourceCard.currentOracleText,
          currentPendulumText: sourceCard.currentPendulumText,
        },
      });

      await apiPrisma.setCard.upsert({
        where: {
          setId_setCode_rarity: {
            setId: apiSet.id,
            setCode: sourceSetCard.setCode,
            rarity: sourceSetCard.rarity,
          },
        },
        update: {
          cardId: apiCard.id,
          collectorNumber: sourceSetCard.collectorNumber,
          pullWeight: sourceSetCard.pullWeight,
          isReprint: sourceSetCard.isReprint,
        },
        create: {
          id: sourceSetCard.id,
          setId: apiSet.id,
          cardId: apiCard.id,
          setCode: sourceSetCard.setCode,
          rarity: sourceSetCard.rarity,
          collectorNumber: sourceSetCard.collectorNumber,
          pullWeight: sourceSetCard.pullWeight,
          isReprint: sourceSetCard.isReprint,
        },
      });
    }

    console.log(
      `[e2e-online] Mirrored API catalog fixture: ${sourceSet.name} (${sourceSet.setCards.length} cards)`,
    );
  } finally {
    await Promise.all([apiPrisma.$disconnect(), frontendPrisma.$disconnect()]);
  }
}

async function apiJson<T>(
  page: Page,
  apiPath: string,
  method: "GET" | "POST",
  body?: unknown,
) {
  return page.evaluate(
    async ({ apiPath: evaluatedPath, method: evaluatedMethod, body: evaluatedBody }) => {
      const response = await fetch(evaluatedPath, {
        method: evaluatedMethod,
        headers:
          evaluatedBody === undefined
            ? undefined
            : {
                "content-type": "application/json",
              },
        body:
          evaluatedBody === undefined ? undefined : JSON.stringify(evaluatedBody),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          `${evaluatedMethod} ${evaluatedPath} failed with ${response.status}: ${JSON.stringify(
            payload,
          )}`,
        );
      }

      return payload as T;
    },
    { apiPath, method, body },
  );
}

async function assertApiCollectionEntries(
  duelistId: string,
  minimumCopies: number,
) {
  const prisma = new ApiPrismaClient({
    datasources: {
      db: {
        url: apiDatabaseUrl,
      },
    },
  });

  try {
    const user = await prisma.user.findUnique({
      where: {
        duelistId,
      },
      select: {
        id: true,
        activeRunId: true,
      },
    });

    if (!user?.activeRunId) {
      throw new Error(`Online smoke user ${duelistId} has no active run.`);
    }

    const collectionCount = await prisma.collectionEntry.count({
      where: {
        userId: user.id,
        runId: user.activeRunId,
      },
    });

    if (collectionCount < minimumCopies) {
      throw new Error(
        `Expected at least ${minimumCopies} API collection entries, got ${collectionCount}.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupApiSmokeUser(duelistId: string | null) {
  if (!duelistId) {
    return;
  }

  const prisma = new ApiPrismaClient({
    datasources: {
      db: {
        url: apiDatabaseUrl,
      },
    },
  });

  try {
    await prisma.user.deleteMany({
      where: {
        duelistId,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function runOnlineBrowserSmoke(user: SmokeUser) {
  const browser = await chromium.launch({
    headless: process.env.HEADED !== "1",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`[browser] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    console.error(`[browser-pageerror] ${error.message}`);
  });

  try {
    console.log("[e2e-online] Opening login page");
    await page.goto(`${baseUrl}/login`);

    console.log("[e2e-online] Registering through Next -> Fastify proxy");
    await apiJson(page, "/api/auth/register", "POST", {
      duelistId: user.duelistId,
      displayName: user.displayName,
      password: user.password,
      favoriteEra: "GX",
    });

    const session = await apiJson<{ session: { duelistId: string } }>(
      page,
      "/api/auth/session",
      "GET",
    );
    if (session.session.duelistId !== user.duelistId) {
      throw new Error("Online session did not round-trip through the API proxy.");
    }

    console.log("[e2e-online] Verifying server-rendered packs page");
    await page.goto(`${baseUrl}/packs`);
    await page.getByText(user.displayName).first().waitFor({ timeout: 15_000 });

    const dashboard = await apiJson<{
      sets: Array<{ id: string; name: string; cardPoolSize: number }>;
    }>(page, "/api/pack-openings", "GET");
    const set = dashboard.sets.find((candidate) => candidate.cardPoolSize > 0);

    if (!set) {
      throw new Error(
        "Online smoke found no openable pack with cards. Seed/import catalog data first.",
      );
    }

    console.log(`[e2e-online] Opening proxied pack: ${set.name}`);
    const opened = await apiJson<{
      opening: { pulls: unknown[] };
    }>(page, "/api/pack-openings", "POST", {
      setId: set.id,
    });

    if (opened.opening.pulls.length === 0) {
      throw new Error("Online proxied pack opening returned no pulls.");
    }

    await assertApiCollectionEntries(user.duelistId, opened.opening.pulls.length);

    console.log("[e2e-online] Verifying collection page through API proxy");
    await page.goto(`${baseUrl}/collection`);
    await page.getByText("Sammlung").first().waitFor({ timeout: 15_000 });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  let apiServer: ChildProcessWithoutNullStreams | null = null;
  let frontendServer: ChildProcessWithoutNullStreams | null = null;
  const user: SmokeUser = {
    duelistId: `ONLINE-${Date.now()}`,
    password: "Smoke123",
    displayName: "Online Smoke Runner",
  };

  try {
    console.log("[e2e-online] Preparing frontend mirror database");
    await resetFrontendSmokeDatabase();
    await mirrorCatalogToApiWhenEmpty();

    console.log(`[e2e-online] Starting API service at ${apiBaseUrl}`);
    apiServer = startApiServer();
    await waitForHttp(`${apiBaseUrl}/health`, "API service");

    console.log(`[e2e-online] Starting Next online frontend at ${baseUrl}`);
    frontendServer = startFrontendServer();
    await waitForHttp(`${baseUrl}/login`, "Next online frontend");

    await runOnlineBrowserSmoke(user);
    console.log("[e2e-online] Online smoke passed");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Executable doesn't exist")
    ) {
      throw new Error(
        `${error.message}\n\nInstall the browser once with: npx playwright install chromium`,
      );
    }

    throw error;
  } finally {
    await cleanupApiSmokeUser(user.duelistId);
    await stopProcess(frontendServer);
    await stopProcess(apiServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
