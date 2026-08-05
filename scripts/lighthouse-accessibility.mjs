import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const repoRoot = process.cwd();
const port = Number(process.env.LIGHTHOUSE_PORT ?? 3220);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactDir = path.join(repoRoot, "artifacts", "lighthouse");
const routes = ["/campaigns", "/packs", "/collection", "/decks", "/tournaments"];
const viewports = [
  {
    name: "desktop",
    formFactor: "desktop",
    screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1 },
  },
  {
    name: "mobile",
    formFactor: "mobile",
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1 },
  },
];

function startServer() {
  return spawn(
    "npx",
    ["next", "start", "apps/frontend", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_MODE: "desktop-demo",
        DATABASE_URL: "file:./demo.db",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

async function stopChrome(chrome) {
  if (!chrome) return;

  if (!chrome.pid) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(chrome.pid), "/T", "/F"], {
      shell: true,
      stdio: "ignore",
    });
    await Promise.race([
      new Promise((resolve) => killer.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    return;
  }

  try {
    process.kill(chrome.pid, "SIGKILL");
  } catch {
    // Chromium wurde bereits beendet.
  }
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The production server can take a moment to bind its port.
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error("Der Lighthouse-Produktionsserver wurde nicht rechtzeitig erreichbar.");
}

function slugRoute(route) {
  return route === "/login" ? "login" : route.slice(1).replace(/\//g, "-");
}

async function auditRoute(chromePort, route, viewport) {
  const result = await lighthouse(`${baseUrl}${route}`, {
    port: chromePort,
    output: ["json", "html"],
    onlyCategories: ["accessibility"],
    disableStorageReset: true,
    formFactor: viewport.formFactor,
    screenEmulation: viewport.screenEmulation,
    throttlingMethod: "provided",
    logLevel: "error",
  });

  if (!result) {
    throw new Error(`Lighthouse lieferte für ${route} (${viewport.name}) kein Ergebnis.`);
  }

  const score = (result.lhr.categories.accessibility.score ?? 0) * 100;
  const baseName = `${slugRoute(route)}-${viewport.name}`;
  const reports = Array.isArray(result.report) ? result.report : [result.report];

  await writeFile(path.join(artifactDir, `${baseName}.json`), reports[0] ?? "");
  await writeFile(path.join(artifactDir, `${baseName}.html`), reports[1] ?? "");
  console.log(`${route} (${viewport.name}): Accessibility ${score.toFixed(0)}`);

  if (score < 95) {
    throw new Error(`${route} (${viewport.name}) erreicht nur ${score.toFixed(0)} statt 95.`);
  }
}

async function main() {
  let server = null;
  let chrome = null;

  try {
    await rm(artifactDir, { recursive: true, force: true });
    await mkdir(artifactDir, { recursive: true });
    server = startServer();
    server.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
    server.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
    await waitForServer();

    chrome = await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });

    for (const viewport of viewports) {
      await auditRoute(chrome.port, "/login", viewport);
    }

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Duelist-ID").fill("YUGI-001");
    await page.getByLabel("Passwort").fill("Yugi001");
    await page.getByRole("button", { name: "Anmelden", exact: true }).last().click();
    await page.waitForURL(`${baseUrl}/campaigns`, { timeout: 20_000 });

    for (const route of routes) {
      for (const viewport of viewports) {
        await auditRoute(chrome.port, route, viewport);
      }
    }

    await browser.close();
  } finally {
    await stopChrome(chrome);
    await stopProcess(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
