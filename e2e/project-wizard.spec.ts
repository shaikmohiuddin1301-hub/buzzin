import { expect, test, type Page } from "@playwright/test";

/**
 * The creation flow end to end: basics, team expectations, one real task and the
 * publish gate. Everything here goes through the visible form and the real server
 * action; nothing is seeded through the database.
 */
test.use({ viewport: { width: 1280, height: 1000 } });

const PASSWORD_SUMMARY = "Volunteers build low-cost river sensors and publish what they learn.";

async function fillBasics(page: Page, title: string, options: { overview?: boolean } = {}) {
  await page.getByLabel("Project title").fill(title);
  await page.getByLabel("Summary").fill(PASSWORD_SUMMARY);
  if (options.overview !== false) {
    await page
      .getByLabel("Project description")
      .fill(
        "River Watch is a volunteer-run sensor network. This project builds the enclosure, the calibration routine and the public dashboard, and documents every failure along the way.",
      );
  }
}

test("publishes a project with a work area and a task in one flow", async ({ page }) => {
  const title = "E2E River Sensor Enclosure";

  await page.goto("/projects/new");
  await expect(page.getByRole("navigation", { name: "Project creation steps" })).toBeVisible();

  await fillBasics(page, title);
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 2: unpaid projects must say what contributors receive.
  await page
    .getByLabel("What contributors receive")
    .fill("Portfolio credit, a written reference and access to the finished field guide.");
  await page.getByLabel("New work area name").fill("Research");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove work area Research" })).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 3: one real task, filed into the work area and reviewable.
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("Task title").fill("Interview five river volunteers");
  await page
    .getByLabel("Review requirements")
    .fill("Five written summaries are attached, each with the volunteer's consent recorded.");
  await page.getByLabel("Work area or role").selectOption("Research");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Interview five river volunteers", { exact: true }).first()).toBeVisible();

  // A second task proves the breakdown is a list, not a single optional field.
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("Task title").fill("Assemble the sensor mast");
  await page
    .getByLabel("Review requirements")
    .fill("The mast stands for a week in wind and every bolt is accounted for.");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Assemble the sensor mast", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 4: no blockers remain, so publishing is enabled.
  await expect(page.getByRole("button", { name: "Publish project" })).toBeEnabled();
  await expect(page.getByText("Complete these before publishing")).toHaveCount(0);
  await page.getByRole("button", { name: "Publish project" }).click();

  await page.waitForURL(/\/projects\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // The task and its work area are reachable from the project they were created
  // inside, rather than only existing in the wizard's client state.
  const projectUrl = new URL(page.url());
  await page.goto(`${projectUrl.pathname}/tasks`);
  await expect(page.getByText("Interview five river volunteers", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Assemble the sensor mast", { exact: true }).first()).toBeVisible();
  await page.goto(`${projectUrl.pathname}?tab=team`);
  await expect(page.getByRole("link", { name: "Research" })).toBeVisible();
});

test("blocks publishing until the description and task acceptance are present, but keeps the draft", async ({ page }) => {
  const title = "E2E Draft Without A Description";

  await page.goto("/projects/new");
  await fillBasics(page, title, { overview: false });
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByText("Complete these before publishing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish project" })).toBeDisabled();

  await page.getByRole("button", { name: "Save as draft" }).click();
  await page.waitForURL(/\/projects\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Draft").first()).toBeVisible();
});
