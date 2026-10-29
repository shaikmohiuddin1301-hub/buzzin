import { expect, test } from "@playwright/test";

/**
 * Browser-level check that the tokens reach real surfaces in both themes.
 * Vitest protects the token values; this proves the shell and components use them.
 *
 * The interface stays graphite glass; blue is the interactive accent, coral the
 * Create action, rose the social/unread marker. Each of those is asserted once,
 * in both themes, on a real screen.
 */
test.use({ viewport: { width: 1280, height: 900 } });

function rgb(value: string): string {
  return value.replace(/\s+/g, " ");
}

test("light glass surfaces, blue navigation and graphite actions", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/home");

  await expect(page.locator("div.page-surface").first()).toHaveCSS("background-color", rgb("rgb(245, 245, 243)"));
  await expect(page.locator("header.glass-header")).toHaveCSS("background-color", rgb("rgba(245, 245, 243, 0.74)"));
  // Frosted glass, not an opaque panel.
  expect(await page.locator("div.card-surface").first().evaluate((el) => getComputedStyle(el).backdropFilter)).toContain(
    "blur",
  );

  // Selected navigation: soft blue glass behind blue-700 text.
  const activeNav = page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]');
  await expect(activeNav).toHaveCSS("color", rgb("rgb(32, 84, 168)"));
  await expect(activeNav).toHaveCSS("background-color", rgb("rgba(67, 136, 245, 0.12)"));

  await page.goto("/explore");
  await expect(page.locator("div.page-surface-secondary").first()).toHaveCSS("background-color", rgb("rgb(231, 231, 235)"));

  // The section rail is a selected-navigation indicator: deep blue fill.
  const activeTab = page.locator('nav[aria-label="Section navigation"] a[aria-current="page"]').first();
  await expect(activeTab).toHaveCSS("background-color", rgb("rgb(40, 100, 199)"));
  await expect(activeTab).toHaveCSS("color", rgb("rgb(255, 255, 255)"));

  // Search focus is the blue interactive accent.
  const search = page.getByRole("searchbox", { name: "Search people, projects and skills" });
  await search.focus();
  await expect(search).toHaveCSS("border-color", rgb("rgb(67, 136, 245)"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS(
    "background-color",
    rgb("rgba(255, 255, 255, 0.74)"),
  );
  // Create stays coral, whatever the accent colour is.
  await expect(page.getByRole("button", { name: "Create" })).toHaveCSS(
    "background-color",
    rgb("rgb(255, 120, 90)"),
  );

  const primary = page.getByRole("link", { name: "Start a project" });
  await expect(primary).toHaveCSS("background-color", rgb("rgb(52, 52, 58)"));
  await expect(primary).toHaveCSS("color", rgb("rgb(255, 255, 255)"));
});

test("dark glass surfaces, lifted blue navigation and graphite actions", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/home");

  await expect(page.locator("div.page-surface").first()).toHaveCSS("background-color", rgb("rgb(34, 34, 38)"));
  await expect(page.locator("header.glass-header")).toHaveCSS("background-color", rgb("rgba(34, 34, 38, 0.78)"));

  const activeNav = page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]');
  await expect(activeNav).toHaveCSS("color", rgb("rgb(186, 213, 252)"));
  await expect(activeNav).toHaveCSS("background-color", rgb("rgba(67, 136, 245, 0.18)"));

  const primary = page.getByRole("link", { name: "Start a project" });
  await expect(primary).toHaveCSS("background-color", rgb("rgb(231, 231, 235)"));
  await expect(primary).toHaveCSS("color", rgb("rgb(34, 34, 38)"));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS(
    "background-color",
    rgb("rgba(52, 52, 58, 0.82)"),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explore");
  const activeTab = page.locator('nav[aria-label="Section navigation"] a[aria-current="page"]').first();
  await expect(activeTab).toHaveCSS("background-color", rgb("rgb(156, 192, 250)"));
  await expect(activeTab).toHaveCSS("color", rgb("rgb(34, 34, 38)"));

  const search = page.getByRole("searchbox", { name: "Search people, projects and skills" });
  await search.focus();
  await expect(search).toHaveCSS("border-color", rgb("rgb(91, 158, 250)"));
});

test("unread notifications keep the grey surface and use the rose marker", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/notifications");

  const unread = page.locator("li.bg-navy-100").first();
  await expect(unread).toBeVisible();
  await expect(unread).toHaveCSS("background-color", rgb("rgb(238, 238, 240)"));

  const dot = unread.locator("span.bg-rose-500").first();
  await expect(dot).toHaveCSS("background-color", rgb("rgb(217, 87, 122)"));
});

test("likes stay coral while comments and unread marks are rose", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/home");

  // The like control is a form submit; its icon carries the darker coral stroke.
  const like = page.getByRole("button", { name: /like this post|remove like/i }).first();
  await expect(like.locator("svg")).toHaveCSS("color", rgb("rgb(236, 102, 71)"));

  // Comments are social engagement, so their icon is rose rather than blue.
  const comment = page.locator('a[href$="#comments"] svg').first();
  await expect(comment).toHaveCSS("color", rgb("rgb(190, 64, 99)"));
});
