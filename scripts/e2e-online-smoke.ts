import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
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

type SmokeActor = SmokeUser & {
  page: Page;
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
        COOKIE_SECRET:
          process.env.COOKIE_SECRET ??
          "codex-online-smoke-cookie-secret-at-least-32-chars",
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

async function withApiPrisma<T>(
  callback: (prisma: ApiPrismaClient) => Promise<T>,
) {
  const prisma = new ApiPrismaClient({
    datasources: {
      db: {
        url: apiDatabaseUrl,
      },
    },
  });

  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function mirrorCatalogToApiWhenEmpty() {
  const frontendPrisma = new FrontendPrismaClient({
    datasources: {
      db: {
        url: frontendSmokeDatabaseUrl,
      },
    },
  });

  try {
    await withApiPrisma(async (apiPrisma) => {
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
    });
  } finally {
    await frontendPrisma.$disconnect();
  }
}

async function apiJson<T>(
  page: Page,
  apiPath: string,
  method: "GET" | "POST" | "PATCH",
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

async function registerActor(actor: SmokeActor) {
  console.log(`[e2e-online] Registering ${actor.duelistId} through Next -> Fastify proxy`);
  await actor.page.goto(`${baseUrl}/login`);
  await apiJson(actor.page, "/api/auth/register", "POST", {
    duelistId: actor.duelistId,
    displayName: actor.displayName,
    password: actor.password,
    favoriteEra: "GX",
  });

  const session = await apiJson<{ session: { duelistId: string } }>(
    actor.page,
    "/api/auth/session",
    "GET",
  );

  if (session.session.duelistId !== actor.duelistId) {
    throw new Error(`Online session did not round-trip for ${actor.duelistId}.`);
  }
}

async function joinSecondaryActorToPrimaryRun(primary: SmokeActor, secondary: SmokeActor) {
  await withApiPrisma(async (prisma) => {
    const [owner, member] = await Promise.all([
      prisma.user.findUnique({
        where: {
          duelistId: primary.duelistId,
        },
      }),
      prisma.user.findUnique({
        where: {
          duelistId: secondary.duelistId,
        },
      }),
    ]);

    if (!owner?.activeRunId || !member) {
      throw new Error("Online smoke could not find both users with an active owner run.");
    }

    const run = await prisma.playGroupRun.findUnique({
      where: {
        id: owner.activeRunId,
      },
    });

    if (!run) {
      throw new Error("Online smoke owner run was not found.");
    }

    await prisma.runMembership.upsert({
      where: {
        runId_userId: {
          runId: run.id,
          userId: member.id,
        },
      },
      update: {
        role: "PLAYER",
      },
      create: {
        runId: run.id,
        userId: member.id,
        role: "PLAYER",
      },
    });
    await prisma.user.update({
      where: {
        id: member.id,
      },
      data: {
        activeRunId: run.id,
      },
    });
    await prisma.creditWallet.upsert({
      where: {
        runId_userId: {
          runId: run.id,
          userId: member.id,
        },
      },
      update: {},
      create: {
        runId: run.id,
        userId: member.id,
        balance: run.startingCredits,
      },
    });

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          {
            requesterId: owner.id,
            addresseeId: member.id,
          },
          {
            requesterId: member.id,
            addresseeId: owner.id,
          },
        ],
      },
    });

    if (friendship) {
      await prisma.friendship.update({
        where: {
          id: friendship.id,
        },
        data: {
          requesterId: owner.id,
          addresseeId: member.id,
          status: "ACCEPTED",
        },
      });
    } else {
      await prisma.friendship.create({
        data: {
          requesterId: owner.id,
          addresseeId: member.id,
          status: "ACCEPTED",
        },
      });
    }
  });
}

async function openPackThroughProxy(actor: SmokeActor) {
  console.log(`[e2e-online] Opening proxied pack for ${actor.duelistId}`);
  const dashboard = await apiJson<{
    sets: Array<{ id: string; name: string; cardPoolSize: number }>;
  }>(actor.page, "/api/pack-openings", "GET");
  const set = dashboard.sets.find((candidate) => candidate.cardPoolSize > 0);

  if (!set) {
    throw new Error(
      "Online smoke found no openable pack with cards. Seed/import catalog data first.",
    );
  }

  const opened = await apiJson<{
    opening: { pulls: unknown[] };
  }>(actor.page, "/api/pack-openings", "POST", {
    setId: set.id,
  });

  if (opened.opening.pulls.length === 0) {
    throw new Error(`Online proxied pack opening returned no pulls for ${actor.duelistId}.`);
  }

  return opened.opening.pulls.length;
}

