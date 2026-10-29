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
  options: { x?: number; y?: number; distance?: number; settle?: boolean } = {},
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

  // Opt-in: wait until the swipe transition has fully released the gesture, so a
  // test that fires swipes back to back is racing the interaction, not the lock.
  if (options.settle) {
    await page.waitForFunction(() => !document.documentElement.dataset.swipeTransition, undefined, {
      timeout: 20_000,
    });
  }
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

test("a right swipe returns to the screen the reader actually came from", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });

  // Reaching Chats by tapping the bar is still a visit, so a right swipe goes
  // back to Home rather than to Explore, which the fixed tab order would pick.
  await nav.getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");

  await swipe(page, "right");
  await page.waitForURL("**/home");
  expect(new URL(page.url()).pathname).toBe("/home");
  expect(await activeTab(page)).toContain("Home");
});

test("repeated right swipes walk the visited screens in reverse", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");

  await swipe(page, "right");
  await page.waitForURL("**/home");

  // Home is the first screen visited: the history is exhausted, and the tab
  // fallback has nothing to the left either, so the page stays put.
  await swipe(page, "right");
  await page.waitForTimeout(400);
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("an exhausted history uses the adjacent tab as the fallback", async ({ page }) => {
  // Chats opened directly has no previous screen, so back is Explore: the tab
  // before it in the bar, never Create and never an unrelated page.
  await page.goto("/chats");
  await swipe(page, "right");
  await page.waitForURL("**/explore");
  expect(new URL(page.url()).pathname).toBe("/explore");
});

test("a left swipe replays a screen the reader swiped back out of", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");

  await swipe(page, "right");
  await page.waitForURL("**/home");

  await swipe(page, "left");
  await page.waitForURL("**/chats");
  expect(new URL(page.url()).pathname).toBe("/chats");
  expect(await activeTab(page)).toContain("Chats");
});

test("re-selecting the active tab does not add a history entry", async ({ page }) => {
  await page.goto("/explore");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Explore" }).click();
  await nav.getByRole("link", { name: "Explore" }).click();
  await page.waitForTimeout(200);

  // The only visit is Explore, so back falls through to Home rather than
  // replaying Explore itself or a duplicate of it.
  await swipe(page, "right");
  await page.waitForURL("**/home");
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("the browser's back button agrees with the swipe history", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");

  await swipe(page, "right");
  await page.waitForURL("**/home");

  // The swipe is a real route change, so back returns to Chats and the bar agrees.
  await page.goBack();
  await page.waitForURL("**/chats");
  expect(await activeTab(page)).toContain("Chats");

  // The history moved with the browser, so back is still Home, not Explore.
  await swipe(page, "right");
  await page.waitForURL("**/home");
  expect(new URL(page.url()).pathname).toBe("/home");
});

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
  // The first visit compiles the route in dev; give the cold start room so a
  // slow machine cannot turn a hydration wait into a false failure.
  test.slow();
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

test("the destination's edge is revealed in the gap while dragging", async ({ page }) => {
  await page.goto("/home");
  const surface = await safeSurface(page);
  const client = await dragStart(page, surface);

  // 80px is under the 22%-of-viewport commit distance on this 412px screen, so
  // this drag can only be a peek: it must still show the destination immediately.
  for (let index = 1; index <= 4; index += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: surface.x - index * 20, y: surface.y }],
    });
    await page.waitForTimeout(50);
  }

  const peek = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>("[data-swipe-peek]");
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const content = document.getElementById("main")!.getBoundingClientRect();
    return {
      display: getComputedStyle(element).display,
      width: Math.round(box.width),
      // Flush with the content area's edge (the layout viewport excludes the
      // desktop scrollbar, so this is the page's own right edge).
      right: Math.round(document.body.getBoundingClientRect().right - box.right),
      opacity: getComputedStyle(element).opacity,
      label: element.textContent?.trim(),
      insideContent: box.top >= content.top - 2,
    };
  });

  expect(peek).not.toBeNull();
  expect(peek!.display).toBe("flex");
  expect(peek!.width).toBeGreaterThan(20);
  expect(peek!.right).toBe(0);
  expect(Number(peek!.opacity)).toBe(1);
  expect(peek!.label).toBe("Explore");
  expect(peek!.insideContent).toBe(true);

  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  // Under the threshold: the page snaps back, the preview leaves with it, and the
  // route does not change.
  expect(new URL(page.url()).pathname).toBe("/home");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("[data-swipe-peek]")!).display))
    .toBe("none");

  // A fuller drag names the destination, with the whole word inside the reveal.
  const wide = await dragStart(page, surface);
  for (let index = 1; index <= 8; index += 1) {
    await wide.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: surface.x - index * 25, y: surface.y }],
    });
    await page.waitForTimeout(40);
  }
  const peekLabel = () =>
    page.evaluate(() => getComputedStyle(document.querySelector("[data-swipe-peek] span")!).opacity);
  await expect.poll(peekLabel).toBe("1");

  const label = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>("[data-swipe-peek]")!;
    const span = element.querySelector("span")!;
    return {
      width: element.getBoundingClientRect().width,
      spanWidth: span.getBoundingClientRect().width,
      text: span.textContent,
    };
  });
  expect(label.text).toBe("Explore");
  expect(label.spanWidth).toBeLessThanOrEqual(label.width);

  await wide.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wide.detach();
  await page.waitForURL("**/explore");
});

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

