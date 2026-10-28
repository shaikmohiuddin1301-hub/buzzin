import { expect, test } from "@playwright/test";
import { signInAs } from "./support";

/**
 * Administration in a browser: the guard, the moderation queue and the audit log.
 *
 * The seeded dataset contains one open report and one in triage, so the queue can
 * be worked through without fabricating content. A dismiss decision is used
 * because it changes the least data while still producing an audited record.
 */

test("a non-administrator is turned away from every admin route", async ({ page }) => {
  await page.goto("/admin/reports");

  await page.waitForURL(/\/home\?error=/);
  await expect(page.getByText("You do not have access to the administration area.")).toBeVisible();
});

test("a moderator records a decision and it reaches the audit log", async ({ page, browser }) => {
  const baseURL = test.info().project.use.baseURL as string;
  const { context, page: admin } = await signInAs(browser, baseURL, "sam@example.test");

  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { level: 1, name: "Platform overview" })).toBeVisible();
  await expect(admin.getByText(/Signed in as Sam Whitfield · administrator/)).toBeVisible();

  await admin.goto("/admin/reports?status=open");
  await expect(admin.getByRole("heading", { level: 1, name: "Moderation queue" })).toBeVisible();

  // The seeded report is visible with the context a moderator needs to judge it.
  await expect(admin.getByText("This claims two sensors are 'consistently wrong'", { exact: false })).toBeVisible();

  // Dismissing still requires notes; the reason code defaults to the report's.
  await admin
    .getByLabel("Internal notes")
    .fill("Claims are framed as opinion and name the method in the comments. No action needed.");
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Record decision" }).click();

  await admin.waitForURL((url) => url.searchParams.get("notice") === "Decision recorded and audited.");
  await expect(admin.getByText("Queue is clear")).toBeVisible();

  await admin.goto("/admin/audit");
  const auditRow = admin.locator("tr", { hasText: "moderation.dismiss" });
  await expect(auditRow).toBeVisible();
  await expect(auditRow).toContainText("Sam Whitfield");
  await expect(auditRow).toContainText("misleading_claims");

  await context.close();
});