async function assertApiCollectionEntries(
  duelistId: string,
  minimumCopies: number,
) {
  await withApiPrisma(async (prisma) => {
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
        `Expected at least ${minimumCopies} API collection entries for ${duelistId}, got ${collectionCount}.`,
      );
    }
  });
}

async function getTradeFixture(primary: SmokeActor, secondary: SmokeActor) {
  return withApiPrisma(async (prisma) => {
    const [owner, member] = await Promise.all([
      prisma.user.findUnique({
        where: {
          duelistId: primary.duelistId,
        },
      }),
      prisma.user.findUnique({
        where: {
          duelistId: secondary.duelistId,
        },
      }),
    ]);

    if (!owner?.activeRunId || !member?.activeRunId || owner.activeRunId !== member.activeRunId) {
      throw new Error("Online smoke users are not in the same active run.");
    }

    const [ownerEntry, memberEntry] = await Promise.all([
      prisma.collectionEntry.findFirst({
        where: {
          userId: owner.id,
          runId: owner.activeRunId,
          lockState: "AVAILABLE",
        },
        orderBy: {
          acquiredAt: "asc",
        },
      }),
      prisma.collectionEntry.findFirst({
        where: {
          userId: member.id,
          runId: owner.activeRunId,
          lockState: "AVAILABLE",
        },
        orderBy: {
          acquiredAt: "asc",
        },
      }),
    ]);

    if (!ownerEntry || !memberEntry) {
      throw new Error("Online smoke needs one available collection entry per trade user.");
    }

    return {
      runId: owner.activeRunId,
      ownerUserId: owner.id,
      memberUserId: member.id,
      ownerEntryId: ownerEntry.id,
      memberEntryId: memberEntry.id,
    };
  });
}

async function smokeTrade(primary: SmokeActor, secondary: SmokeActor) {
  const fixture = await getTradeFixture(primary, secondary);

  console.log("[e2e-online] Creating and completing proxied trade");
  const created = await apiJson<{ trade: { id: string; status: string } }>(
    primary.page,
    "/api/trades",
    "POST",
    {
      responderDuelistId: secondary.duelistId,
      note: "Online smoke trade",
      offeredEntryIds: [fixture.ownerEntryId],
      requestedEntryIds: [fixture.memberEntryId],
    },
  );

  if (created.trade.status !== "PENDING") {
    throw new Error(`Expected created trade to be PENDING, got ${created.trade.status}.`);
  }

  await apiJson(secondary.page, `/api/trades/${created.trade.id}/decision`, "POST", {
    action: "accept",
  });
  await apiJson(primary.page, `/api/trades/${created.trade.id}/decision`, "POST", {
    action: "confirmCompletion",
  });
  const completed = await apiJson<{ trade: { status: string } }>(
    secondary.page,
    `/api/trades/${created.trade.id}/decision`,
    "POST",
    {
      action: "confirmCompletion",
    },
  );

  if (completed.trade.status !== "COMPLETED") {
    throw new Error(`Expected trade to complete, got ${completed.trade.status}.`);
  }

  await withApiPrisma(async (prisma) => {
    const [ownerEntry, memberEntry] = await Promise.all([
      prisma.collectionEntry.findUnique({
        where: {
          id: fixture.ownerEntryId,
        },
      }),
      prisma.collectionEntry.findUnique({
        where: {
          id: fixture.memberEntryId,
        },
      }),
    ]);

    if (ownerEntry?.userId !== fixture.memberUserId || ownerEntry.lockState !== "AVAILABLE") {
      throw new Error("Owner trade card was not transferred to the secondary user.");
    }

    if (memberEntry?.userId !== fixture.ownerUserId || memberEntry.lockState !== "AVAILABLE") {
      throw new Error("Secondary trade card was not transferred to the primary user.");
    }
  });
}

