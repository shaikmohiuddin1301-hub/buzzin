import { expect, test } from "@playwright/test";

/**
 * The chrome around the content: the account menu, the notification bell, and the
 * rule that neither is global. Home owns the bell; only Home and the signed-in
 * account's own Profile own the menu. The bell must navigate, not open a decorative
 * pop-up, and every menu entry must belong to the signed-in account.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("the profile menu is the single account menu and every entry resolves", async ({ page }) => {
  await page.goto("/u/maya_okafor");

  // About is no longer a tab; its content lives in the profile footer section.
  const tabs = page.getByRole("navigation", { name: "Section navigation" });
  await expect(tabs.getByRole("link", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About, achievements and links" })).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu).toBeVisible();

  const items = menu.getByRole("menuitem");
  await expect(items).toHaveCount(5);
  expect(await items.allTextContents()).toEqual([
    "Your profile",
    "Liked Posts & Projects",
    "Your Comments",
    "Settings & account",
    "Log Out",
  ]);

  await menu.getByRole("menuitem", { name: "Liked Posts & Projects" }).click();
  await page.waitForURL("**/me/liked");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/u/maya_okafor");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Your Comments" }).click();
  await page.waitForURL("**/me/comments");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("each page owns its header: the menu and bell are not global", async ({ page }) => {
  const header = page.locator("header");
  const menuButton = header.getByRole("button", { name: "Open menu" });
  const bell = header.getByRole("link", { name: /^Notifications/ });

  // Home: account menu and bell.
  await page.goto("/home");
  await expect(menuButton).toBeVisible();
  await expect(bell).toBeVisible();

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

  // Profile: menu, and no bell.
  await page.goto("/u/maya_okafor");
  await expect(menuButton).toBeVisible();
  await expect(bell).toHaveCount(0);

  // Somebody else's profile is not the place for your account menu.
  await page.goto("/u/jonas_b");
  await expect(menuButton).toHaveCount(0);
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
