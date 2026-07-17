import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = path.resolve(process.cwd(), "screenshots", "editor-qa");

async function login(page: Page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  if (!page.url().includes("/login")) return;
  await page.getByLabel("Duelist-ID").fill("YUGI-001");
  await page.getByLabel("Passwort").fill("Yugi001");
  await page.locator("form").getByRole("button", { name: /Anmelden/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 20_000 });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.setDefaultTimeout(20_000);

  try {
    await login(page);
    await page.goto(`${baseUrl}/decks`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(outputDir, "deck-library-desktop.png"), fullPage: true });

    const editButton = page.getByRole("button", { name: /Deck bearbeiten/i }).first();
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.getByRole("button", { name: "Nicht im Besitz", exact: true }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outputDir, "deck-editor-unowned-desktop.png"), fullPage: true });
    }

    await page.goto(`${baseUrl}/collection`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(outputDir, "binder-library-desktop.png"), fullPage: true });
    const binderEdit = page.getByRole("button", { name: /bearbeiten/i }).first();
    if (await binderEdit.isVisible()) {
      await binderEdit.click();
      await page.getByRole("button", { name: "Nicht im Besitz", exact: true }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outputDir, "binder-editor-unowned-desktop.png"), fullPage: true });
    }

    await page.goto(`${baseUrl}/campaigns/settings`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(outputDir, "campaign-rules-desktop.png"), fullPage: true });

    await page.goto(`${baseUrl}/campaigns/custom-packs`, { waitUntil: "networkidle" });
    const suffix = Date.now().toString(36).toUpperCase();
    await page.getByPlaceholder("Packname").fill(`QA Pack ${suffix}`);
    await page.getByPlaceholder("Setcode").fill(`QA-${suffix}`);
    await page.getByRole("button", { name: "Entwurf erstellen" }).click();
    await page.getByText(/Custom-Pack-Entwurf erstellt/i).waitFor();
    const catalogCards = page.locator("button.group");
    for (let index = 0; index < 4; index += 1) {
      await catalogCards.nth(index).click();
    }
    const raritySelects = page.locator('select').filter({ has: page.locator('option', { hasText: "Ultra Rare" }) });
    await raritySelects.nth(0).selectOption("Common");
    await raritySelects.nth(1).selectOption("Rare");
    await raritySelects.nth(2).selectOption("Super Rare");
    await raritySelects.nth(3).selectOption("Ultra Rare");
    await page.getByRole("button", { name: "10.000 simulieren" }).click();
    await page.getByText(/10.000 Packs deterministisch simuliert/i).waitFor();
    await page.screenshot({ path: path.join(outputDir, "custom-pack-simulation-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    await page.getByText(/Packversion veröffentlicht/i).waitFor();
    await page.getByRole("button", { name: /Pack für .* Credits öffnen/i }).click();
    await page.getByText(/Kampagnensammlung hinzugefügt/i).waitFor();

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${baseUrl}/decks`, { waitUntil: "networkidle" });
    await mobile.screenshot({ path: path.join(outputDir, "deck-library-mobile.png"), fullPage: true });
    const mobileEdit = mobile.getByRole("button", { name: /Deck bearbeiten/i }).first();
    if (await mobileEdit.isVisible()) {
      await mobileEdit.click();
      await mobile.screenshot({ path: path.join(outputDir, "deck-editor-mobile.png"), fullPage: true });
    }
    await mobile.close();

    await writeFile(
      path.join(outputDir, "browser-errors.json"),
      `${JSON.stringify(errors, null, 2)}\n`,
      "utf8",
    );
    const actionableErrors = errors.filter((entry) => !/favicon|404|ERR_BLOCKED_BY_CLIENT/i.test(entry));
    if (actionableErrors.length > 0) {
      throw new Error(`Browserfehler:\n${actionableErrors.join("\n")}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
