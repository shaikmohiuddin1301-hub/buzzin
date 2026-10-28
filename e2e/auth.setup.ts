import path from "node:path";
import { expect, test as setup } from "@playwright/test";

/**
 * Authenticate once so every spec starts signed in as a seeded creator.
 *
 * This is also the end-to-end proof that the real sign-in form, server action,
 * session cookie and post-login redirect work together in a browser.
 */
const authFile = path.join(__dirname, "..", ".tmp-e2e", "maya.json");

setup("sign in as the seeded creator", async ({ page }) => {
  await page.goto("/auth/sign-in");

  await page.getByLabel("Email").fill("maya@example.test");
  await page.getByLabel("Password").fill("BuildTogether2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/home");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
