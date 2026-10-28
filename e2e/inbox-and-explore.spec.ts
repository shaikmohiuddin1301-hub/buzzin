import { expect, test } from "@playwright/test";
import { signInAs } from "./support";

/**
 * The messaging and discovery surfaces.
 *
 * These use the seeded records (the River Watch team chat and the direct message
 * with Leo Chen) rather than invented fixtures, so a passing test means the real
 * inbox, thread and composer work end to end.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("the inbox is a conversation list, not an explanation", async ({ page }) => {
  await page.goto("/chats");

  // The old introduction is gone.
  await expect(page.getByText("Task chats, project chats and direct messages")).toHaveCount(0);

  const inbox = page.getByRole("region", { name: "Conversations" });
  await expect(inbox.getByRole("link", { name: /River Watch team/ })).toBeVisible();
  await expect(inbox.getByRole("link", { name: /Leo Chen/ })).toBeVisible();

  // The header search filters the list server-side.
  const search = page.getByRole("searchbox", { name: "Search conversations" });
  await search.fill("river");
  await search.press("Enter");
  await page.waitForURL(/\/chats\?q=river/);

  await expect(inbox.getByRole("link", { name: /River Watch team/ })).toBeVisible();
  await expect(inbox.getByRole("link", { name: /Leo Chen/ })).toHaveCount(0);
});

test("a conversation opens, shows the thread, and sends a message", async ({ page }) => {
  await page.goto("/chats");
  await page.getByRole("region", { name: "Conversations" }).getByRole("link", { name: /River Watch team/ }).click();
  await page.waitForURL("**/chats/conv-river");

  await expect(page.getByRole("heading", { level: 1, name: "River Watch team" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to chats" })).toBeVisible();
  // Real history from the backend, not a placeholder.
  await expect(page.getByText("The BOM now lists the correct gland.")).toBeVisible();

  const body = `Playwright says hello ${Date.now()}`;
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(body)).toBeVisible();

  await page.getByRole("link", { name: "Back to chats" }).click();
  await page.waitForURL("**/chats");
  await expect(page.getByRole("region", { name: "Conversations" }).getByText(body)).toBeVisible();
});

