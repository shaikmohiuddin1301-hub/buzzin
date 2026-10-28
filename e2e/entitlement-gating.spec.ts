import { expect, test } from "@playwright/test";
import { signInAs } from "./support";

/**
 * Premium gating as a person experiences it.
 *
 * The seeded course is paid, Maya has no entitlement and Leo has a recorded grant.
 * The assertions use the page HTML, not just the visible text, because the whole
 * point is that an unentitled browser never receives the body at all.
 */

const COURSE_TITLE = "Field data for community projects";
const BODY_PHRASE = "Who this is for";

test("an unentitled reader sees the preview, price and a way to ask for access", async ({ page }) => {
  await page.goto("/learn/r-course");

  await expect(page.getByRole("heading", { level: 1, name: COURSE_TITLE })).toBeVisible();
  await expect(page.getByText(/Premium · £24\.00/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "This is premium material" })).toBeVisible();
  await expect(page.getByText(/Exercises are withheld until access is granted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Request access" })).toBeVisible();

  // Free preview is present; the paid body is not in the HTML the server sent.
  await expect(page.getByRole("heading", { name: "Free preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The material" })).toHaveCount(0);
  expect(await page.content()).not.toContain(BODY_PHRASE);
});

test("the recorded grant unlocks the body for that account only", async ({ page, browser }) => {
  const baseURL = test.info().project.use.baseURL as string;
  const { context, page: learner } = await signInAs(browser, baseURL, "leo@example.test");

  await learner.goto("/learn/r-course");
  await expect(learner.getByRole("heading", { level: 1, name: COURSE_TITLE })).toBeVisible();
  await expect(learner.getByText(/Premium · access granted/)).toBeVisible();
  await expect(learner.getByRole("heading", { name: "This is premium material" })).toHaveCount(0);
  await expect(learner.getByRole("heading", { name: "The material" })).toBeVisible();
  await expect(learner.getByText(BODY_PHRASE, { exact: false })).toBeVisible();
  expect(await learner.content()).toContain(BODY_PHRASE);

  await context.close();

  // The same URL in the unentitled session is still locked.
  await page.goto("/learn/r-course");
  expect(await page.content()).not.toContain(BODY_PHRASE);
});

test("a free resource renders its full body without a paywall panel", async ({ page }) => {
  await page.goto("/learn/r-accessibility");

  await expect(
    page.getByRole("heading", { level: 1, name: "Five accessibility checks before you show a prototype to anyone" }),
  ).toBeVisible();
  await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "The material" })).toBeVisible();
  await expect(page.getByText("Keyboard only", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This is premium material" })).toHaveCount(0);
});
