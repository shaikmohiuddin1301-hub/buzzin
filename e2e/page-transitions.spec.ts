import { expect, test, type Page } from "@playwright/test";

/**
 * Moving between pages, as opposed to what each page contains.
 *
 * These assertions are the automatable half of "no ghosting, flicker, overlapping
 * screens or duplicated navigation": after a tap there is one page in the document,
 * one history entry, no full reload, and the bottom bar has not moved. Visual
 * smoothness itself is a matter of the CSS transition in `globals.css`, which only
 * touches opacity and is disabled under reduced motion.
 */
test.use({ viewport: { width: 390, height: 844 } });

function primary(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

test("a tap navigates once, without reloading the document", async ({ page }) => {
  await page.goto("/home");
  await page.evaluate(() => {
    (window as unknown as { __clientNavigation?: boolean }).__clientNavigation = true;
  });

  await primary(page).getByRole("link", { name: "Explore" }).click();
  await page.waitForURL("**/explore");

  // A full document load would have dropped this marker.
  expect(await page.evaluate(() => (window as unknown as { __clientNavigation?: boolean }).__clientNavigation)).toBe(true);

  // Exactly one entry was pushed: one Back returns to the page we came from.
  await page.goBack();
  await page.waitForURL("**/home");
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("the previous page is gone once the next one has settled", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/home");
  await expect(page.getByPlaceholder(/Share an update/).first()).toBeVisible();

  await primary(page).getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");

  // One content landmark, not an old page stacked under a new one.
  await expect(page.locator("main#main")).toHaveCount(1);
  // The composer that only exists on Home is unmounted, not hidden behind the
  // inbox; the inbox itself has rendered.
  await expect(page.getByPlaceholder(/Share an update/)).toHaveCount(0);
  await expect(page.locator("header").getByRole("searchbox", { name: "Search conversations" })).toBeVisible();
  expect(errors).toEqual([]);

  await primary(page).getByRole("link", { name: "Profile" }).click();
  await page.waitForURL("**/u/maya_okafor");
  await expect(page.locator("main#main")).toHaveCount(1);
  await expect(page.locator("header").getByRole("searchbox")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the header stays pinned while the page scrolls", async ({ page }) => {
  await page.goto("/home");
  await page.evaluate(() => window.scrollTo(0, 320));
  // The page uses smooth scrolling, so wait for it to finish before measuring.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.waitForTimeout(300);

  const header = await page.locator("header.glass-header").boundingBox();
  expect(header).not.toBeNull();
  // Sticky at the top of the viewport: `overflow-x: clip` on the body must not
  // have created a scroll container that would scroll the header away.
  expect(Math.abs(header!.y)).toBeLessThanOrEqual(1);
});

test("the bottom bar keeps its size and position while pages change", async ({ page }) => {
  await page.goto("/home");
  const nav = primary(page);
  const home = await nav.boundingBox();
  expect(home).not.toBeNull();

  for (const [label, path] of [
    ["Explore", "/explore"],
    ["Chats", "/chats"],
    ["Profile", "/u/maya_okafor"],
  ] as const) {
    await primary(page).getByRole("link", { name: label }).click();
    await page.waitForURL(`**${path}`);
    const next = await primary(page).boundingBox();
    expect(next, path).not.toBeNull();
    expect(Math.abs(next!.x - home!.x), path).toBeLessThanOrEqual(1);
    expect(Math.abs(next!.y - home!.y), path).toBeLessThanOrEqual(1);
    expect(Math.abs(next!.width - home!.width), path).toBeLessThanOrEqual(1);
    expect(Math.abs(next!.height - home!.height), path).toBeLessThanOrEqual(1);
    await expect(primary(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});
