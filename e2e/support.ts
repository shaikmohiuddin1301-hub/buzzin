import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Every seeded account shares one password (see `db/seed.ts`). The setup project
 * signs in as Maya once and reuses that storage state for the default `page`; the
 * specs that need a *different* role open a second context through the real form.
 */
export const SEEDED_PASSWORD = "BuildTogether2026!";

/**
 * Sign in as another seeded account in its own browser context.
 *
 * Kept separate from `auth.setup.ts` on purpose: most specs run as the creator, so
 * signing four accounts in for every run would cost more than it proves. The flow
 * itself is the same visible form and server action a person uses, and the caller
 * is responsible for closing the context so cookies never leak between roles.
 */
export async function signInAs(
  browser: Browser,
  baseURL: string,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  // Playwright Test hands the project's context options (including the signed-in
  // storage state) to contexts created here, so an empty state is passed explicitly
  // to make this a genuinely separate, signed-out browser.
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/home");
  // The Home header exists at every viewport, unlike the desktop-only sidebar, so
  // the bell proves the authenticated shell rendered whatever size the spec uses.
  await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();

  return { context, page };
}
