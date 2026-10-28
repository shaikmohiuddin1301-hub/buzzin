import { expect, test, type Page } from "@playwright/test";

/**
 * The creation flow end to end: basics, team expectations, one real task and the
 * publish gate. Everything here goes through the visible form and the real server
 * action; nothing is seeded through the database.
 */
test.use({ viewport: { width: 1280, height: 1000 } });

const PASSWORD_SUMMARY = "Volunteers build low-cost river sensors and publish what they learn.";

/** `/projects/new` also matches a naive `/projects/:id` pattern, so exclude it. */
async function waitForSavedProject(page: Page) {
  await page.waitForURL(
    (url) => url.pathname.startsWith("/projects/") && url.pathname !== "/projects/new" && !url.pathname.endsWith("/edit"),
    { timeout: 30_000 },
  );
}

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

  await waitForSavedProject(page);
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
  // Team and contributions: the one genuinely required field for an unpaid project.
  await page.getByLabel("What contributors receive").fill("Credit and a written reference.");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByText("Complete these before publishing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish project" })).toBeDisabled();

  // The review names the missing field and offers the step that owns it.
  await expect(page.getByText(/Describe the project in at least 40 characters/)).toBeVisible();
  await page.getByRole("button", { name: "Go to Project basics" }).first().click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Project basics");
  await expect(page.getByLabel("Project description")).toHaveValue("");
  // The step rail can jump back to the review now that every gate is satisfied.
  await page.getByRole("button", { name: /Review and publish/ }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Review and publish");

  await page.getByRole("button", { name: "Save as draft" }).click();
  await waitForSavedProject(page);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Draft").first()).toBeVisible();
});

test("Continue advances one step at a time and Back returns to the preceding step", async ({ page }) => {
  const title = "E2E Step Order Project";
  await page.goto("/projects/new");

  const currentStep = page.locator('[aria-current="step"]');
  await expect(currentStep).toContainText("Project basics");

  await fillBasics(page, title);
  await page.getByRole("button", { name: /Continue/ }).click();
  // Step 2, not the final review screen.
  await expect(currentStep).toContainText("Team and contributions");
  await expect(page.getByLabel("What contributors receive")).toBeVisible();

  await page.getByLabel("What contributors receive").fill("Portfolio credit and a written reference.");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(currentStep).toContainText("Task breakdown");

  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("Task title").fill("Draw the enclosure bracket");
  await page.getByLabel("Review requirements").fill("The bracket fits the standard sensor and is dimensioned.");
  await page.getByRole("button", { name: "Save task" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(currentStep).toContainText("Review and publish");
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  // Back is exactly one step each time, and every value survives the round trip.
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(currentStep).toContainText("Task breakdown");
  await expect(page.getByText("Draw the enclosure bracket", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(currentStep).toContainText("Team and contributions");
  await expect(page.getByLabel("What contributors receive")).toHaveValue("Portfolio credit and a written reference.");

  await page.getByRole("button", { name: /Back/ }).click();
  await expect(currentStep).toContainText("Project basics");
  await expect(page.getByLabel("Project title")).toHaveValue(title);
  await expect(page.getByLabel("Summary")).toHaveValue(PASSWORD_SUMMARY);
  await expect(page.getByLabel("Project description")).toHaveValue(/volunteer-run sensor network/);

  // Forward again: the task saved on step 3 is still there, not reset.
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText("Draw the enclosure bracket", { exact: true }).first()).toBeVisible();
});

test("Continue names the missing field instead of failing silently", async ({ page }) => {
  await page.goto("/projects/new");
  const currentStep = page.locator('[aria-current="step"]');

  await page.getByRole("button", { name: /Continue/ }).click();
  const titleError = page.getByRole("alert").filter({ hasText: "Enter a project title of at least 3 characters." });
  const summaryError = page.getByRole("alert").filter({ hasText: /Add a summary of at least 20 characters/ });
  await expect(titleError).toBeVisible();
  await expect(summaryError).toBeVisible();
  await expect(currentStep).toContainText("Project basics");

  // Fixing one field clears its own error as it is typed; the other remains.
  await page.getByLabel("Project title").fill("River Watch");
  await expect(titleError).toHaveCount(0);
  await expect(summaryError).toBeVisible();

  // The step rail is not a way around the same gate.
  await page.getByRole("button", { name: /Review and publish/ }).click();
  await expect(currentStep).toContainText("Project basics");
  await expect(summaryError).toBeVisible();

  await page.getByLabel("Summary").fill(PASSWORD_SUMMARY);
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(currentStep).toContainText("Team and contributions");

  // An unpaid project must say what contributors receive before moving on.
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(currentStep).toContainText("Team and contributions");
  const compensationError = page.getByRole("alert").filter({ hasText: /Say what unpaid contributors receive/ });
  await expect(compensationError).toBeVisible();
  await page.getByLabel("What contributors receive").fill("Credit, a reference and expenses.");
  await expect(compensationError).toHaveCount(0);
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(currentStep).toContainText("Task breakdown");
});

test("Enter in a text field never saves the draft or leaves the wizard", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project title").fill("E2E Enter Key Project");
  await expect(page.getByLabel("Project title")).toBeFocused();

  await page.getByLabel("Project title").press("Enter");
  // Give a submitted server action time to resolve; nothing should navigate.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
  await expect(page.locator("form").getByRole("link", { name: "Cancel" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the wizard fits the screen and its actions stay above the fixed bar", async ({ page }) => {
    await page.goto("/projects/new");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    await fillBasics(page, "E2E Mobile Wizard");
    // Release the field so the keyboard-aware bar is at its resting position.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.waitForTimeout(350);

    // `scroll-behavior: smooth` means the scroll is still animating; measure at the end.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() =>
        page.evaluate(
          () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
        ),
      )
      .toBe(true);
    const nav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
    const draft = await page.getByRole("button", { name: "Save as draft" }).boundingBox();
    expect(nav).not.toBeNull();
    expect(draft).not.toBeNull();
    // The last row of actions is not behind the fixed navigation.
    expect(draft!.y + draft!.height).toBeLessThanOrEqual(nav!.y);

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.locator('[aria-current="step"]')).toContainText("Team and contributions");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});

test("Save as draft keeps the page and the typed values when the basics are incomplete", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project title").fill("Draft In Progress");

  await page.getByRole("button", { name: "Save as draft" }).click();

  // No round trip and no lost state: the same page, the same value, a named error.
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(page.getByLabel("Project title")).toHaveValue("Draft In Progress");
  await expect(page.getByRole("alert").filter({ hasText: /Add a summary of at least 20 characters/ })).toBeVisible();
});

test("Additional Details are optional, and only a supplied link is validated", async ({ page }) => {
  await page.goto("/projects/new");
  await fillBasics(page, "E2E Optional Details Project");

  // The old technical label is gone.
  await expect(page.getByText("Additional metadata")).toHaveCount(0);
  const summary = page.locator("summary").filter({ hasText: "Additional Details" });
  await expect(summary).toBeVisible();

  // Collapsed by default: the fields are present but not shown.
  await expect(page.getByLabel("URL 1")).toBeHidden();
  await summary.click();
  await expect(page.getByLabel("URL 1")).toBeVisible();

  // A malformed link is explained, and the section opens to show where it is.
  await page.getByLabel("URL 1").fill("river watch docs");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText(/Enter a full address starting with http:\/\/ or https:\/\//)).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText("Project basics");

  // Correcting it lets the step through without any other optional field.
  await page.getByLabel("URL 1").fill("https://example.org/design-notes");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Team and contributions");
});
