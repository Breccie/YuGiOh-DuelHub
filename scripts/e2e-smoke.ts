import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { AxeBuilder } from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { chromium, type Locator, type Page, type Response } from "playwright";

const repoRoot = process.cwd();
const port = Number(process.env.E2E_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const databaseUrl = process.env.E2E_DATABASE_URL ?? "file:./codex-e2e-smoke.db";
const sourceDbPath = process.env.E2E_SOURCE_DATABASE_PATH
  ?? path.join(repoRoot, "prisma", "demo.db");
const smokeDbPath = path.join(repoRoot, "prisma", "codex-e2e-smoke.db");

type SeededCatalog = {
  setId: string;
  setName: string;
  cardNames: string[];
};

type SmokeUser = {
  duelistId: string;
  password: string;
  displayName: string;
};

function startDevServer(env: NodeJS.ProcessEnv) {
  const child = spawn(
    "npx",
    ["next", "dev", "apps/frontend", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: repoRoot,
      env,
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  pipeServerOutput(child);
  return child;
}

function pipeServerOutput(child: ChildProcessWithoutNullStreams) {
  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[next] ${chunk}`);
  });
}

async function stopDevServer(child: ChildProcessWithoutNullStreams | null) {
  if (!child) {
    return;
  }

  if (child.exitCode === null && process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
  } else if (child.exitCode === null && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }

  const exited = await new Promise<boolean>((resolve) => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }
    const timeout = setTimeout(resolve, 3_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });

  if (!exited && child.exitCode === null && child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }

  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  child.removeAllListeners();
  child.unref();
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, {
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
    `Dev server did not become ready at ${baseUrl}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function resetSmokeDatabase() {
  await cleanupSmokeDatabase();
  await copyFile(sourceDbPath, smokeDbPath);
}

async function synchronizeSmokeDatabase() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["prisma", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"],
      {
        cwd: repoRoot,
        env: process.env,
        shell: process.platform === "win32",
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Smoke database schema sync failed with exit code ${code}.`));
    });
  });
}

async function cleanupSmokeDatabase() {
  const paths = [
    smokeDbPath,
    `${smokeDbPath}-journal`,
    `${smokeDbPath}-shm`,
    `${smokeDbPath}-wal`,
  ];

  for (const targetPath of paths) {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        await rm(targetPath, { force: true });
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if ((code !== "EBUSY" && code !== "EPERM") || attempt === 20) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
}

async function seedCatalog(): Promise<SeededCatalog> {
  const prisma = new PrismaClient();
  const tag = `smoke-${Date.now()}`;
  const numericTag = Date.now().toString();

  try {
    const set = await prisma.cardSet.create({
      data: {
        code: `${tag}-LOB`,
        name: "Smoke Legend Booster",
        releaseDate: new Date("2002-03-08T00:00:00.000Z"),
        region: "TCG",
        productType: "CORE_BOOSTER",
        isOpenable: true,
        packSize: 3,
      },
    });

    const smokeCards = [
      { name: "Smoke Blue Dragon", externalCardId: `${numericTag}1` },
      { name: "Smoke Spellbook", externalCardId: `${numericTag}2` },
      { name: "Smoke Trap Hole", externalCardId: `${numericTag}3` },
    ];

    for (const [index, smokeCard] of smokeCards.entries()) {
      const card = await prisma.card.create({
        data: {
          slug: `${tag}-card-${index + 1}`,
          externalCardId: smokeCard.externalCardId,
          name: smokeCard.name,
          kind: index === 1 ? "SPELL" : index === 2 ? "TRAP" : "MONSTER",
          currentOracleText: "Smoke test card.",
        },
      });

      await prisma.setCard.create({
        data: {
          setId: set.id,
          cardId: card.id,
          setCode: `${set.code}-${String(index + 1).padStart(3, "0")}`,
          rarity: index === 0 ? "Ultra Rare" : "Common",
          collectorNumber: String(index + 1),
          pullWeight: 1,
        },
      });
    }

    return {
      setId: set.id,
      setName: set.name,
      cardNames: smokeCards.map((card) => card.name),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function runBrowserSmoke(catalog: SeededCatalog) {
  const browser = await chromium.launch({
    headless: process.env.HEADED !== "1",
  });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${baseUrl}/login`);
  const mobileLoginForm = mobilePage.locator("form").first();
  await assertVisible(mobileLoginForm, "mobile login form");
  const mobileLoginBox = await mobileLoginForm.boundingBox();
  if (!mobileLoginBox || mobileLoginBox.y >= 844 || mobileLoginBox.y + 120 > 844) {
    throw new Error("Mobile login form is not available in the first viewport.");
  }
  await assertNoCriticalAccessibilityViolations(mobilePage, "mobile login");
  await mobileContext.close();

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const owner: SmokeUser = {
    duelistId: `SMOKE-${Date.now()}`,
    password: "Smoke12345",
    displayName: "Smoke Runner",
  };
  const friend: SmokeUser = {
    duelistId: `PAL-${Date.now()}`,
    password: "Smoke12345",
    displayName: "Smoke Friend",
  };

  try {
    console.log("[e2e] Opening login page");
    await page.goto(`${baseUrl}/login`);
    await assertVisible(
      page.getByRole("button", { name: "Account anlegen" }).first(),
      "register tab",
    );
    console.log("[e2e] Registering smoke account");
    const failedDashboardResponses: number[] = [];
    const trackDashboardResponse = (response: Response) => {
      if (response.url().endsWith("/api/dashboard/summary") && response.status() >= 400) {
        failedDashboardResponses.push(response.status());
      }
    };
    page.on("response", trackDashboardResponse);
    await page.getByRole("button", { name: "Account anlegen" }).first().click();
    await page.getByLabel("Duelist-ID").fill(owner.duelistId);
    await page.getByLabel("Anzeigename").fill(owner.displayName);
    await page.getByLabel("Lieblings-Ära").fill("DM");
    await page.getByLabel("Passwort").fill(owner.password);
    await page.locator("form").getByRole("button", { name: "Account anlegen" }).click();

    await page.waitForURL(`${baseUrl}/campaigns`, { timeout: 20_000 });
    await assertVisible(page.getByText(owner.displayName).first(), "smoke user");
    await page.waitForTimeout(250);
    page.off("response", trackDashboardResponse);
    if (failedDashboardResponses.length > 0) {
      throw new Error(
        `Campaign selection requested dashboard summary without an active campaign: ${failedDashboardResponses.join(", ")}`,
      );
    }

    console.log("[e2e] Creating the initial campaign");
    await apiJson(page, "/api/v1/runs", "POST", {
      name: "Smoke Progression",
      startingCredits: 2400,
      defaultPackPrice: 100,
      initialSetUnlockCount: 100,
    });

    console.log("[e2e] Verifying dashboard");
    await page.goto(`${baseUrl}/`);
    await assertVisible(
      page.locator('a[href="/packs"]').first(),
      "packs link",
    );

    console.log("[e2e] Verifying packs page");
    await page.goto(`${baseUrl}/packs`);
    await assertVisible(
      page.getByText("Nächster chronologischer Booster").first(),
      "packs page",
    );
    await assertNoCriticalAccessibilityViolations(page, "pack selection");
    const hasSeededSet = await page.evaluate(async (setId) => {
      const response = await fetch("/api/pack-openings");
      const body = await response.json();

      return response.ok && body.sets.some((set: { id: string }) => set.id === setId);
    }, catalog.setId);

    if (!hasSeededSet) {
      throw new Error("Seeded smoke set was not returned by the pack dashboard API.");
    }

    console.log("[e2e] Opening a pack through app-origin API");
    const openPackResult = await page.evaluate(async (setId) => {
      const response = await fetch("/api/pack-openings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ setId }),
      });
      const body = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    }, catalog.setId);

    if (!openPackResult.ok) {
      throw new Error(
        `Pack opening failed with ${openPackResult.status}: ${JSON.stringify(openPackResult.body)}`,
      );
    }

    if (openPackResult.body.opening.pulls.length < 3) {
      throw new Error(
        `Expected at least 3 pack pulls, got ${openPackResult.body.opening.pulls.length}`,
      );
    }

    console.log("[e2e] Verifying collection page");
    await page.goto(`${baseUrl}/collection`);
    await assertVisible(page.getByText("Karten").first(), "collection page");
    await assertNoCriticalAccessibilityViolations(page, "collection");
    await assertCollectionEntries(owner.duelistId, 3);

    console.log("[e2e] Creating a deck and validating draft export protection");
    const deck = await apiJson<{ deck: { id: string; name: string } }>(
      page,
      "/api/decks",
      "POST",
      { name: "Smoke Deck" },
    );
    const firstCollectionCard = await getFirstCollectionCard(owner.duelistId);
    await apiJson<{ deckCard: { id: string } }>(
      page,
      `/api/decks/${deck.deck.id}/cards`,
      "POST",
      {
        cardId: firstCollectionCard.cardId,
        section: "MAIN",
        quantity: 1,
      },
    );
    const deckExportAttempt = await page.evaluate(async (deckId) => {
      const response = await fetch(`/api/decks/${deckId}/export`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ fileName: "smoke-deck.ydk" }),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }, deck.deck.id);

    if (
      deckExportAttempt.status !== 409 ||
      deckExportAttempt.body.errorDetail?.code !== "deck_not_playable"
    ) {
      throw new Error(
        `Draft export was not rejected as expected: ${JSON.stringify(deckExportAttempt)}`,
      );
    }

    console.log("[e2e] Registering a friend and joining the run");
    const friendContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const friendPage = await friendContext.newPage();
    friendPage.setDefaultTimeout(15_000);

    try {
      await friendPage.goto(`${baseUrl}/login`);
      await apiJson<{ session: { userId: string } }>(
        friendPage,
        "/api/auth/register",
        "POST",
        {
          duelistId: friend.duelistId,
          displayName: friend.displayName,
          favoriteEra: "DM",
          password: friend.password,
        },
      );
      const friendRequest = await apiJson<{ request: { id: string } }>(
        page,
        "/api/friends/requests",
        "POST",
        { duelistId: friend.duelistId },
      );
      await apiJson<{ request: { status: string } }>(
        friendPage,
        `/api/friends/requests/${friendRequest.request.id}`,
        "PATCH",
        { action: "accept" },
      );
    } finally {
      await friendContext.close();
    }

    const runId = await addFriendToOwnerRun(owner.duelistId, friend.duelistId);
    await assertFriendship(owner.duelistId, friend.duelistId);

    console.log("[e2e] Verifying deck page");
    await page.goto(`${baseUrl}/decks`);
    await assertVisible(page.getByText("Decks").first(), "decks page");

    console.log("[e2e] Creating a deck through the library UI");
    await page.getByRole("button", { name: "Neues Deck erstellen" }).click();
    await page.getByRole("textbox", { name: "Deckname" }).fill("Smoke UI Deck");
    await page.getByRole("button", { name: "Erstellen", exact: true }).click();
    await assertVisible(
      page.getByRole("heading", { name: "Smoke UI Deck" }),
      "newly created deck heading",
    );
    await assertVisible(
      page.getByText("Smoke UI Deck", { exact: true }).first(),
      "newly created deck library item",
    );

    console.log("[e2e] Verifying duel page");
    await page.goto(`${baseUrl}/duels`);
    await assertVisible(
      page.getByText("Duellanfrage senden").first(),
      "duels page",
    );

    console.log("[e2e] Verifying auction workspace");
    await page.goto(`${baseUrl}/trade/auctions`);
    await assertVisible(
      page.getByRole("heading", { name: "Kartenauktionen" }),
      "auction workspace",
    );
    await assertNoCriticalAccessibilityViolations(page, "auction workspace");

    console.log("[e2e] Verifying tournament page");
    await page.goto(`${baseUrl}/tournaments`);
    await assertVisible(page.getByText("Turniere").first(), "tournaments page");
    await assertNoCriticalAccessibilityViolations(page, "tournaments");

    console.log("[e2e] Creating and completing a two-player tournament");
    const tournament = await apiJson<{
      tournament: {
        overview: {
          id: string;
        };
      };
    }>(page, "/api/tournaments", "POST", {
      title: "Smoke Cup",
      formatLabel: "History Smoke",
    });
    const tournamentId = tournament.tournament.overview.id;

    await apiJson(page, `/api/tournaments/${tournamentId}/participants`, "POST", {
      duelistId: friend.duelistId,
    });
    await acceptTournamentParticipant(tournamentId, friend.duelistId);
    await apiJson(page, `/api/tournaments/${tournamentId}/rounds`, "POST");
    const match = await getFirstTournamentMatch(tournamentId);
    const winnerId = match.playerOneId;

    await apiJson(page, `/api/tournaments/matches/${match.id}`, "PATCH", {
      action: "adminConfirm",
      playerOneScore: 2,
      playerTwoScore: 0,
      winnerId,
      notes: "Smoke result",
    });
    await apiJson(page, `/api/tournaments/${tournamentId}/complete`, "POST");
    await assertTournamentCompleted(tournamentId);

    console.log("[e2e] Granting and claiming a reward pack");
    const reward = await apiJson<{
      id: string;
      status: string;
    }>(page, `/api/v1/runs/${runId}/rewards`, "POST", {
      recipientDuelistId: owner.duelistId,
      amountCredits: 25,
      packSetId: catalog.setId,
      packQuantity: 1,
      reason: "Smoke reward",
    });
    const claim = await apiJson<{
      reward: { status: string };
      openings: Array<{ pulls: unknown[] }>;
    }>(page, `/api/v1/runs/${runId}/rewards/${reward.id}/claim`, "POST");

    const claimedPullCount = claim.openings.reduce(
      (total, opening) => total + opening.pulls.length,
      0,
    );

    if (claim.reward.status !== "CLAIMED" || claimedPullCount < 3) {
      throw new Error("Reward pack claim did not create a claimed opening.");
    }

    console.log("[e2e] Verifying progression/promos page");
    await page.goto(`${baseUrl}/packs/promos`);
    await assertVisible(page.getByText("Historische Promos").first(), "progression page");
  } finally {
    await context.close();
    await browser.close();
  }
}

async function assertVisible(locator: Locator, label: string) {
  await locator.waitFor({ state: "visible" });

  if (!(await locator.isVisible())) {
    throw new Error(`${label} was not visible.`);
  }
}

async function assertNoCriticalAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const criticalViolations = results.violations.filter(
    (violation) => violation.impact === "critical",
  );

  if (criticalViolations.length > 0) {
    const details = criticalViolations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target).slice(0, 6),
    }));
    throw new Error(
      `${label} has critical WCAG violations: ${JSON.stringify(details)}`,
    );
  }
}

