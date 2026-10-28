import { expect, test } from "@playwright/test";

/**
 * Registration through the real form.
 *
 * A brand-new account is the only way to prove that sign-up creates the session,
 * the home feed renders for someone with no history, and the profile route the
 * new username implies actually resolves. The database is reseeded per run, but
 * the address is still made unique so repeated runs against one server cannot
 * collide on a reused database.
 */
test("a new account is created, signed in and reachable at its profile", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL as string;
  const suffix = Date.now().toString().slice(-8);
  const email = `riverwatch${suffix}@example.test`;
  const username = `riverwatch_${suffix}`;
  const displayName = "Robin Fielding";

  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto("/auth/sign-up");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("RiverSensors2026!");
  await page.getByRole("button", { name: "Create account" }).click();

  // Registration creates the session, so the new account lands on Home rather
  // than being bounced back to the sign-in form.
  await page.waitForURL((url) => url.pathname === "/home");
  await expect(page.getByText("Your account is ready.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL(`**/u/${username}`);
  await expect(page.getByRole("heading", { level: 1, name: displayName })).toBeVisible();

  await context.close();
});