async function createSmokeRewardConfig(tournamentId: string) {
  return withApiPrisma(async (prisma) => {
    const tournament = await prisma.tournament.findUnique({
      where: {
        id: tournamentId,
      },
      select: {
        runId: true,
      },
    });

    if (!tournament?.runId) {
      throw new Error("Online smoke tournament has no run.");
    }

    const latestCheckpoint = await prisma.runProgressionCheckpoint.findFirst({
      where: {
        runId: tournament.runId,
      },
      orderBy: {
        sequence: "desc",
      },
      select: {
        sequence: true,
      },
    });
    const checkpoint = await prisma.runProgressionCheckpoint.create({
      data: {
        runId: tournament.runId,
        sequence: (latestCheckpoint?.sequence ?? 0) + 1,
        title: "Online Smoke Reward",
        description: "Automated reward fixture for the online E2E smoke.",
        requiredTournamentId: tournamentId,
        status: "READY",
      },
    });

    await prisma.runProgressionUnlock.create({
      data: {
        checkpointId: checkpoint.id,
        runId: tournament.runId,
        type: "REWARD",
        rewardConfig: {
          placements: [
            {
              rank: 1,
              amountCredits: 77,
              note: "online smoke reward",
            },
          ],
        },
      },
    });

    return tournament.runId;
  });
}

async function acceptInvitedTournamentParticipant(
  tournamentId: string,
  duelistId: string,
) {
  await withApiPrisma(async (prisma) => {
    const user = await prisma.user.findUnique({
      where: {
        duelistId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new Error(`Tournament invitee ${duelistId} was not found.`);
    }

    await prisma.tournamentParticipant.update({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id,
        },
      },
      data: {
        status: "ACCEPTED",
        joinedAt: new Date(),
        seed: 2,
      },
    });
  });
}

async function getFirstPlayableMatch(tournamentId: string) {
  return withApiPrisma(async (prisma) => {
    const match = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId,
        playerTwoId: {
          not: null,
        },
      },
      orderBy: {
        tableNumber: "asc",
      },
    });

    if (!match?.playerTwoId) {
      throw new Error("Online smoke tournament did not create a playable match.");
    }

    return match;
  });
}

