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
 *     gesture answers immediately instead of waiting for the release;
 *   - at least 56px of travel or a quick flick (18px at 0.3px/ms), with a clear
 *     horizontal bias;
 *   - vertical movement hands the gesture back to the page immediately, so feed
 *     scrolling never changes page;
 *   - a gesture that starts on a control, a dialog/menu, a horizontally
 *     scrollable rail or an opt-out subtree never navigates.
 *
 * Motion: dragging is a direct `transform`, written once per frame so the page
 * stays on the compositor. On release the drag offset is handed to the browser
 * View Transition API (`--swipe-shift`), so the outgoing page continues from
 * exactly where the finger left it while the incoming page arrives from the
 * opposite side. A cancelled drag springs back in 240ms. Without the API, or
 * with reduced motion requested, navigation happens immediately and the
 * existing route transition runs.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EMPTY_SWIPE_HISTORY,
  recordSwipeVisit,
  swipedFarEnough,
  swipeDestination,
  type SwipeDirection,
  type SwipeHistory,
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
const SETTLE_MS = 240;
const TRANSITION_FALLBACK_MS = 2_000;

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
    pathnameRef.current = pathname;
    historyRef.current = recordSwipeVisit(historyRef.current, pathname);
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

    const writeOffset = () => {
      const element = main();
      if (!element) return;
      element.style.transform =
        shownOffset === 0 ? "" : `translate3d(${shownOffset.toFixed(2)}px,0,0)`;
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
      if (!swipedFarEnough({ dx, dy, velocity })) {
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
      if (paintFrame) window.cancelAnimationFrame(paintFrame);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      delete root.dataset.swipeReady;
      delete root.dataset.swiping;
    };
  }, [router]);

  return null;
}
