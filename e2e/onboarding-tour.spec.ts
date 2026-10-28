import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * First-run guidance.
 *
 * New accounts are created through the real registration form in their own browser
 * contexts. Existing seeded accounts default to "completed", so only genuine new
 * users meet the welcome screen. Reopening the tour is tested against a seeded
 * account, because that is how an established user finds it in Settings.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function registerNewAccount(browser: Browser): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const baseURL = test.info().project.use.baseURL as string;
  const suffix = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto("/auth/sign-up");
  await page.getByLabel("Display name").fill("Tessa Newcomer");
  await page.getByLabel("Username").fill(`tessa_${suffix}`);
  await page.getByLabel("Email").fill(`tessa${suffix}@example.test`);
  await page.getByLabel("Password").fill("FirstVisit2026!");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/home");

  return { context, page };
}

function welcomeDialog(page: Page) {
  return page.getByRole("dialog", { name: "Welcome to BuildTogether" });
}

async function expectCardClearOfTarget(page: Page) {
  const target = page.locator('[data-tour="home"]:visible').first();
  const card = page.locator('[data-tour-card="step"]');
  const [targetBox, cardBox] = await Promise.all([target.boundingBox(), card.boundingBox()]);
  expect(targetBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  const overlaps =
    targetBox!.x < cardBox!.x + cardBox!.width &&
    targetBox!.x + targetBox!.width > cardBox!.x &&
    targetBox!.y < cardBox!.y + cardBox!.height &&
    targetBox!.y + targetBox!.height > cardBox!.y;
  expect(overlaps).toBe(false);
}

test("a new account can skip the welcome and is not shown it again", async ({ browser }) => {
  const { context, page } = await registerNewAccount(browser);

  await expect(welcomeDialog(page)).toBeVisible();
  const persisted = page.waitForResponse((response) => response.request().method() === "POST");
  await page.getByRole("button", { name: "Skip guidance" }).click();
  await expect(welcomeDialog(page)).toHaveCount(0);
  await persisted;

  // Clearing the local fallback proves the server preference itself suppresses the
  // welcome, not just this browser's localStorage.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(welcomeDialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();

  await context.close();
});

test("Next, Back and Finish move through the five stops and remember completion", async ({ browser }) => {
  const { context, page } = await registerNewAccount(browser);

  await expect(welcomeDialog(page)).toBeVisible();
  await page.getByRole("button", { name: "Take a quick tour" }).click();

  await expect(page.getByRole("dialog", { name: "Your community at a glance" })).toBeVisible();
  await expect(page.getByText(/Home.*1 of 5/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  // On the phone viewport the card sits above the bottom bar, never over it.
  await expectCardClearOfTarget(page);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Find something worth joining" })).toBeVisible();
  await expect(page.getByText(/Explore.*2 of 5/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip tour" })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("dialog", { name: "Your community at a glance" })).toBeVisible();

  for (const title of [
    "Find something worth joining",
    "Make something and share it",
    "Talk to the people you build with",
    "Your work in one place",
  ]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  const persisted = page.waitForResponse((response) => response.request().method() === "POST");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await persisted;

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(welcomeDialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();

  await context.close();
});

test("the tour can be reopened from Settings & Account without changing data", async ({ page }) => {
  await page.goto("/settings?tab=account");
  await expect(page.getByRole("heading", { name: /Help & getting started/ })).toBeVisible();

  await page.getByRole("link", { name: "Take the app tour" }).click();
  await expect(page.getByRole("dialog", { name: "Your community at a glance" })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The account still has its settings and identity after the read-only replay.
  await page.goto("/settings?tab=account");
  await expect(page.getByRole("link", { name: "Take the app tour" })).toBeVisible();
  await expect(page.locator("#main").getByText("@maya_okafor", { exact: true }).first()).toBeVisible();
});

test("the spotlight, card and dark theme work on a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/settings?tab=appearance");
  await page.getByRole("radiogroup", { name: "Colour theme" }).getByRole("radio", { name: /^Dark/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.goto("/home?tour=1");
  await expect(page.getByRole("dialog", { name: "Your community at a glance" })).toBeVisible();
  await expect(page.locator('[data-tour-spotlight="true"]')).toBeVisible();
  await expectCardClearOfTarget(page);
});
