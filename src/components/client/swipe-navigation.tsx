"use client";

/**
 * Horizontal swipe navigation between Home · Explore · Chats · Profile.
 *
 * This is navigation between the four real destinations, not a horizontally
 * scrolling strip: on a deliberate swipe the router changes route, so the URL,
 * server components, auth checks and browser history stay authoritative. Create
 * is not in the sequence and is ignored even when the gesture crosses it.
 *
 * Right is contextual, not a fixed tab: the component keeps the screens the
 * reader has actually been on (`SwipeHistory`) and a right swipe returns to the
 * one before this, with its href and scroll position. Only when that history is
 * exhausted does it fall back to the adjacent tab in the bar's order. Left
 * replays a screen the reader swiped back out of, then continues the sequence.
 *
 * Gesture rules:
 *   - touch only, one finger, starting away from the screen edges (the OS owns
 *     those back gestures);
 *   - the page follows the finger as soon as horizontal intent is clear, so the
 *     gesture answers immediately instead of waiting for the release, and the
 *     destination's edge is revealed in the gap it leaves;
 *   - about 22% of the viewport width of travel (never less than 56px), or a
 *     quick flick (18px at 0.3px/ms), with a clear horizontal bias;
 *   - vertical movement hands the gesture back to the page immediately, so feed
 *     scrolling never changes page;
 *   - a gesture that starts on a control, a dialog/menu, a horizontally
 *     scrollable rail or an opt-out subtree never navigates.
 *
 * Motion: dragging is a direct `transform`, written once per frame so the page
 * stays on the compositor. On release the drag offset is handed to the browser
 * View Transition API (`--swipe-shift`), so the outgoing page continues from
 * exactly where the finger left it while the incoming page arrives from the
 * opposite side. A cancelled drag springs back in 260ms. Without the API, or
 * with reduced motion requested, navigation happens immediately and the
 * existing route transition runs.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EMPTY_SWIPE_HISTORY,
  SWIPE_HISTORY_LIMIT,
  activeSwipeDestination,
  recordSwipeVisit,
  swipedFarEnough,
  swipeCommitDistance,
  swipeDestination,
  type SwipeDestinationId,
  type SwipeDirection,
  type SwipeHistory,
  type SwipeVisit,
} from "@/lib/navigation";

/** Elements that need the gesture for themselves. Links are intentionally not here:
 * a tap is distinguished by the movement threshold, while swiping across a card
 * should still navigate. */
const INTERACTIVE_TARGETS = [
  "input",
  "textarea",
  "select",
  "button",
  "[contenteditable='true']",
  "[role='slider']",
  "[role='dialog']",
  "[role='menu']",
  "[aria-modal='true']",
  "[data-swipe-ignore]",
].join(",");

const EDGE_GUARD = 24;
const AXIS_LOCK = 12;
/** How much of the finger's travel the page repeats, and how far it may go. */
const FOLLOW = 0.5;
const FOLLOW_LIMIT = 0.3;
const EDGE_FOLLOW = 0.14;
const SETTLE_MS = 260;
const TRANSITION_FALLBACK_MS = 2_000;
/** The shortest reveal that is worth showing; below it the peek would flicker. */
const PEEK_MIN = 6;
/** Wide enough for the destination's name, so it is never clipped mid-word. */
const PEEK_LABEL_MIN = 96;

/**
 * Where the swipe history is kept across a reload.
 *
 * `sessionStorage`, not a cookie or the server: it belongs to this tab and this
 * device, it is gone when the tab closes, and it never leaves the browser. The
 * swipe sequence itself is still decided from the live URL, so a stale or
 * malformed value can only ever shorten the history, never send the reader to a
 * page they cannot open — every entry is re-validated as one of the four routes.
 */
const SWIPE_STORAGE_KEY = "bt.swipe-history";

const DESTINATION_LABELS: Record<SwipeDestinationId, string> = {
  home: "Home",
  explore: "Explore",
  chats: "Chats",
  profile: "Profile",
};

function isSwipeVisit(value: unknown): value is SwipeVisit {
  const href = (value as { href?: unknown } | null)?.href;
  return typeof href === "string" && activeSwipeDestination(href) !== null;
}