/**
 * Hold a swipe at a committed distance, so a sampler can be installed before the
 * finger is lifted and the transition can be watched from outside the page.
 */
async function holdSwipe(page: Page, dx: number) {
  const surface = await safeSurface(page);
  const client = await dragStart(page, surface);
  for (let step = 1; step <= 6; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: surface.x + (dx * step) / 6, y: surface.y }],
    });
    await page.waitForTimeout(15);
  }
  return { client, surface };
}

/**
 * Sample the live transition from the page. `requestAnimationFrame` stops while
 * the snapshots are animating, so a plain interval is the reliable clock here.
 */
async function startTransitionSampler(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __swipe: { rows: unknown[]; timer: number } };
    const parseX = (value: string) => {
      const matrix = value.match(/^matrix(?:3d)?\((.+)\)$/);
      if (!matrix) return 0;
      const parts = matrix[1]!.split(",").map((part) => Number(part.trim()));
      return parts.length === 16 ? parts[12]! : parts[4]!;
    };

    w.__swipe = { rows: [], timer: 0 };
    w.__swipe.timer = window.setInterval(() => {
      const root = document.documentElement;
      const main = document.getElementById("main");
      if (!main) return;
      const pseudo = (name: string) => getComputedStyle(root, name);
      const animations = root
        .getAnimations({ subtree: true })
        .map((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const pseudoElement =
            (effect as unknown as { pseudoElement?: string | null } | null)?.pseudoElement ?? null;
          if (!pseudoElement?.includes("app-content")) return null;
          const timing = effect?.getTiming();
          return {
            pseudo: pseudoElement,
            name: (animation as unknown as { animationName?: string }).animationName ?? null,
            state: animation.playState,
            time: Math.round(Number(animation.currentTime ?? -1)),
            duration: typeof timing?.duration === "number" ? timing.duration : 0,
            easing: String(timing?.easing ?? "").replace(/\s+/g, ""),
          };
        })
        .filter((entry) => entry !== null);

      w.__swipe.rows.push({
        oldX: Math.round(parseX(pseudo("::view-transition-old(app-content)").transform)),
        newX: Math.round(parseX(pseudo("::view-transition-new(app-content)").transform)),
        mainWidth: Math.round(main.getBoundingClientRect().width),
        textLength: main.textContent?.trim().length ?? 0,
        // The destination's own rendered content, not a preview or placeholder.
        destination: Boolean(document.querySelector('input[placeholder*="Search people"]')),
        // The declarations the pseudo-elements carry while they exist.
        declared: ["::view-transition-old(app-content)", "::view-transition-new(app-content)"].map(
          (name) => {
            const style = pseudo(name);
            return {
              duration: style.animationDuration,
              easing: style.animationTimingFunction.replace(/\s+/g, ""),
            };
          },
        ),
        animations,
      });
    }, 25);
  });
}

