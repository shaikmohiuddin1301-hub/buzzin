import { expect, test } from "@playwright/test";

/**
 * Browser-level check that the tokens reach real surfaces in both themes.
 * Vitest protects the token values; this proves the shell and components use them.
 */
test.use({ viewport: { width: 1280, height: 900 } });

function rgb(value: string): string {
  return value.replace(/\s+/g, " ");
}

test("light surfaces, navigation and primary actions use the graphite palette", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/home");

  await expect(page.locator("div.page-surface").first()).toHaveCSS("background-color", rgb("rgb(245, 245, 243)"));
  await expect(page.locator("header.glass-header")).toHaveCSS("background-color", rgb("rgba(245, 245, 243, 0.74)"));
  // Frosted glass, not an opaque panel.
  expect(await page.locator("div.card-surface").first().evaluate((el) => getComputedStyle(el).backdropFilter)).toContain(
    "blur",
  );
  await expect(page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]')).toHaveCSS(
    "color",
    rgb("rgb(52, 52, 58)"),
  );

  await page.goto("/explore");
  await expect(page.locator("div.page-surface-secondary").first()).toHaveCSS(
    "background-color",
    rgb("rgb(231, 231, 235)"),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS(
    "background-color",
    rgb("rgba(255, 255, 255, 0.74)"),
  );
  await expect(page.getByRole("button", { name: "Create" })).toHaveCSS(
    "background-color",
    rgb("rgb(255, 120, 90)"),
  );

  const primary = page.getByRole("link", { name: "Start a project" });
  await expect(primary).toHaveCSS("background-color", rgb("rgb(52, 52, 58)"));
  await expect(primary).toHaveCSS("color", rgb("rgb(255, 255, 255)"));
});

test("dark surfaces, navigation and primary actions use the graphite palette", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/home");

  await expect(page.locator("div.page-surface").first()).toHaveCSS("background-color", rgb("rgb(34, 34, 38)"));
  await expect(page.locator("header.glass-header")).toHaveCSS("background-color", rgb("rgba(34, 34, 38, 0.78)"));
  await expect(page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]')).toHaveCSS(
    "color",
    rgb("rgb(231, 231, 235)"),
  );

  const primary = page.getByRole("link", { name: "Start a project" });
  await expect(primary).toHaveCSS("background-color", rgb("rgb(231, 231, 235)"));
  await expect(primary).toHaveCSS("color", rgb("rgb(34, 34, 38)"));

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS(
    "background-color",
    rgb("rgba(52, 52, 58, 0.82)"),
  );
});

test("unread notifications use the grey unread surface", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/notifications");

  const unread = page.locator("li.bg-navy-100").first();
  await expect(unread).toBeVisible();
  await expect(unread).toHaveCSS("background-color", rgb("rgb(238, 238, 240)"));

  const dot = unread.locator("span.bg-coral-500").first();
  await expect(dot).toHaveCSS("background-color", rgb("rgb(255, 120, 90)"));
});