test("the new-message composer opens a real conversation", async ({ page }) => {
  await page.goto("/chats?compose=1");

  await expect(page.getByRole("heading", { name: "New message" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search people to message" });
  await search.fill("Jonas");
  await search.press("Enter");
  await page.waitForURL(/compose=1/);

  await page
    .getByRole("listitem")
    .filter({ hasText: "Jonas Berg" })
    .getByRole("button", { name: "Message" })
    .click();

  await page.waitForURL(/\/chats\/[0-9a-f-]{8,}/);
  await expect(page.getByRole("heading", { level: 1, name: "Jonas Berg" })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
});

test("a first message from a stranger waits in requests until it is accepted", async ({ browser, baseURL }) => {
  const sender = await signInAs(browser, baseURL!, "leo@example.test");
  const recipient = await signInAs(browser, baseURL!, "priya@example.test");

  // Priya only accepts messages from people she shares a project with by default;
  // opening it up is her own privacy choice, made through the real settings form.
  await recipient.page.goto("/settings?tab=privacy");
  await recipient.page.getByLabel("Who can message you").selectOption({ label: "Anyone" });
  await recipient.page.getByRole("button", { name: "Save privacy settings" }).click();
  await recipient.page.waitForURL(/notice=Privacy\+settings\+saved/);

  // Leo and Priya share no project, so this is a request rather than an inbox item.
  await sender.page.goto("/chats?compose=1");
  await sender.page.getByRole("searchbox", { name: "Search people to message" }).fill("Priya");
  await sender.page.getByRole("searchbox", { name: "Search people to message" }).press("Enter");
  await sender.page.waitForURL(/compose=1/);
  await sender.page
    .getByRole("listitem")
    .filter({ hasText: "Priya Nair" })
    .getByRole("button", { name: "Message" })
    .click();
  await sender.page.waitForURL(/\/chats\/[0-9a-f-]{8,}/);

  const request = `Hello Priya, this is a request ${Date.now()}`;
  await sender.page.getByLabel("Message", { exact: true }).fill(request);
  await sender.page.getByRole("button", { name: "Send" }).click();
  await expect(sender.page.getByText(request)).toBeVisible();

  await recipient.page.goto("/chats");
  // Nothing leaks into the inbox or its badge...
  const inbox = recipient.page.getByRole("region", { name: "Conversations" });
  await expect(inbox.getByText("Leo Chen")).toHaveCount(0);
  // ...it is waiting as a request.
  await recipient.page.getByRole("link", { name: /Message requests/ }).click();
  await recipient.page.waitForURL(/requests=1/);
  await expect(recipient.page.getByText(request)).toBeVisible();

  // Previewing does not accept it, and replying is impossible until accepted.
  await recipient.page.getByRole("link", { name: "Preview" }).click();
  await recipient.page.waitForURL(/\/chats\/[0-9a-f-]{8,}/);
  await expect(recipient.page.getByRole("heading", { name: "Message request" })).toBeVisible();
  await expect(recipient.page.getByText("Accept this request to reply.")).toBeVisible();

  await recipient.page.getByRole("button", { name: "Accept request" }).click();
  await expect(recipient.page.getByLabel("Message", { exact: true })).toBeVisible();

  const reply = `Accepted, happy to talk ${Date.now()}`;
  await recipient.page.getByLabel("Message", { exact: true }).fill(reply);
  await recipient.page.getByRole("button", { name: "Send" }).click();
  await expect(recipient.page.getByText(reply)).toBeVisible();

  // It is a normal conversation in the inbox from now on.
  await recipient.page.goto("/chats");
  await expect(
    recipient.page.getByRole("region", { name: "Conversations" }).getByRole("link", { name: /Leo Chen/ }),
  ).toBeVisible();

  await sender.context.close();
  await recipient.context.close();
});

test("a message reaches the other person's open thread without a reload", async ({ page, browser, baseURL }) => {
  const partner = await signInAs(browser, baseURL!, "leo@example.test");
  await partner.page.goto("/chats/conv-dm");
  await expect(partner.page.getByRole("heading", { level: 1, name: "Maya Okafor" })).toBeVisible();

  // A marker that a full document load would wipe.
  await partner.page.evaluate(() => {
    (window as unknown as { __liveMarker?: string }).__liveMarker = "still-here";
  });

  await page.goto("/chats/conv-dm");
  const body = `Delivered live ${Date.now()}`;
  await page.getByLabel("Message", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Send" }).click();

  // The stream pushes the change; the open thread refreshes itself.
  await expect(partner.page.getByText(body)).toBeVisible({ timeout: 20_000 });
  expect(await partner.page.evaluate(() => (window as unknown as { __liveMarker?: string }).__liveMarker)).toBe(
    "still-here",
  );

  await partner.context.close();
});

test("the header and page surface follow a client-side navigation", async ({ page }) => {
  await page.goto("/home");
  await expect(page.locator("header").getByRole("link", { name: /^Notifications/ })).toBeVisible();
  await expect(page.locator("div.page-surface").first()).toBeVisible();

  // A link click, not a full load: the shell must update itself.
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Explore" }).click();
  await page.waitForURL("**/explore");
  await expect(page.locator("header").getByRole("searchbox", { name: "Search people, projects and skills" })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: /^Notifications/ })).toHaveCount(0);
  await expect(page.locator("div.page-surface-secondary").first()).toBeVisible();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");
  await expect(page.locator("header").getByRole("searchbox", { name: "Search conversations" })).toBeVisible();
});

test("the fixed bar never covers the message composer", async ({ page }) => {
  await page.goto("/chats/conv-river");

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeVisible();

  const composer = await send.boundingBox();
  const nav = await page.getByRole("navigation", { name: "Primary" }).boundingBox();
  expect(composer).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y);
});

test("the five destinations fit a phone without sideways scrolling", async ({ page }) => {
  for (const path of ["/home", "/explore", "/chats", "/u/maya_okafor"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("Explore search is in the header and keeps the category", async ({ page }) => {
  await page.goto("/explore");

  const search = page.getByRole("searchbox", { name: "Search people, projects and skills" });
  await expect(search).toBeVisible();

  await search.fill("jonas");
  await search.press("Enter");
  await page.waitForURL(/\/explore\?tab=foryou&q=jonas|\/explore\?q=jonas/);

  // The default category answers the term instead of silently ignoring it.
  const results = page.getByRole("region", { name: /Results for/ });
  await expect(results.getByRole("link", { name: "Jonas Berg" })).toBeVisible();

  // Switching category keeps the search term.
  await page.getByRole("navigation", { name: "Section navigation" }).getByRole("link", { name: "People" }).click();
  await page.waitForURL(/tab=people/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("jonas");
  await expect(page.getByRole("link", { name: "Jonas Berg" }).first()).toBeVisible();
});
