import { expect, test } from "@playwright/test";

/**
 * The primary navigation promised by docs/DESIGN-SYSTEM.md: five destinations,
 * the Create action geometrically centred, and a sheet that is the only way the
 * Create entry behaves. Runs at a phone viewport because this bar is mobile-only.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("shows exactly the five primary destinations, with Create centred", async ({ page }) => {
  await page.goto("/home");

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();

  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Explore" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Create" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Chats/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Profile" })).toBeVisible();

  // Learning and Projects left the bar; their routes are still reachable elsewhere.
  await expect(nav.getByRole("link", { name: "Learning" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Projects" })).toHaveCount(0);

  const navBox = await nav.boundingBox();
  const createBox = await nav.getByRole("button", { name: "Create" }).boundingBox();
  expect(navBox).not.toBeNull();
  expect(createBox).not.toBeNull();
  const navCentre = navBox!.x + navBox!.width / 2;
  const createCentre = createBox!.x + createBox!.width / 2;
  expect(Math.abs(navCentre - createCentre)).toBeLessThanOrEqual(2);
});

test("Home has no duplicate Explore button outside the primary navigation", async ({ page }) => {
  await page.goto("/home");
  const main = page.locator("main#main");
  await expect(main.getByRole("link", { name: "Explore" })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Explore" })).toHaveCount(0);
});

test("opens the Create sheet from the centre action and closes it with Escape", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Create" }).click();

  const sheet = page.getByRole("dialog", { name: "Create" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Create" })).toBeVisible();

  // Every entry is a real destination, not a decorative tile.
  for (const label of ["New project", "New post", "Share an update", "New teaching", "New course", "Share a learning"]) {
    await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("uses real routes for Home, Explore, Chats and the signed-in profile", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });

  await nav.getByRole("link", { name: "Explore" }).click();
  await page.waitForURL("**/explore");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: /^Chats/ }).click();
  await page.waitForURL("**/chats");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL("**/u/maya_okafor");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the desktop sidebar keeps Learning and Projects alongside the five destinations", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/home");

  const sidebar = page.getByRole("navigation", { name: "Main navigation" });
  await expect(sidebar).toBeVisible();
  for (const label of ["Home", "Explore", "Chats", "Learning", "Projects", "Profile"]) {
    await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
  }

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

  // Following a sidebar link highlights the destination it went to, even though the
  // click was a client-side navigation rather than a full load.
  await sidebar.getByRole("link", { name: "Projects" }).click();
  await page.waitForURL("**/projects");
  await expect(sidebar.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
});
