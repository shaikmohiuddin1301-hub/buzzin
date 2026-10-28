import { expect, test } from "@playwright/test";
import { signInAs } from "./support";

/**
 * The contribution chain, driven through the visible UI: a contributor submits
 * work on a task the owner assigned, and the owner's approval files it as
 * accepted work. The second test then drafts and publishes a journey from the
 * approved documentation of a documented task. Nothing here is written straight
 * into the database, so a broken form, a missing permission check or a redirect
 * that loses the review state fails here.
 */

const TASK_ID = "t-calibration";
const TASK_TITLE = "Field calibration notes for the first two nodes";
// The journey is drafted from the task with approved public documentation, which
// is also the one the seeded housing build documented entry by entry.
const DOCUMENTED_TASK_ID = "t-housing";
const DOCUMENTED_TASK_TITLE = "Prototype a repairable sensor housing";
const SUBMISSION_NOTE =
  "All four sites visited. The comparison table is attached and the cheap nodes read 0.9–1.6 NTU higher than the reference meter, so the notes state that limitation plainly.";

test("a contributor submits work and the owner's approval files it as accepted work", async ({ page, browser }) => {
  const baseURL = test.info().project.use.baseURL as string;

  // ---- contributor: Amara is the seeded assignee of this private task ----
  const { context, page: contributor } = await signInAs(browser, baseURL, "amara@example.test");

  await contributor.goto(`/tasks/${TASK_ID}`);
  await expect(contributor.getByRole("heading", { level: 1, name: TASK_TITLE })).toBeVisible();

  // Only an assignee with an open task sees the submission form at all.
  await contributor.getByLabel("What are you handing over?").fill(SUBMISSION_NOTE);
  await contributor.getByLabel("Deliverable link").fill("https://example.test/river-watch/calibration-table");
  await contributor.getByLabel("Link title").fill("Calibration comparison table");
  await contributor.getByRole("button", { name: "Submit for review" }).click();

  await contributor.waitForURL((url) => url.searchParams.get("notice") === "Work submitted for review.");
  await expect(contributor.getByText(SUBMISSION_NOTE)).toBeVisible();
  // The form is gone: the task is with the reviewer now.
  await expect(contributor.getByRole("button", { name: "Submit for review" })).toHaveCount(0);

  await context.close();

  // ---- owner: Maya reviews the same submission in her own session ----
  await page.goto(`/tasks/${TASK_ID}`);
  await expect(page.getByText(SUBMISSION_NOTE)).toBeVisible();

  await page
    .getByLabel("Approve with a note (optional)")
    .fill("All four sites documented and the offset is stated as a limitation. Approved.");
  await page.getByRole("button", { name: "Approve work" }).click();

  await page.waitForURL((url) => url.searchParams.get("approved") === "1");
  await expect(page.getByText("Work approved and filed.")).toBeVisible();

  // Approval is only real if the deliverable is now in the project's Accepted Work.
  await page.goto("/projects/p-river/accepted");
  await expect(page.getByRole("heading", { level: 1, name: "Accepted work" })).toBeVisible();
  const card = page.locator("li", { has: page.getByRole("heading", { name: "Calibration comparison table" }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Amara Diallo" })).toBeVisible();
  await expect(card.getByText("accepted by Maya Okafor")).toBeVisible();
  await expect(card.getByText("Contribution recorded")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open deliverable" })).toHaveAttribute(
    "href",
    "https://example.test/river-watch/calibration-table",
  );
});

test("a journey drafted from approved documentation lists its steps and publishes", async ({ page }) => {
  await page.goto(`/tasks/${DOCUMENTED_TASK_ID}/learning-journey`);
  await expect(page.getByRole("heading", { level: 1, name: "Turn this task into a learning journey" })).toBeVisible();

  await page.getByRole("button", { name: "Create draft journey" }).click();
  await page.waitForURL(/\/learn\/journeys\/[^/?]+/);

  await expect(
    page.getByRole("heading", { level: 1, name: `How we delivered: ${DOCUMENTED_TASK_TITLE}` }),
  ).toBeVisible();

  // Every public work-log entry for this task became a step, and each one cites
  // the record it was drafted from rather than inventing prose.
  for (const title of [
    "Starting point: what actually breaks",
    "First ingress test failed (and why that was useful)",
    "Decision: keep screws, reject press-fit",
    "What I would tell the next person",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText("source: work log")).toHaveCount(4);
  await expect(page.getByText(/Linked source record:/)).toHaveCount(4);

  // A draft with at least two steps can be published by the project owner.
  const publish = page.getByRole("button", { name: "Publish journey" });
  await expect(publish).toBeEnabled();
  await publish.click();

  await page.waitForURL((url) => url.searchParams.get("notice") === "Journey published.");
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish journey" })).toHaveCount(0);
});