async function readTransitionSamples(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __swipe: {
        rows: {
          oldX: number;
          newX: number;
          mainWidth: number;
          textLength: number;
          destination: boolean;
          declared: { duration: string; easing: string }[];
          animations: { pseudo: string; name: string | null; state: string; time: number; duration: number; easing: string }[];
        }[];
        timer: number;
      };
    };
    window.clearInterval(w.__swipe.timer);
    return w.__swipe.rows;
  });
}

test("the two real pages move together as one continuous transition", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("heading", { name: /Welcome back, Maya/ }).waitFor();

  const { client } = await holdSwipe(page, -150);
  await startTransitionSampler(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  await page.waitForURL("**/explore");
  await page.waitForTimeout(800);
  const samples = await readTransitionSamples(page);
  const running = samples.filter((sample) =>
    sample.animations.some((animation) => animation.pseudo === "::view-transition-old(app-content)"),
  );

  // The real destination page is rendered, not a stand-in.
  expect(await page.getByPlaceholder(/Search people/).count()).toBe(1);
  expect(await page.getByRole("heading", { name: /Welcome back, Maya/ }).count()).toBe(0);

  // Several frames of the animation were observed, both pages included.
  expect(running.length).toBeGreaterThanOrEqual(3);
  const names = running.flatMap((sample) => sample.animations.map((animation) => animation.name));
  expect(names).toContain("bt-swipe-out-left");
  expect(names).toContain("bt-swipe-in-right");

  for (const sample of running) {
    const oldPage = sample.animations.find((animation) => animation.pseudo === "::view-transition-old(app-content)")!;
    const newPage = sample.animations.find((animation) => animation.pseudo === "::view-transition-new(app-content)")!;

    // Same duration, same frame: one movement, not two animations.
    for (const animation of [oldPage, newPage]) expect(animation.duration).toBe(300);
    expect(Math.abs(oldPage.time - newPage.time)).toBeLessThanOrEqual(2);

    // The two snapshots stay exactly one page width apart: the incoming page is
    // the outgoing page's neighbour on one strip, so the gap never changes.
    expect(Math.abs(sample.newX - sample.oldX - sample.mainWidth)).toBeLessThanOrEqual(2);

    // The incoming snapshot is the delivered destination, and the page is never blank.
    expect(sample.destination).toBe(true);
    expect(sample.textLength).toBeGreaterThan(20);
  }

  // The animation actually progresses from the release pose to the destination.
  const first = running[0]!;
  const last = running[running.length - 1]!;
  expect(last.oldX).toBeLessThan(first.oldX);
  expect(last.newX).toBeLessThan(first.newX);

  // Both pseudo-elements declare the same 300ms curve. (The runtime timing object
  // reports `linear` because the curve lives inside the browser-authored keyframes.)
  for (const sample of running) {
    for (const declaration of sample.declared) {
      expect(declaration.duration).toBe("0.3s");
      expect(declaration.easing).toBe("cubic-bezier(0.22,1,0.36,1)");
    }
  }
});

