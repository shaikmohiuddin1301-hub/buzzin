import { expect, test } from "@playwright/test";
import { signInAs } from "./support";

/**
 * The chrome around the content: the notification bell and the account menu.
 * Home owns the bell; the account's own options live in one hamburger in the corner
 * of the profile header, rendered by that page alone. The bell must navigate, not
 * open a decorative pop-up, and every account entry must belong to the signed-in
 * account.
 */
test.use({ viewport: { width: 390, height: 844 } });

const MENU_ITEMS = [
  /Liked Posts & Projects/,
  /Your Comments/,
  /Settings & Account/,
  /Notifications/,
  /Log out/,
];

test("the profile header carries no banner and opens its account menu from the corner", async ({ page }) => {
  await page.goto("/u/maya_okafor");

  // The dark banner is gone: nothing behind the avatar paints a hero surface.
  await expect(page.locator("#main .ink-hero")).toHaveCount(0);

  // Avatar, name, username and roles form a compact header.
  await expect(page.getByRole("heading", { level: 1, name: "Maya Okafor" })).toBeVisible();
  await expect(page.locator("#main").getByText("@maya_okafor", { exact: true })).toBeVisible();
  await expect(page.locator("#main").getByText("Creator", { exact: true })).toBeVisible();

  // The actions sit beneath the profile information, the joined date and statistics
  // follow them, and the old inline account panel is gone.
  const name = await page.getByRole("heading", { level: 1, name: "Maya Okafor" }).boundingBox();
  const edit = await page.getByRole("link", { name: "Edit profile" }).boundingBox();
  const joined = await page.getByText(/^Joined /).boundingBox();
  expect(name && edit && joined).toBeTruthy();
  expect(edit!.y).toBeGreaterThan(name!.y);
  expect(joined!.y).toBeGreaterThan(edit!.y);
  await expect(page.getByRole("link", { name: /Create/ }).first()).toBeVisible();
  await expect(page.locator("#main").getByText("Followers", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Your account" })).toHaveCount(0);

  // The hamburger sits in the header's top-right corner and starts closed.
  const trigger = page.getByRole("button", { name: "Profile menu" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox!.x + triggerBox!.width).toBeLessThan(390);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const menu = page.getByRole("menu", { name: "Profile menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(MENU_ITEMS);

  // It never overflows a phone screen, and Log out is separated from navigation.
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
  const lastItem = await menu.getByRole("menuitem").last().boundingBox();
  const firstItem = await menu.getByRole("menuitem").first().boundingBox();
  expect(lastItem!.y).toBeGreaterThan(firstItem!.y);
  await expect(menu.getByRole("separator")).toBeVisible();

  // Every entry is the page it always was, and following one closes the menu.
  await menu.getByRole("menuitem", { name: "Liked Posts & Projects" }).click();
  await page.waitForURL("**/me/liked");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);

  for (const [item, url] of [
    ["Your Comments", "**/me/comments"],
    ["Settings & Account", "**/settings"],
    ["Notifications", "**/notifications"],
  ] as const) {
    await page.goto("/u/maya_okafor");
    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("menu", { name: "Profile menu" }).getByRole("menuitem", { name: item }).click();
    await page.waitForURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("the profile menu closes on Escape and on a press outside it", async ({ page }) => {
  await page.goto("/u/maya_okafor");
  const trigger = page.getByRole("button", { name: "Profile menu" });
  const menu = page.getByRole("menu", { name: "Profile menu" });

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/u\/maya_okafor$/);

  // Arrow keys reach the entries, as a menu promises.
  await trigger.click();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // A press on the page outside the menu dismisses it, and nothing navigates.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Maya Okafor" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/\/u\/maya_okafor$/);
});

test("Log out is the destructive last entry and ends the session", async ({ browser, baseURL }) => {
  // Logging out revokes the session it was signed in with, so this test signs in
  // for itself and closes its context: the suite's shared session stays alive.
  const { context, page } = await signInAs(browser, baseURL!, "maya@example.test");
  try {
    await page.goto("/u/maya_okafor");
    await page.getByRole("button", { name: "Profile menu" }).click();

    const menu = page.getByRole("menu", { name: "Profile menu" });
    const logOut = menu.getByRole("menuitem", { name: "Log out" });
    await expect(menu.getByRole("menuitem").last()).toHaveText(/Log out/);

    // The same menu anchored in the header corner of a desktop window.
    const width = page.viewportSize()!.width;
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);

    // Styled as a destructive action, not as another destination.
    const colour = (node: Element) => getComputedStyle(node).color;
    const logOutColour = await logOut.evaluate(colour);
    const navColour = await menu.getByRole("menuitem").first().evaluate(colour);
    expect(logOutColour).not.toBe(navColour);

    await logOut.click();
    await page.waitForURL(/\/\?notice=/);
    await expect(page.getByText("You have been signed out.")).toBeVisible();

    // The session is really gone: an authenticated route sends us to sign in.
    await page.goto("/home");
    await page.waitForURL(/\/auth\/sign-in/);
  } finally {
    await context.close();
  }
});

test("each page owns its header: no global menu, and the bell is Home-only", async ({ page }) => {
  const header = page.locator("header");
  const menuButton = page.getByRole("button", { name: "Profile menu" });
  const bell = header.getByRole("link", { name: /^Notifications/ });

  // Home: the wordmark and the bell. No hamburger borrowed from another page.
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

  // Your own profile: one menu, in the page header.
  await page.goto("/u/maya_okafor");
  await expect(menuButton).toHaveCount(1);
  await expect(bell).toHaveCount(0);

  // Somebody else's profile shows neither a menu nor a bell.
  await page.goto("/u/jonas_b");
  await expect(menuButton).toHaveCount(0);
  await expect(bell).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
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