async function apiJson<T>(
  page: Page,
  apiPath: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
) {
  const result = await page.evaluate(
    async ({ apiPath, method, body }) => {
      const response = await fetch(apiPath, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      return {
        ok: response.ok,
        status: response.status,
        payload,
      };
    },
    { apiPath, method, body },
  );

  if (!result.ok) {
    throw new Error(
      `${method} ${apiPath} failed with ${result.status}: ${JSON.stringify(result.payload)}`,
    );
  }

  return result.payload as T;
}

async function getFirstCollectionCard(duelistId: string) {
  const prisma = new PrismaClient();

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
      throw new Error(`Smoke user ${duelistId} has no active run.`);
    }

    const entry = await prisma.collectionEntry.findFirst({
      where: {
        userId: user.id,
        runId: user.activeRunId,
      },
      orderBy: {
        acquiredAt: "asc",
      },
      select: {
        cardId: true,
      },
    });

    if (!entry) {
      throw new Error(`Smoke user ${duelistId} has no collection entries.`);
    }

    return entry;
  } finally {
    await prisma.$disconnect();
  }
}

async function addFriendToOwnerRun(ownerDuelistId: string, friendDuelistId: string) {
  const prisma = new PrismaClient();

  try {
    const [owner, friend] = await Promise.all([
      prisma.user.findUnique({
        where: {
          duelistId: ownerDuelistId,
        },
      }),
      prisma.user.findUnique({
        where: {
          duelistId: friendDuelistId,
        },
      }),
    ]);

    if (!owner?.activeRunId || !friend) {
      throw new Error("Smoke users or owner active run were missing.");
    }

    await prisma.runMembership.upsert({
      where: {
        runId_userId: {
          runId: owner.activeRunId,
          userId: friend.id,
        },
      },
      create: {
        runId: owner.activeRunId,
        userId: friend.id,
        role: "PLAYER",
      },
      update: {
        role: "PLAYER",
      },
    });
    await prisma.user.update({
      where: {
        id: friend.id,
      },
      data: {
        activeRunId: owner.activeRunId,
      },
    });
    await prisma.creditWallet.upsert({
      where: {
        runId_userId: {
          runId: owner.activeRunId,
          userId: friend.id,
        },
      },
      create: {
        runId: owner.activeRunId,
        userId: friend.id,
        balance: 2400,
      },
      update: {},
    });

    return owner.activeRunId;
  } finally {
    await prisma.$disconnect();
  }
}

