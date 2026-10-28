import { expect, test, type Page } from "@playwright/test";

/**
 * Horizontal swipe navigation on touch devices.
 *
 * Coordinates are dispatched through CDP so the app receives real touch events,
 * not synthetic DOM events. Each valid swipe must change the route and the active
 * bottom-navigation item; Create must never appear in the sequence.
 */
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

/**
 * Find a point on the page that is ordinary content rather than a control,
 * a dialog, the bottom bar or a horizontal rail. The gesture must work when it
 * starts on the page; starting on a control is covered by its own tests.
 */
async function safeSurface(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const blocked =
      "input,textarea,select,button,[contenteditable='true'],[role='slider'],[role='dialog'],[role='menu'],[aria-modal='true'],[data-swipe-ignore]";
    for (const fy of [0.45, 0.35, 0.55, 0.25, 0.65]) {
      for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        const x = Math.round(window.innerWidth * fx);
        const y = Math.round(window.innerHeight * fy);
        const element = document.elementFromPoint(x, y);
        if (!element || element.closest(blocked)) continue;
        let node: Element | null = element;
        let inRail = false;
        while (node && node !== document.body) {
          const style = window.getComputedStyle(node);
          if (
            (style.overflowX === "auto" || style.overflowX === "scroll") &&
            node.scrollWidth > node.clientWidth + 8
          ) {
            inRail = true;
            break;
          }
          node = node.parentElement;
        }
        if (!inRail) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error("No non-interactive surface to start the swipe from.");
  return point;
}

async function swipe(
  page: Page,
  direction: "left" | "right" | "up" | "down",
  options: { x?: number; y?: number; distance?: number } = {},
) {
  // Wait for hydration to attach the listener; without this a fast swipe after
  // `goto` can be dispatched before the client component exists.
  await page.waitForFunction(() => document.documentElement.dataset.swipeReady === "true");

  const viewport = page.viewportSize()!;
  const distance = options.distance ?? Math.round(viewport.width * 0.45);
  const surface = options.x !== undefined && options.y !== undefined ? null : await safeSurface(page);
  const x = options.x ?? surface!.x;
  const y = options.y ?? surface!.y;

  const from =
    direction === "left"
      ? { x: x + distance / 2, y }
      : direction === "right"
        ? { x: x - distance / 2, y }
        : direction === "up"
          ? { x, y: y + distance / 2 }
          : { x, y: y - distance / 2 };
  const to =
    direction === "left"
      ? { x: from.x - distance, y }
      : direction === "right"
        ? { x: from.x + distance, y }
        : direction === "up"
          ? { x, y: from.y - distance }
          : { x, y: from.y + distance };

  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / 8,
          y: from.y + ((to.y - from.y) * step) / 8,
        },
      ],
    });
    await page.waitForTimeout(12);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

async function activeTab(page: Page) {
  return page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="page"]').getAttribute("aria-label");
}

const FORWARD: [string, string][] = [
  ["/home", "/explore"],
  ["/explore", "/chats"],
  ["/chats", "/u/maya_okafor"],
];

const BACKWARD: [string, string][] = [
  ["/u/maya_okafor", "/chats"],
  ["/chats", "/explore"],
  ["/explore", "/home"],
];

for (const [from, to] of FORWARD) {
  test(`a left swipe moves ${from} to ${to}`, async ({ page }) => {
    await page.goto(from);
    await swipe(page, "left");
    await page.waitForURL(`**${to}`);
    expect(new URL(page.url()).pathname).toBe(to);
    expect(new URL(page.url()).pathname).not.toBe("/create");
  });
}

for (const [from, to] of BACKWARD) {
  test(`a right swipe moves ${from} back to ${to}`, async ({ page }) => {
    await page.goto(from);
    await swipe(page, "right");
    await page.waitForURL(`**${to}`);
    expect(new URL(page.url()).pathname).toBe(to);
    expect(new URL(page.url()).pathname).not.toBe("/create");
  });
}

test("animates the outgoing and incoming pages with a named view transition", async ({ page }) => {
  await page.goto("/home");
  await swipe(page, "left");
  // Both markers are set synchronously, before the destination commits. They
  // prove the direction and that the View Transition path (not the plain push
  // fallback) owns the route change.
  const forward = await page.evaluate(() => ({
    direction: document.documentElement.dataset.swipeDirection,
    transition: document.documentElement.dataset.swipeTransition,
  }));
  expect(forward).toEqual({ direction: "left", transition: "view" });
  await page.waitForURL("**/explore");
  // Wait for the outgoing transition to release the gesture lock.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.swipeTransition)).toBeUndefined();

  // The backward gesture is the mirrored transition.
  await swipe(page, "right");
  const backward = await page.evaluate(() => ({
    direction: document.documentElement.dataset.swipeDirection,
    transition: document.documentElement.dataset.swipeTransition,
  }));
  expect(backward).toEqual({ direction: "right", transition: "view" });
  await page.waitForURL("**/home");
});

test("the destination becomes the active bottom-navigation item", async ({ page }) => {
  await page.goto("/home");
  await swipe(page, "left");
  await page.waitForURL("**/explore");

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: "Create" })).toBeVisible();
});

