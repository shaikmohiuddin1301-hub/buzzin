import { expect, test } from "@playwright/test";

/**
 * The chrome around the content: the notification bell and the account options.
 * Home owns the bell; account options are part of the signed-in account's own
 * profile page, not a global hamburger. The bell must navigate, not open a
 * decorative pop-up, and every account entry must belong to the signed-in account.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("account options live on the profile page, with no hamburger anywhere", async ({ page }) => {
  await page.goto("/u/maya_okafor");

  // About is no longer a tab; its content lives in the profile footer section.
  const tabs = page.getByRole("navigation", { name: "Section navigation" });
  await expect(tabs.getByRole("link", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About, achievements and links" })).toBeVisible();

  // The old top-left hamburger is gone, on this page and every other one.
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);

  const account = page.getByRole("navigation", { name: "Your account" });
  await expect(account).toBeVisible();
  for (const label of ["Liked Posts & Projects", "Your Comments", "Settings & account", "Notifications"]) {
    await expect(account.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(account.getByRole("button", { name: "Log out" })).toBeVisible();

  await account.getByRole("link", { name: "Liked Posts & Projects" }).click();
  await page.waitForURL("**/me/liked");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/u/maya_okafor");
  await page.getByRole("navigation", { name: "Your account" }).getByRole("link", { name: "Your Comments" }).click();
  await page.waitForURL("**/me/comments");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("each page owns its header: no global menu, and the bell is Home-only", async ({ page }) => {
  const header = page.locator("header");
  const menuButton = header.getByRole("button", { name: "Open menu" });
  const bell = header.getByRole("link", { name: /^Notifications/ });

  // Home: the wordmark and the bell. No hamburger in the top-left corner.
  await page.goto("/home");
  await expect(bell).toBeVisible();
  await expect(menuButton).toHaveCount(0);

  // Explore: search instead of chrome. No menu, no bell.
  await page.goto("/explore");
  await expect(header.getByRole("searchbox", { name: "Search people, projects and skills" })).toBeVisible();
  await expect(menuButton).toHaveCount(0);
  await expect(bell).toHaveCount(0);

  // Chats: inbox title and conversation search. No menu, no bell.
  await page.goto("/chats");
  await expect(header.getByRole("heading", { name: "Chats" })).toBeVisible();
  await expect(header.getByRole("searchbox", { name: "Search conversations" })).toBeVisible();
  await expect(menuButton).toHaveCount(0);
  await expect(bell).toHaveCount(0);

  // Profile: a clean header, no bell, and account options in the page body.
  await page.goto("/u/maya_okafor");
  await expect(menuButton).toHaveCount(0);
  await expect(bell).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Your account" })).toBeVisible();

  // Somebody else's profile shows neither your account options nor a bell.
  await page.goto("/u/jonas_b");
  await expect(menuButton).toHaveCount(0);
  await expect(bell).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Your account" })).toHaveCount(0);
});

test("theme choices live in Settings, apply immediately and survive a reload", async ({ page }) => {
  await page.goto("/settings?tab=appearance");

  // There is no second theme control in the application header.
  await expect(page.locator("header").getByRole("radiogroup", { name: "Colour theme" })).toHaveCount(0);

  const group = page.getByRole("radiogroup", { name: "Colour theme" });
  await group.getByRole("radio", { name: /^Dark/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("radiogroup", { name: "Colour theme" }).getByRole("radio", { name: /^Dark/ }),
  ).toHaveAttribute("aria-checked", "true");
});

async function bellUnread(page: import("@playwright/test").Page): Promise<number> {
  const label = await page
    .locator("header")
    .getByRole("link", { name: /^Notifications/ })
    .getAttribute("aria-label");
  const match = label?.match(/(\d+) unread/);
  return match ? Number(match[1]) : 0;
}

test("marking a notification read persists on the server", async ({ page }) => {
  // The bell lives in the Home header, so the count is read there.
  await page.goto("/home");
  const before = await bellUnread(page);
  expect(before).toBeGreaterThan(0);

  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark read" }).first().click();

  await page.goto("/home");
  await expect.poll(() => bellUnread(page)).toBe(before - 1);

  // A fresh page has no client router cache. The header count is rendered by the
  // server layout, so this proves the read state reached the database.
  const fresh = await page.context().newPage();
  await fresh.goto("/home");
  await expect.poll(() => bellUnread(fresh)).toBe(before - 1);
  await fresh.close();
});

test("the notification bell navigates to the full Notifications page", async ({ page }) => {
  await page.goto("/home");

  const header = page.locator("header");
  await header.getByRole("link", { name: /^Notifications/ }).click();
  await page.waitForURL("**/notifications");

  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Section navigation" });
  await expect(filters.getByRole("link", { name: /^All/ })).toBeVisible();
  await expect(filters.getByRole("link", { name: /^Unread/ })).toBeVisible();
});