async function smokeTournament(primary: SmokeActor, secondary: SmokeActor) {
  console.log("[e2e-online] Creating tournament, reporting score, confirming, and granting rewards");
  const created = await apiJson<{
    tournament: { overview: { id: string } };
  }>(primary.page, "/api/tournaments", "POST", {
    title: "Online Smoke Cup",
    description: "External EDOPro result confirmation smoke.",
    formatLabel: "Classic Progression",
  });
  const tournamentId = created.tournament.overview.id;

  await apiJson(primary.page, `/api/tournaments/${tournamentId}/participants`, "POST", {
    duelistId: secondary.duelistId,
  });
  await acceptInvitedTournamentParticipant(tournamentId, secondary.duelistId);
  await createSmokeRewardConfig(tournamentId);

  await apiJson(primary.page, `/api/tournaments/${tournamentId}/rounds`, "POST");
  const match = await getFirstPlayableMatch(tournamentId);

  const playerPages = new Map<string, Page>();
  await withApiPrisma(async (prisma) => {
    const [owner, member] = await Promise.all([
      prisma.user.findUnique({
        where: {
          duelistId: primary.duelistId,
        },
        select: {
          id: true,
        },
      }),
      prisma.user.findUnique({
        where: {
          duelistId: secondary.duelistId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!owner || !member) {
      throw new Error("Online smoke tournament users disappeared.");
    }

    playerPages.set(owner.id, primary.page);
    playerPages.set(member.id, secondary.page);
  });

  const reporterPage = playerPages.get(match.playerOneId);
  const confirmerPage = playerPages.get(match.playerTwoId);

  if (!reporterPage || !confirmerPage) {
    throw new Error("Online smoke could not map match players to browser sessions.");
  }

  await apiJson(reporterPage, `/api/tournaments/matches/${match.id}`, "PATCH", {
    action: "report",
    playerOneScore: 2,
    playerTwoScore: 0,
    winnerId: match.playerOneId,
    notes: "Reported after external EDOPro match.",
  });
  await apiJson(confirmerPage, `/api/tournaments/matches/${match.id}`, "PATCH", {
    action: "confirm",
  });
  const completed = await apiJson<{
    tournament: { overview: { status: string } };
  }>(primary.page, `/api/tournaments/${tournamentId}/complete`, "POST");

  if (completed.tournament.overview.status !== "COMPLETED") {
    throw new Error(
      `Expected tournament to be COMPLETED, got ${completed.tournament.overview.status}.`,
    );
  }

  await withApiPrisma(async (prisma) => {
    const [matchAfter, rewardGrant, rewardLedger] = await Promise.all([
      prisma.tournamentMatch.findUnique({
        where: {
          id: match.id,
        },
      }),
      prisma.rewardGrant.findFirst({
        where: {
          recipientId: match.playerOneId,
          amountCredits: 77,
          reason: {
            startsWith: `TOURNAMENT_REWARD | ${tournamentId}`,
          },
        },
      }),
      prisma.creditLedgerEntry.findFirst({
        where: {
          userId: match.playerOneId,
          amount: 77,
          source: "TOURNAMENT_REWARD",
        },
      }),
    ]);

    if (matchAfter?.status !== "COMPLETED" || matchAfter.confirmedById !== match.playerTwoId) {
      throw new Error("Confirmed external tournament score was not persisted.");
    }

    if (!rewardGrant || !rewardLedger) {
      throw new Error("Tournament completion did not grant the configured online reward.");
    }
  });
}

async function cleanupApiSmokeUsers(duelistIds: string[]) {
  await withApiPrisma(async (prisma) => {
    await prisma.user.deleteMany({
      where: {
        duelistId: {
          in: duelistIds,
        },
      },
    });
  });
}

async function runOnlineBrowserSmoke(primary: SmokeUser, secondary: SmokeUser) {
  const browser = await chromium.launch({
    headless: process.env.HEADED !== "1",
  });
  const primaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const secondaryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const primaryActor: SmokeActor = {
    ...primary,
    page: await primaryContext.newPage(),
  };
  const secondaryActor: SmokeActor = {
    ...secondary,
    page: await secondaryContext.newPage(),
  };

  for (const page of [primaryActor.page, secondaryActor.page]) {
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[browser] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      console.error(`[browser-pageerror] ${error.message}`);
    });
  }

  try {
    await registerActor(primaryActor);
    await registerActor(secondaryActor);

    console.log("[e2e-online] Verifying server-rendered packs page");
    await primaryActor.page.goto(`${baseUrl}/packs`);
    await primaryActor.page
      .getByText(primaryActor.displayName)
      .first()
      .waitFor({ timeout: 15_000 });

    await apiJson(primaryActor.page, "/api/pack-openings", "GET");
    await joinSecondaryActorToPrimaryRun(primaryActor, secondaryActor);

    const primaryPulls = await openPackThroughProxy(primaryActor);
    const secondaryPulls = await openPackThroughProxy(secondaryActor);
    await assertApiCollectionEntries(primaryActor.duelistId, primaryPulls);
    await assertApiCollectionEntries(secondaryActor.duelistId, secondaryPulls);

    console.log("[e2e-online] Verifying collection page through API proxy");
    await primaryActor.page.goto(`${baseUrl}/collection`);
    await primaryActor.page.getByText("Sammlung").first().waitFor({ timeout: 15_000 });

    await smokeTrade(primaryActor, secondaryActor);
    await smokeTournament(primaryActor, secondaryActor);
  } finally {
    await primaryContext.close();
    await secondaryContext.close();
    await browser.close();
  }
}

async function main() {
  let apiServer: ChildProcessWithoutNullStreams | null = null;
  let frontendServer: ChildProcessWithoutNullStreams | null = null;
  const suffix = Date.now();
  const primary: SmokeUser = {
    duelistId: `ONLINE-A-${suffix}`,
    password: "Smoke123",
    displayName: "Online Smoke Host",
  };
  const secondary: SmokeUser = {
    duelistId: `ONLINE-B-${suffix}`,
    password: "Smoke123",
    displayName: "Online Smoke Player",
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

    await runOnlineBrowserSmoke(primary, secondary);
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
    await cleanupApiSmokeUsers([primary.duelistId, secondary.duelistId]);
    await stopProcess(frontendServer);
    await stopProcess(apiServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
