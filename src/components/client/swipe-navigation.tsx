"use client";

/**
 * Horizontal swipe navigation between Home · Explore · Chats · Profile.
 *
 * This is navigation between the four real destinations, not a horizontally
 * scrolling strip: on a deliberate swipe the router changes route, so the URL,
 * server components, auth checks and browser history stay authoritative. Create
 * is not in the sequence and is ignored even when the gesture crosses it.
 *
 * Gesture rules:
 *   - touch only, one finger, starting away from the screen edges (the OS owns
 *     those back gestures);
 *   - at least 64px of horizontal travel, with a clear horizontal bias;
 *   - vertical movement hands the gesture back to the page immediately, so feed
 *     scrolling never changes page;
 *   - a gesture that starts on a control, a dialog/menu, a horizontally
 *     scrollable rail or an opt-out subtree never navigates.
 *
 * Motion uses the browser View Transitions API when available, so the outgoing
 * page and the incoming page animate together instead of flashing. The update
 * callback waits until React has committed the new route before the browser
 * takes the new snapshot. Without that API, or with reduced motion requested,
 * navigation happens immediately and the existing route transition runs.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { swipeDestination, type SwipeDirection } from "@/lib/navigation";

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

const MIN_DISTANCE = 64;
const HORIZONTAL_BIAS = 1.2;
const EDGE_GUARD = 24;
const AXIS_LOCK = 12;
const TRANSITION_FALLBACK_MS = 2_000;

type Gesture = {
  active: boolean;
  axis: "none" | "horizontal" | "vertical";
  startX: number;
  startY: number;
  prefetched: boolean;
};

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
  const scrollPositions = useRef(new Map<string, number>());
  const pendingRestore = useRef<string | null>(null);
  const pendingResolve = useRef<(() => void) | null>(null);
  const pendingFallback = useRef(false);
  const transitioning = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    profileRef.current = ownProfileHref;
  }, [ownProfileHref]);

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
      prefetched: false,
    };

    const reset = () => {
      gesture.active = false;
      gesture.axis = "none";
      gesture.prefetched = false;
    };

    const startNavigation = (direction: SwipeDirection) => {
      if (transitioning.current) return;
      const from = pathnameRef.current;
      const href = swipeDestination(from, direction, profileRef.current);
      if (!href || href === from) return;

      scrollPositions.current.set(from, window.scrollY);
      pendingRestore.current = href;
      transitioning.current = true;

      const root = document.documentElement;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion && typeof document.startViewTransition === "function") {
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
        // the destination commits, with a timer only as a safety net.
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

      gesture.active = true;
      gesture.axis = "none";
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      gesture.prefetched = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture.active) return;
      if (event.touches.length !== 1) {
        reset();
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
      }

      if (gesture.axis !== "horizontal") return;

      if (!gesture.prefetched) {
        const href = swipeDestination(pathnameRef.current, dx < 0 ? "left" : "right", profileRef.current);
        if (href) router.prefetch(href);
        gesture.prefetched = true;
      }

      // Only after horizontal intent is clear, so vertical scrolling and pinches
      // keep their native behaviour.
      if (event.cancelable) event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!gesture.active || gesture.axis !== "horizontal") {
        reset();
        return;
      }
      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - gesture.startX : 0;
      const dy = touch ? touch.clientY - gesture.startY : 0;
      reset();

      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) return;
      // A selection gesture belongs to the reader, not the navigation.
      if (window.getSelection()?.toString()) return;
      startNavigation(dx < 0 ? "left" : "right");
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    // A reliable readiness signal for tests and support: listeners are attached.
    document.documentElement.dataset.swipeReady = "true";
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
      delete document.documentElement.dataset.swipeReady;
    };
  }, [router]);

  return null;
}
