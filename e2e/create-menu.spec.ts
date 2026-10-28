import { expect, test, type Page } from "@playwright/test";

/**
 * The Create menu end to end.
 *
 * Every option must open its real workflow, and every workflow must persist what
 * the person entered. The camera test uses Chromium's fake media device, so the
 * live getUserMedia path and the canvas capture are exercised for real.
 */
test.use({ viewport: { width: 390, height: 844 } });

function stamp(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** A valid 1×1 PNG, so the server's signature sniffing accepts the upload. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function openCreate(page: Page) {
  await page.goto("/create");
  await expect(page.getByRole("heading", { level: 1, name: "What are you making?" })).toBeVisible();
}

test("every Create menu option opens its own workflow", async ({ page }) => {
  const options = [
    { link: /^New post/, heading: "New post" },
    { link: /^Share a learning/, heading: "Share a learning" },
    { link: /^New project/, heading: "Start a project" },
    { link: /^Share an update/, heading: "Share an update" },
    { link: /^New task/, heading: "New task" },
    { link: /^New teaching/, heading: "New teaching" },
    { link: /^New course/, heading: "Create a course" },
  ];

  for (const option of options) {
    await openCreate(page);
    await page.getByRole("link", { name: option.link }).click();
    await expect(page.getByRole("heading", { level: 1, name: option.heading })).toBeVisible();
  }
});