async function assertFriendship(ownerDuelistId: string, friendDuelistId: string) {
  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      where: {
        duelistId: {
          in: [ownerDuelistId, friendDuelistId],
        },
      },
      select: {
        id: true,
      },
    });

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        requesterId: {
          in: users.map((user) => user.id),
        },
        addresseeId: {
          in: users.map((user) => user.id),
        },
      },
    });

    if (!friendship) {
      throw new Error("Expected accepted friendship between smoke users.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function acceptTournamentParticipant(
  tournamentId: string,
  duelistId: string,
) {
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: {
        duelistId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new Error(`Tournament participant ${duelistId} not found.`);
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
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function getFirstTournamentMatch(tournamentId: string) {
  const prisma = new PrismaClient();

  try {
    const match = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId,
        playerTwoId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        playerOneId: true,
        playerTwoId: true,
      },
    });

    if (!match) {
      throw new Error("Expected a two-player tournament match.");
    }

    return match;
  } finally {
    await prisma.$disconnect();
  }
}

async function assertTournamentCompleted(tournamentId: string) {
  const prisma = new PrismaClient();

  try {
    const tournament = await prisma.tournament.findUnique({
      where: {
        id: tournamentId,
      },
      select: {
        status: true,
        matches: {
          select: {
            status: true,
            winnerId: true,
          },
        },
      },
    });

    if (
      tournament?.status !== "COMPLETED" ||
      tournament.matches.some((match) => match.status !== "COMPLETED" || !match.winnerId)
    ) {
      throw new Error("Expected completed tournament with completed matches.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function assertCollectionEntries(duelistId: string, minimumCopies: number) {
  const prisma = new PrismaClient();

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
      throw new Error(`Smoke user ${duelistId} has no active run.`);
    }

    const collectionCount = await prisma.collectionEntry.count({
      where: {
        userId: user.id,
        runId: user.activeRunId,
      },
    });

    if (collectionCount < minimumCopies) {
      throw new Error(
        `Expected at least ${minimumCopies} collection entries, got ${collectionCount}.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  process.env.DATABASE_URL = databaseUrl;
  const env = {
    ...process.env,
    APP_MODE: "desktop-demo",
    DATABASE_URL: databaseUrl,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  let server: ChildProcessWithoutNullStreams | null = null;

  try {
    console.log(`[e2e] Preparing smoke database ${databaseUrl}`);
    await resetSmokeDatabase();
    await synchronizeSmokeDatabase();
    const catalog = await seedCatalog();

    console.log(`[e2e] Starting Next dev server at ${baseUrl}`);
    server = startDevServer(env);
    await waitForServer();

    console.log("[e2e] Running browser smoke");
    await runBrowserSmoke(catalog);
    console.log("[e2e] Smoke passed");
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
    await stopDevServer(server);
    await cleanupSmokeDatabase();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
