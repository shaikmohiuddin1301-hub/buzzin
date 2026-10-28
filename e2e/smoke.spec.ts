import { expect, test } from "@playwright/test";

/**
 * A walking pass over the redesigned surfaces.
 *
 * Every page must return a successful response and render without a client-side
 * exception; this is the check that catches a broken import, a failed server
 * render or a hydration crash that a unit test cannot see.
 */
const ROUTES = [
  "/home",
  "/notifications",
  "/notifications?filter=unread",
  "/u/maya_okafor",
  "/u/maya_okafor?tab=projects",
  "/projects",
  "/projects/new",
  "/learn",
  "/me/liked",
  "/me/comments",
  "/chats",
];

test("the redesigned pages render without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of ROUTES) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should be served`).toBeLessThan(500);
    await expect(page.locator("main#main"), `${route} should render the app shell`).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first(), `${route} should have a heading`).toBeVisible();
  }

  expect(errors, `client-side errors: ${errors.join(" | ")}`).toEqual([]);
});