test("New post takes a photo, keeps the caption, and publishes the image", async ({ page }) => {
  const caption = `E2E camera capture ${stamp()}`;
  const alt = `Workbench photo taken through the camera ${stamp()}`;

  await page.context().grantPermissions(["camera"]);
  await page.goto("/create/post");
  await page.getByLabel("Caption").fill(caption);
  await page.getByLabel("Alt text").fill(alt);

  await page.getByRole("button", { name: "Take photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Take photo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Starting the camera…")).toBeHidden({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Capture photo" }).click();

  // The captured frame is previewed before publishing, and the text is untouched.
  await expect(page.getByText(/ready to publish with the post/)).toBeVisible();
  await expect(page.getByLabel("Caption")).toHaveValue(caption);

  await page.getByRole("button", { name: "Publish post" }).click();
  await page.waitForURL(/\/u\/maya_okafor\?tab=posts/);

  // The image is served from the upload store, not a temporary object URL.
  const published = page.getByRole("img", { name: alt });
  await expect(published).toBeVisible();
  await expect(published).toHaveAttribute("src", /^\/api\/files\//);

  await page.getByText(/^Published/).first().waitFor();
});

test("New post accepts a gallery image without opening the camera", async ({ page }) => {
  const caption = `E2E gallery post ${stamp()}`;
  const alt = `A tiny gallery image ${stamp()}`;

  await page.goto("/create/post");
  await page.getByLabel("Caption").fill(caption);
  await page.getByLabel("Alt text").fill(alt);
  await page.locator('input[name="image"]').setInputFiles({
    name: "gallery.png",
    mimeType: "image/png",
    buffer: PNG,
  });

  await expect(page.getByText(/ready to publish with the post/)).toBeVisible();
  await page.getByRole("button", { name: "Publish post" }).click();
  await page.waitForURL(/\/u\/maya_okafor\?tab=posts/);

  await expect(page.getByRole("img", { name: alt })).toBeVisible();
});

test("New post explains an invalid image instead of submitting it", async ({ page }) => {
  await page.goto("/create/post");
  await page.getByLabel("Caption").fill("This caption should not be published");
  await page.locator('input[name="image"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });

  await expect(page.getByText(/not an image/)).toBeVisible();
  await expect(page.getByText(/ready to publish with the post/)).toHaveCount(0);
});

test("Share a learning publishes a titled, topicked entry to the learning feed", async ({ page }) => {
  const title = `E2E learning ${stamp()}`;
  const lesson = "Two weeks of readings showed the enclosure caused the bigger error.";
  const takeaway = "Vent the housing before blaming the sensor.";

  await page.goto("/create/learning");
  await page.getByLabel("Learning title").fill(title);
  await page.getByLabel("What did you learn?").fill(lesson);
  await page.getByLabel("Explanation and key takeaways").fill(takeaway);
  await page.getByLabel("Topic").fill("E2E calibration");
  await page.getByRole("button", { name: "Publish learning" }).click();

  await page.waitForURL(/\/posts\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(lesson)).toBeVisible();
  await expect(page.getByText(takeaway)).toBeVisible();

  await page.goto("/home?filter=learning");
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("Share an update stores progress and appears in the project timeline", async ({ page }) => {
  const title = `E2E project update ${stamp()}`;
  const body = "The second enclosure survived a week of rain and the readings are stable.";

  await page.goto("/create/update");
  await page.getByLabel("Project").selectOption({ label: "River Watch" });
  await page.getByLabel("Update title").fill(title);
  await page.getByRole("textbox", { name: /^Update \(required\)/ }).fill(body);
  await page.getByLabel("Progress").fill("40");
  await page.getByLabel("Milestone").fill("Field-ready enclosure");
  await page.getByRole("button", { name: "Publish update" }).click();

  await page.waitForURL(/\/projects\/p-river\?tab=progress/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText("40% complete")).toBeVisible();
  await expect(page.getByText("Milestone: Field-ready enclosure")).toBeVisible();

  await page.goto("/home?filter=updates");
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("New teaching publishes objectives learners can see", async ({ page }) => {
  const title = `E2E teaching ${stamp()}`;
  const objective = "Explain how a gauge board measures flow";
  const second = "Choose the right sensor for a field site";

  await page.goto("/create/teaching");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Summary").fill("A short field guide for volunteer river monitors.");
  await page.getByLabel("Main content").fill("Find the zero mark on the board, then read the water line.");
  await page.getByLabel("Learning objectives and key takeaways").fill(`${objective}\n${second}`);
  await page.getByLabel("Topic").fill("E2E hydrology");
  await page.getByRole("button", { name: "Publish teaching" }).click();

  await page.waitForURL(/\/learn\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(objective)).toBeVisible();
  await expect(page.getByText(second)).toBeVisible();

  await page.goto("/explore?tab=learning");
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("New course saves a draft and lets lessons be added and reordered", async ({ page }) => {
  test.setTimeout(120_000);
  const title = `E2E course ${stamp()}`;

  await page.goto("/studio/courses/new");
  await page.getByLabel("Course title").fill(title);
  await page.getByLabel("Short description").fill("A practical course created by the browser regression suite.");
  await page.getByLabel("Learning outcomes").fill("Build a working example\nExplain the core idea");
  await page.getByRole("button", { name: "Create course draft" }).click();

  await page.waitForURL(/\/studio\/courses\/[^/?]+/);

  await page.getByLabel("Module title").fill("Getting started");
  await page.getByRole("button", { name: "Add module" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Getting started" })).toBeVisible();
  // Wait for the add-module redirect to settle before opening another disclosure.
  await expect(page.getByText("Module added.")).toBeVisible();

  // Add two lessons through the module's own lesson form.
  const lessonTitle = page.locator('input[id^="new-lesson-title-"]');
  const lessonBody = page.locator('textarea[id^="new-lesson-body-"]');
  await page.locator("summary", { hasText: "Add a lesson" }).first().click();
  await expect(lessonTitle).toBeVisible();
  await lessonTitle.fill("Lesson one");
  await lessonBody.fill("Start with the smallest working example.");
  await page.getByRole("button", { name: "Add lesson" }).click();
  await expect(page.getByText("Lesson one", { exact: true })).toBeVisible();

  await page.locator("summary", { hasText: "Add a lesson" }).first().click();
  await expect(lessonTitle).toBeVisible();
  await lessonTitle.fill("Lesson two");
  await lessonBody.fill("Now test the example against a real input.");
  await page.getByRole("button", { name: "Add lesson" }).click();
  await expect(page.getByText("Lesson two", { exact: true })).toBeVisible();

  // Ordering is a real operation, not a label.
  await page.getByRole("button", { name: "Move Lesson two up" }).click();
  await expect(page.getByText("1.1", { exact: true })).toBeVisible();
  await expect(page.getByText("Lesson two", { exact: true })).toBeVisible();

  // A course remains a draft until its creator publishes it.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
});

test("New task explains the no-project case and offers a real route forward", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL as string;
  const suffix = Date.now().toString().slice(-8);
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto("/auth/sign-up");
  await page.getByLabel("Display name").fill("Robin Fielding");
  await page.getByLabel("Username").fill(`robin_${suffix}`);
  await page.getByLabel("Email").fill(`robin${suffix}@example.test`);
  await page.getByLabel("Password").fill("RiverSensors2026!");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/home");
  await page.getByRole("button", { name: "Skip guidance" }).click();

  await page.goto("/create/task");
  await expect(page.getByText("You are not on a project team yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a project" })).toHaveAttribute("href", "/explore?tab=projects");

  await context.close();
});

test("New task routes an eligible owner into their project board and saves a task", async ({ page }) => {
  const title = `E2E task ${stamp()}`;

  await page.goto("/create/task");
  await expect(page.getByText("River Watch", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /River Watch/ }).click();
  await page.waitForURL(/\/projects\/p-river\/tasks/);

  await page.goto("/projects/p-river/tasks?view=new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Acceptance criteria").fill("The enclosure is photographed and the readings are linked.");
  await page.locator("summary", { hasText: "More options" }).click();
  await page.getByLabel("What the contributor receives").fill("Credit in the field notes and a written reference.");
  await page.getByRole("button", { name: "Save as draft" }).click();

  await page.waitForURL(/\/tasks\/[^/?]+/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});