test("a swipe across the Create button never opens Create", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const create = nav.getByRole("button", { name: "Create" });
  const box = (await create.boundingBox())!;

  // Start and end across the centre action itself; the bar opts out of the gesture.
  await swipe(page, "left", { x: box.x + box.width / 2, y: box.y + box.height / 2, distance: 140 });

  await expect(page.getByRole("dialog", { name: "Create" })).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("vertical feed scrolling does not navigate", async ({ page }) => {
  await page.goto("/home");
  const before = await page.evaluate(() => window.scrollY);
  await swipe(page, "up", { y: 650, distance: 300 });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.scrollY);

  expect(new URL(page.url()).pathname).toBe("/home");
  expect(after).toBeGreaterThan(before);
});

test("a swipe that starts in a text field does not navigate", async ({ page }) => {
  await page.goto("/home");
  const composer = page.getByPlaceholder(/Share an update/).first();
  const box = (await composer.boundingBox())!;
  await swipe(page, "left", { x: box.x + box.width / 2, y: box.y + box.height / 2, distance: 220 });

  expect(new URL(page.url()).pathname).toBe("/home");
});

test("a horizontal activity rail keeps its own gesture", async ({ page }) => {
  await page.goto("/home");
  const rail = page.locator('[aria-labelledby="following-activity"] ul').first();
  if ((await rail.count()) > 0) {
    const box = (await rail.boundingBox())!;
    const scrollBefore = await rail.evaluate((element) => element.scrollLeft);
    await swipe(page, "left", { x: box.x + box.width / 2, y: box.y + box.height / 2, distance: 180 });
    await page.waitForTimeout(200);
    const scrollAfter = await rail.evaluate((element) => element.scrollLeft);
    expect(new URL(page.url()).pathname).toBe("/home");
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore);
  } else {
    // No followed activity in this dataset is a valid empty state; the section
    // still opts out and must not navigate.
    const empty = page.locator('[aria-labelledby="following-activity"]');
    const box = (await empty.boundingBox())!;
    await swipe(page, "left", { x: box.x + box.width / 2, y: box.y + 40, distance: 180 });
    expect(new URL(page.url()).pathname).toBe("/home");
  }
});

test("browser back and forward stay in sync with the active tab", async ({ page }) => {
  await page.goto("/home");
  await swipe(page, "left");
  await page.waitForURL("**/explore");
  await swipe(page, "left");
  await page.waitForURL("**/chats");

  await page.goBack();
  await page.waitForURL("**/explore");
  expect(new URL(page.url()).pathname).toBe("/explore");
  expect(await activeTab(page)).toContain("Explore");

  await page.goForward();
  await page.waitForURL("**/chats");
  expect(new URL(page.url()).pathname).toBe("/chats");
  expect(await activeTab(page)).toContain("Chats");
});

test("swiping back to Home restores its scroll position", async ({ page }) => {
  await page.goto("/home");
  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const target = Math.min(150, Math.floor(maxScroll * 0.6));
  expect(target).toBeGreaterThan(0);
  await page.evaluate((y) => window.scrollTo(0, y), target);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await swipe(page, "left");
  await page.waitForURL("**/explore");
  await page.waitForTimeout(300);

  await swipe(page, "right");
  await page.waitForURL("**/home");
  // Next would start the destination at the top; a restored position proves the
  // per-destination memory, even when the page's maximum scroll differs slightly.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("tablet touch gestures work with the same routes", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/explore");
  await swipe(page, "left", { distance: 420 });
  await page.waitForURL("**/chats");
  expect(new URL(page.url()).pathname).toBe("/chats");
});

/**
 * Drag with real touch events, holding the finger down so the test can inspect
 * the page mid-gesture. Returns the CDP session so the caller ends the gesture.
 */
async function dragStart(page: Page, surface: { x: number; y: number }) {
  await page.waitForFunction(() => document.documentElement.dataset.swipeReady === "true");
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: surface.x, y: surface.y }],
  });
  return client;
}

test("the page follows the finger while dragging", async ({ page }) => {
  await page.goto("/home");
  const surface = await safeSurface(page);
  const client = await dragStart(page, surface);

  // A slow 45px drag stays under the 56px commit threshold, so the route must
  // not change; the page should still move with the finger.
  for (let index = 1; index <= 3; index += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: surface.x - index * 15, y: surface.y }],
    });
    await page.waitForTimeout(120);
  }

  expect(await page.evaluate(() => document.documentElement.dataset.swiping)).toBe("true");
  const dragged = await page.evaluate(
    () => getComputedStyle(document.getElementById("main")!).transform,
  );
  const offsetX = Number(dragged.replace(/^matrix\(([^)]+)\)$/, "$1").split(",")[4]);
  expect(offsetX).toBeLessThan(-10);

  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  expect(new URL(page.url()).pathname).toBe("/home");
  // The aborted drag springs back to rest, leaving no transform behind.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.getElementById("main")!).transform))
    .toBe("none");
  expect(await page.evaluate(() => document.documentElement.dataset.swiping)).toBeUndefined();
});

test("reduced motion still navigates, without the swipe animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");
  await swipe(page, "left");
  await page.waitForURL("**/chats");

  expect(new URL(page.url()).pathname).toBe("/chats");
  expect(await page.evaluate(() => document.documentElement.dataset.swipeDirection)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.dataset.swipeTransition)).toBeUndefined();
});