test("every page never goes blank while a swipe commits", async ({ page }) => {
  await page.goto("/chats");
  const { client } = await holdSwipe(page, -150);
  await startTransitionSampler(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();

  await page.waitForURL("**/u/maya_okafor");
  await page.waitForTimeout(800);
  const samples = await readTransitionSamples(page);

  expect(samples.length).toBeGreaterThan(5);
  for (const sample of samples) {
    expect(sample.textLength).toBeGreaterThan(20);
    expect(sample.mainWidth).toBeGreaterThan(100);
  }
});

test("the swipe history survives a reload", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Chats" }).click();
  await page.waitForURL("**/chats");
  await page.reload();

  // The adjacent-tab fallback from Chats would be Explore; only the stored
  // history can send this swipe back to Home.
  await swipe(page, "right");
  await page.waitForURL("**/home");
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("every swipe lands on the destination's own rendered page", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /Welcome back, Maya/ })).toBeVisible();

  await swipe(page, "left");
  await page.waitForURL("**/explore");
  await expect(page.getByPlaceholder(/Search people/)).toBeVisible();

  await swipe(page, "left");
  await page.waitForURL("**/chats");
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();

  await swipe(page, "left");
  await page.waitForURL("**/u/maya_okafor");
  await expect(page.getByRole("heading", { level: 1, name: "Maya Okafor" })).toBeVisible();

  // Back through the same screens, each with its own content rather than a
  // snapshot or a placeholder left on the page.
  await swipe(page, "right");
  await page.waitForURL("**/chats");
  await expect(page.getByPlaceholder("Search messages")).toBeVisible();

  await swipe(page, "right");
  await page.waitForURL("**/explore");
  await expect(page.getByPlaceholder(/Search people/)).toBeVisible();

  await swipe(page, "right");
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: /Welcome back, Maya/ })).toBeVisible();
});

// Each empty-history case is its own test: the point is one cold visit and one
// gesture, so a slow document load cannot eat another case's time budget.
for (const [from, to] of [
  ["/explore", "/home"],
  ["/chats", "/explore"],
  ["/u/maya_okafor", "/chats"],
] as const) {
  test(`an empty history falls back from ${from} to ${to}`, async ({ page }) => {
    // A fresh document is a fresh tab: no stored swipe history, so only the
    // explicit tab-order fallback can decide this destination.
    await page.addInitScript(() => window.sessionStorage.removeItem("bt.swipe-history"));
    await page.goto(from);
    await swipe(page, "right");
    await page.waitForURL(`**${to}`);
    expect(new URL(page.url()).pathname).toBe(to);
  });
}

test("the first screen has no fallback and does not wrap", async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.removeItem("bt.swipe-history"));
  await page.goto("/home");

  await swipe(page, "right");
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe("/home");
});

test("the last screen does not wrap and never opens Create", async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.removeItem("bt.swipe-history"));
  await page.goto("/u/maya_okafor");

  await swipe(page, "left");
  await page.waitForTimeout(500);

  expect(new URL(page.url()).pathname).toBe("/u/maya_okafor");
  await expect(page.getByRole("dialog", { name: "Create" })).toHaveCount(0);
});

test("rapid repeated swipes advance one page at a time", async ({ page }) => {
  await page.goto("/home");
  for (const to of ["/explore", "/chats", "/u/maya_okafor"]) {
    await swipe(page, "left", { distance: 220, settle: true });
    await page.waitForURL(`**${to}`);
  }
  expect(await activeTab(page)).toContain("Profile");

  for (const to of ["/chats", "/explore", "/home"]) {
    await swipe(page, "right", { distance: 220, settle: true });
    await page.waitForURL(`**${to}`);
  }
  expect(await activeTab(page)).toContain("Home");
});

test("an overlapping gesture never skips a page and leaves the swipe usable", async ({ page }) => {
  await page.goto("/home");
  // No waiting for the route: the second gesture lands while the first is still
  // transitioning. It may be dropped, but it must never skip a screen.
  await swipe(page, "left");
  await swipe(page, "left");
  await page.waitForTimeout(900);

  const pathname = new URL(page.url()).pathname;
  expect(["/explore", "/chats"]).toContain(pathname);

  const next = pathname === "/explore" ? "/chats" : "/u/maya_okafor";
  await swipe(page, "left");
  await page.waitForURL(`**${next}`);
});

test.describe("desktop widths", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false });

  test("a pointer drag is not a page swipe and links still navigate", async ({ page }) => {
    await page.goto("/home");
    await page.mouse.move(700, 480);
    await page.mouse.down();
    await page.mouse.move(420, 480, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    expect(new URL(page.url()).pathname).toBe("/home");
    await expect(page.locator("[data-swipe-peek]")).toHaveCSS("display", "none");

    await page.locator('aside a[href="/explore"]').first().click();
    await page.waitForURL("**/explore");
  });
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