function readStoredHistory(): SwipeHistory {
  try {
    const raw = window.sessionStorage.getItem(SWIPE_STORAGE_KEY);
    if (!raw) return EMPTY_SWIPE_HISTORY;
    const parsed = JSON.parse(raw) as { visits?: unknown; index?: unknown };
    if (!Array.isArray(parsed.visits)) return EMPTY_SWIPE_HISTORY;

    const visits = parsed.visits
      .filter(isSwipeVisit)
      .map((visit) => ({ href: visit.href, id: activeSwipeDestination(visit.href)! }))
      .slice(-SWIPE_HISTORY_LIMIT);
    if (visits.length === 0) return EMPTY_SWIPE_HISTORY;

    const index = typeof parsed.index === "number" ? parsed.index : visits.length - 1;
    return { visits, index: Math.min(Math.max(0, index), visits.length - 1) };
  } catch {
    return EMPTY_SWIPE_HISTORY;
  }
}

function writeStoredHistory(history: SwipeHistory): void {
  try {
    window.sessionStorage.setItem(SWIPE_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Private modes and full quotas are not a reason to break navigation.
  }
}

type Gesture = {
  active: boolean;
  axis: "none" | "horizontal" | "vertical";
  startX: number;
  startY: number;
  offset: number;
  /** Most recent horizontal sample, so the flick speed is the finger's, not the
   * whole gesture's: a slow start or a pause before release should not decide. */
  lastDx: number;
  lastAt: number;
  velocity: number;
  prefetchedLeft: boolean;
  prefetchedRight: boolean;
};

function main(): HTMLElement | null {
  return document.getElementById("main");
}

function isBlockedTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return true;
  if (element.closest(INTERACTIVE_TARGETS)) return true;
  if (document.body.style.overflow === "hidden") return true;

  // A horizontal rail or carousel owns its own gesture.
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth + 8
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function SwipeNavigation({ ownProfileHref }: { ownProfileHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  const profileRef = useRef(ownProfileHref);
  const historyRef = useRef<SwipeHistory>(EMPTY_SWIPE_HISTORY);
  const historyLoaded = useRef(false);
  const peekRef = useRef<HTMLDivElement>(null);
  const peekLabelRef = useRef<HTMLSpanElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const pendingRestore = useRef<string | null>(null);
  const pendingResolve = useRef<(() => void) | null>(null);
  const pendingFallback = useRef(false);
  const transitioning = useRef(false);

  // Every committed route is folded into one swipe history: a new screen is
  // appended, a screen already either side of the cursor moves it. That is what
  // makes a repeated tab selection, a right swipe and the browser's back button
  // share one record instead of each adding an entry.
  useEffect(() => {
    if (!historyLoaded.current) {
      historyLoaded.current = true;
      historyRef.current = readStoredHistory();
    }
    pathnameRef.current = pathname;
    historyRef.current = recordSwipeVisit(historyRef.current, pathname);
    writeStoredHistory(historyRef.current);
  }, [pathname]);

  useEffect(() => {
    profileRef.current = ownProfileHref;
  }, [ownProfileHref]);

  // Warm the two neighbours as soon as a destination has painted, so a swipe
  // commits without waiting for the RSC payload. This is the difference between
  // an animated transition and a frozen page while the data arrives.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const direction of ["left", "right"] as const) {
        const href = swipeDestination({
          history: historyRef.current,
          pathname,
          direction,
          ownProfileHref,
        });
        if (href) router.prefetch(href);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pathname, ownProfileHref, router]);

  // Once React has committed the destination, restore its saved scroll position
  // and then let the View Transition capture the new snapshot.
  useEffect(() => {
    const restoreTo = pendingRestore.current;
    pendingRestore.current = null;
    if (restoreTo) {
      const saved = scrollPositions.current.get(restoreTo);
      if (typeof saved === "number" && saved > 0) {
        // Restore in one frame: the app sets `scroll-behavior: smooth`, which would
        // otherwise animate underneath the view transition and land late.
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, saved);
        root.style.scrollBehavior = previous;
        // Next may still scroll to the top after this effect; correct once more.
        window.requestAnimationFrame(() => window.scrollTo(0, saved));
      }
    }

    // Resolve synchronously: the DOM for the destination is committed, and the
    // browser is waiting for this promise before it takes the new snapshot.
    // A requestAnimationFrame here would never fire while that capture is
    // pending, which leaves the old page frozen until the fallback timer.
    const resolve = pendingResolve.current;
    if (resolve) {
      pendingResolve.current = null;
      resolve();
    }

    if (pendingFallback.current) {
      pendingFallback.current = false;
      transitioning.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    const gesture: Gesture = {
      active: false,
      axis: "none",
      startX: 0,
      startY: 0,
      offset: 0,
      lastDx: 0,
      lastAt: 0,
      velocity: 0,
      prefetchedLeft: false,
      prefetchedRight: false,
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;

    // One compositor write per frame, not one per touch event.
    let paintFrame = 0;
    let shownOffset = 0;
    let settleTimer = 0;

    /** The destination's edge, revealed in the gap the dragged page leaves. */
    const peek = peekRef.current;
    const peekLabel = peekLabelRef.current;
    let surfaceTop = 0;
    let surfaceHeight = 0;
    let peekTimer = 0;
    let peekState: { direction: SwipeDirection; href: string | null; width: number } = {
      direction: "left",
      href: null,
      width: 0,
    };

    const hidePeek = (fade = false) => {
      window.clearTimeout(peekTimer);
      peekState = { ...peekState, href: null, width: 0 };
      if (!peek) return;
      peek.style.opacity = "0";
      if (fade) {
        // Keep the panel painted while the page springs back over it.
        peekTimer = window.setTimeout(() => {
          if (peek) peek.style.display = "none";
        }, SETTLE_MS);
      } else {
        peek.style.display = "none";
      }
    };

    const renderPeek = () => {
      if (!peek || !peekLabel || !peekState.href || peekState.width < PEEK_MIN) return;
      const id = activeSwipeDestination(peekState.href);
      if (!id) return;

      peekLabel.textContent = DESTINATION_LABELS[id];
      // Only name the screen once the reveal can hold the word; a sliver stays a
      // clean surface instead of showing half a label.
      peekLabel.style.opacity = peekState.width >= PEEK_LABEL_MIN ? "1" : "0";
      peek.style.display = "flex";
      peek.style.opacity = "1";
      peek.style.top = `${surfaceTop}px`;
      peek.style.height = `${surfaceHeight}px`;
      peek.style.width = `${peekState.width.toFixed(2)}px`;
      // A left swipe takes the page left, so the next screen shows at the right
      // edge; a right swipe reveals the previous one on the left.
      if (peekState.direction === "left") {
        peek.style.left = "";
        peek.style.right = "0px";
        peek.style.justifyContent = "flex-end";
        peek.style.borderLeftWidth = "1px";
        peek.style.borderRightWidth = "0px";
      } else {
        peek.style.left = "0px";
        peek.style.right = "";
        peek.style.justifyContent = "flex-start";
        peek.style.borderLeftWidth = "0px";
        peek.style.borderRightWidth = "1px";
      }
    };

    const writeOffset = () => {
      const element = main();
      if (element) {
        element.style.transform =
          shownOffset === 0 ? "" : `translate3d(${shownOffset.toFixed(2)}px,0,0)`;
      }
      renderPeek();
    };

    const applyOffset = (value: number, immediate = false) => {
      shownOffset = value;
      if (immediate) {
        if (paintFrame) {
          window.cancelAnimationFrame(paintFrame);
          paintFrame = 0;
        }
        writeOffset();
        return;
      }
      if (paintFrame) return;
      paintFrame = window.requestAnimationFrame(() => {
        paintFrame = 0;
        writeOffset();
      });
    };

    /** Follow the finger, with the page resisting at the ends of the sequence. */
    const follow = (distance: number, hasDestination: boolean) => {
      const limit = window.innerWidth * FOLLOW_LIMIT;
      const travel = distance * (hasDestination ? FOLLOW : EDGE_FOLLOW);
      return Math.sign(travel) * Math.min(Math.abs(travel), limit);
    };

    /** Spring the page back after a release that did not navigate. */
    const settle = () => {
      const element = main();
      root.removeAttribute("data-swiping");
      // The page springs back over the preview; fading it out reads as the same
      // movement and avoids animating the width of a fixed panel for 260ms.
      if (peekState.href) hidePeek(true);
      if (!element) return;
      if (shownOffset === 0) {
        element.style.willChange = "";
        return;
      }
      element.classList.add("swipe-settling");
      // Force a style flush so the transition sees the dragged position as its start.
      void element.offsetWidth;
      applyOffset(0, true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        element.classList.remove("swipe-settling");
        element.style.willChange = "";
      }, SETTLE_MS + 20);
    };

    const reset = () => {
      gesture.active = false;
      gesture.axis = "none";
      gesture.prefetchedLeft = false;
      gesture.prefetchedRight = false;
    };

    const release = () => {
      const element = main();
      if (element) element.style.willChange = "";
    };

    const startNavigation = (direction: SwipeDirection, offset: number) => {
      if (transitioning.current) {
        settle();
        return;
      }
      const from = pathnameRef.current;
      const href = swipeDestination({
        history: historyRef.current,
        pathname: from,
        direction,
        ownProfileHref: profileRef.current,
      });
      if (!href || href === from) {
        settle();
        return;
      }

      scrollPositions.current.set(from, window.scrollY);
      pendingRestore.current = href;
      transitioning.current = true;
      root.removeAttribute("data-swiping");
      hidePeek();

      const element = main();
      if (element) {
        element.classList.remove("swipe-settling");
        element.style.willChange = "";
      }
      // Hand the dragged position to the keyframes instead of leaving a transform
      // on the element: the old snapshot then starts exactly under the finger,
      // with no snap back and no doubled offset.
      applyOffset(0, true);
      root.style.setProperty("--swipe-shift", `${offset.toFixed(2)}px`);

      if (!reduceMotion.matches && typeof document.startViewTransition === "function") {
        root.dataset.swipeDirection = direction;
        root.dataset.swipeTransition = "view";
        const committed = new Promise<void>((resolve) => {
          pendingResolve.current = resolve;
        });
        const timeout = window.setTimeout(() => {
          if (pendingResolve.current) {
            const resolve = pendingResolve.current;
            pendingResolve.current = null;
            resolve();
          }
        }, TRANSITION_FALLBACK_MS);

        try {
          const transition = document.startViewTransition(async () => {
            router.push(href);
            await committed;
          });
          transition.finished.then(
            () => {
              window.clearTimeout(timeout);
              finishTransition();
            },
            () => {
              window.clearTimeout(timeout);
              finishTransition();
            },
          );
        } catch {
          // A transition can be refused (for example while another one owns the
          // document). Navigation is still the right outcome.
          window.clearTimeout(timeout);
          finishTransition();
          router.push(href);
        }
      } else {
        // No View Transition (or reduced motion): release the gesture lock when
        // the destination commits, with a timer only as a safety net. Nothing
        // reads the offset here, so drop it now.
        root.style.removeProperty("--swipe-shift");
        pendingFallback.current = true;
        router.push(href);
        window.setTimeout(() => {
          if (pendingFallback.current) {
            pendingFallback.current = false;
            transitioning.current = false;
          }
        }, TRANSITION_FALLBACK_MS);
      }

      function finishTransition() {
        transitioning.current = false;
        pendingResolve.current = null;
        delete root.dataset.swipeDirection;
        delete root.dataset.swipeTransition;
        root.style.removeProperty("--swipe-shift");
        release();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      if (isBlockedTarget(event.target)) return;
      const touch = event.touches[0]!;
      if (touch.clientX < EDGE_GUARD || touch.clientX > window.innerWidth - EDGE_GUARD) return;

      window.clearTimeout(settleTimer);
      const element = main();
      if (element) element.classList.remove("swipe-settling");

      gesture.active = true;
      gesture.axis = "none";
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.lastAt = performance.now();
      gesture.lastDx = 0;
      gesture.velocity = 0;
      gesture.offset = 0;
      gesture.prefetchedLeft = false;
      gesture.prefetchedRight = false;

      // The reveal is bounded by the visible content area: it starts under the
      // sticky header and stops at the viewport, so it never covers chrome that
      // is meant to stay put, and its label is centred where the reader can see
      // it even on a tall page.
      const surface = main();
      if (surface) {
        const rect = surface.getBoundingClientRect();
        const header = document.querySelector("header");
        const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        const top = Math.max(rect.top, headerBottom, 0);
        const bottom = Math.min(rect.bottom, window.innerHeight);
        surfaceTop = top;
        surfaceHeight = Math.max(0, bottom - top);
      }
      hidePeek();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture.active) return;
      if (event.touches.length !== 1) {
        reset();
        settle();
        return;
      }
      const touch = event.touches[0]!;
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axis === "none") {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          // A vertical scroll owns this gesture from now on.
          gesture.axis = "vertical";
          gesture.active = false;
          hidePeek();
          return;
        }
        gesture.axis = "horizontal";
        gesture.lastAt = performance.now();
        gesture.lastDx = dx;
        root.dataset.swiping = "true";
        const element = main();
        if (element) element.style.willChange = "transform";
      }

      if (gesture.axis !== "horizontal") return;

      // Only after horizontal intent is clear, so vertical scrolling and pinches
      // keep their native behaviour.
      if (event.cancelable) event.preventDefault();

      const now = performance.now();
      const frame = now - gesture.lastAt;
      if (frame > 0) {
        gesture.velocity = (dx - gesture.lastDx) / frame;
        gesture.lastDx = dx;
        gesture.lastAt = now;
      }

      const direction: SwipeDirection = dx < 0 ? "left" : "right";
      const href = swipeDestination({
        history: historyRef.current,
        pathname: pathnameRef.current,
        direction,
        ownProfileHref: profileRef.current,
      });
      if (href && (direction === "left" ? !gesture.prefetchedLeft : !gesture.prefetchedRight)) {
        router.prefetch(href);
        if (direction === "left") gesture.prefetchedLeft = true;
        else gesture.prefetchedRight = true;
      }

      // Reduced motion keeps the page still: the gesture only decides on release.
      if (reduceMotion.matches) return;
      const travel = follow(dx, Boolean(href));
      gesture.offset = travel;
      peekState = { direction, href, width: Math.abs(travel) };
      applyOffset(travel);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!gesture.active || gesture.axis !== "horizontal") {
        reset();
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - gesture.startX : 0;
      const dy = touch ? touch.clientY - gesture.startY : 0;
      const velocity = gesture.velocity;
      const committed = gesture.offset;
      reset();

      // A selection gesture belongs to the reader, not the navigation.
      if (window.getSelection()?.toString()) {
        settle();
        return;
      }
      if (
        !swipedFarEnough({
          dx,
          dy,
          velocity,
          commitDistance: swipeCommitDistance(window.innerWidth),
        })
      ) {
        settle();
        return;
      }
      startNavigation(dx < 0 ? "left" : "right", committed);
    };

    const onTouchCancel = () => {
      reset();
      settle();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    // A reliable readiness signal for tests and support: listeners are attached.
    root.dataset.swipeReady = "true";
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(peekTimer);
      if (paintFrame) window.cancelAnimationFrame(paintFrame);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      delete root.dataset.swipeReady;
      delete root.dataset.swiping;
      hidePeek();
    };
  }, [router]);

  // The preview layer: a sliver of the destination's own surface with its name,
  // revealed only in the gap the dragged page opens. It is not the destination's
  // content (that arrives with its server render), so it carries no text a
  // reader could mistake for the page, and it never takes a touch.
  return (
    <div
      ref={peekRef}
      aria-hidden="true"
      data-swipe-peek=""
      className="pointer-events-none fixed z-30 hidden items-center overflow-hidden border-navy-200/70 bg-navy-200/55 text-navy-600 backdrop-blur-[2px] transition-opacity duration-200"
    >
      <span
        ref={peekLabelRef}
        aria-hidden="true"
        className="whitespace-nowrap px-4 text-[11px] font-semibold uppercase tracking-[0.16em] transition-opacity duration-150"
      />
    </div>
  );
}
