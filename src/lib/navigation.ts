/**
 * The primary bottom navigation, in one place so the bar, the swipe gesture and
 * their tests agree.
 *
 * Exactly five destinations, in this order: Home · Explore · Create · Chats ·
 * Profile. Create occupies the third of five equal columns, which is what makes
 * it geometrically centred whatever the label widths are — the bar renders these
 * entries into a `grid-cols-5`, it does not hand-place them.
 *
 * Learning and Projects intentionally have no entry here. They stay reachable
 * from the sidebar, the Home workspace card, the Create sheet and the Profile
 * tabs, and their routes are untouched.
 */
export type BottomNavId = "home" | "explore" | "create" | "chats" | "profile";

export type BottomNavEntry =
  | { id: "create"; label: "Create"; href: null }
  | { id: "home" | "explore" | "chats"; label: string; href: string }
  | { id: "profile"; label: "Profile"; href: string };

export const BOTTOM_NAV: readonly BottomNavEntry[] = [
  { id: "home", label: "Home", href: "/home" },
  { id: "explore", label: "Explore", href: "/explore" },
  { id: "create", label: "Create", href: null },
  { id: "chats", label: "Chats", href: "/chats" },
  // The signed-in account's own profile; the href is completed at render time.
  { id: "profile", label: "Profile", href: "/u" },
] as const;

/** Index of the Create action inside the bar; the middle of five equal columns. */
export const BOTTOM_NAV_CREATE_INDEX = BOTTOM_NAV.findIndex((entry) => entry.id === "create");

export function profileHref(username: string): string {
  return `/u/${username}`;
}

/**
 * Page background by route. Warm off-white carries the social and work surfaces; the
 * light-grey surface marks discovery, learning and the creator workspace. Chat keeps a
 * warm list and a grey conversation, matching the messaging surfaces.
 */
export function pageSurfaceClass(pathname: string): "page-surface" | "page-surface-secondary" {
  const secondary =
    pathname === "/explore" ||
    pathname === "/search" ||
    pathname === "/learn" ||
    pathname.startsWith("/learn/") ||
    pathname === "/studio" ||
    pathname.startsWith("/studio/") ||
    pathname === "/create" ||
    pathname.startsWith("/create/") ||
    pathname.startsWith("/chats/");
  return secondary ? "page-surface-secondary" : "page-surface";
}

/**
 * Horizontal swipe order for the four real pages. Create is deliberately absent:
 * it is an action, not a destination, so a swipe never opens the Create sheet.
 */
export const SWIPE_ORDER = ["home", "explore", "chats", "profile"] as const;
export type SwipeDestinationId = (typeof SWIPE_ORDER)[number];
export type SwipeDirection = "left" | "right";

/** Which destination the current pathname belongs to, or null for every other page. */
export function activeSwipeDestination(pathname: string): SwipeDestinationId | null {
  if (pathname === "/home") return "home";
  if (pathname === "/explore") return "explore";
  if (pathname === "/chats") return "chats";
  // Any profile is the Profile destination; the bottom bar and this gesture agree.
  if (pathname === "/u" || pathname.startsWith("/u/")) return "profile";
  return null;
}

/** Gesture thresholds, in CSS pixels and CSS pixels per millisecond. */
export const SWIPE_MIN_DISTANCE = 56;
export const SWIPE_FLICK_DISTANCE = 18;
export const SWIPE_FLICK_VELOCITY = 0.3;
export const SWIPE_HORIZONTAL_BIAS = 1.2;

/**
 * How far a slow drag must travel before it counts, as a share of the viewport.
 *
 * A fixed pixel threshold is a different gesture on a phone and on a tablet: 56px
 * is a fifth of a small screen and a sixteenth of a large one. A quarter of the
 * width is the distance a reader who means it covers naturally, and it keeps a
 * small accidental nudge from changing page at any size. The pixel minimum still
 * applies, so a very narrow viewport does not become trigger-happy.
 */
export const SWIPE_COMMIT_RATIO = 0.22;

export function swipeCommitDistance(viewportWidth: number): number {
  return Math.max(SWIPE_MIN_DISTANCE, Math.round(viewportWidth * SWIPE_COMMIT_RATIO));
}

/**
 * Whether a released gesture should navigate.
 *
 * A slow drag has to travel `commitDistance` — by default `SWIPE_MIN_DISTANCE`,
 * and the component passes the viewport-relative distance instead. A quick flick
 * commits earlier: the finger's own speed is used, so waiting for more travel
 * would make a natural flick feel ignored. Both cases still require a clear
 * horizontal bias, and the flick has to be travelling the way the gesture was, so
 * a drag that starts fast and snaps back does not change page.
 */
export function swipedFarEnough(input: {
  dx: number;
  dy: number;
  velocity: number;
  commitDistance?: number;
}): boolean {
  const distance = Math.abs(input.dx);
  if (distance < Math.abs(input.dy) * SWIPE_HORIZONTAL_BIAS) return false;
  if (distance >= (input.commitDistance ?? SWIPE_MIN_DISTANCE)) return true;
  return (
    distance >= SWIPE_FLICK_DISTANCE &&
    Math.abs(input.velocity) >= SWIPE_FLICK_VELOCITY &&
    Math.sign(input.velocity) === Math.sign(input.dx)
  );
}

/** A screen in the swipe sequence the account has actually been on. */
export type SwipeVisit = { href: string; id: SwipeDestinationId };

/**
 * The screens visited in this session, in order, with a cursor.
 *
 * It mirrors the browser's own history for the four destinations but is kept by
 * the app, because the gesture has to know which screen came *before this one*
 * rather than which tab comes next in the bar. Entries carry their real href, so
 * returning to a profile returns to the profile that was open.
 */
export type SwipeHistory = { visits: readonly SwipeVisit[]; index: number };

export const EMPTY_SWIPE_HISTORY: SwipeHistory = { visits: [], index: -1 };

/** Older entries are dropped: a session's swipe memory does not need to grow. */
export const SWIPE_HISTORY_LIMIT = 20;

function destinationHref(id: SwipeDestinationId, ownProfileHref: string): string {
  return id === "profile" ? ownProfileHref : `/${id}`;
}

/**
 * The fallback: one tab left or right in the bar's own order.
 *
 * The ends of the sequence return null, so the caller leaves the page untouched
 * instead of bouncing or opening Create. Create is deliberately absent from
 * `SWIPE_ORDER`, which is what makes it unreachable by gesture.
 */
export function adjacentSwipeDestination(
  pathname: string,
  direction: SwipeDirection,
  ownProfileHref: string,
): string | null {
  const active = activeSwipeDestination(pathname);
  if (!active) return null;
  const index = SWIPE_ORDER.indexOf(active);
  const target = index + (direction === "left" ? 1 : -1);
  if (target < 0 || target >= SWIPE_ORDER.length) return null;
  return destinationHref(SWIPE_ORDER[target], ownProfileHref);
}

/**
 * Record a committed route as a swipe visit.
 *
 * Re-selecting the screen that is already open adds nothing, and moving to the
 * entry either side of the cursor moves the cursor instead of storing the route
 * twice — so a tab tapped repeatedly, a right swipe, and the browser's own back
 * and forward buttons all keep one history rather than piling up duplicates.
 * Any other destination truncates the forward entries, exactly as the browser
 * does when a new page is opened after going back.
 */
export function recordSwipeVisit(history: SwipeHistory, pathname: string): SwipeHistory {
  const id = activeSwipeDestination(pathname);
  if (!id) return history;

  const current = history.visits[history.index];
  if (current?.href === pathname) return history;

  if (history.visits[history.index - 1]?.href === pathname) {
    return { ...history, index: history.index - 1 };
  }
  if (history.visits[history.index + 1]?.href === pathname) {
    return { ...history, index: history.index + 1 };
  }

  const visits = [...history.visits.slice(0, history.index + 1), { href: pathname, id }].slice(
    -SWIPE_HISTORY_LIMIT,
  );
  return { visits, index: visits.length - 1 };
}

/**
 * The destination for a deliberate horizontal swipe.
 *
 * Right is back: it returns to the screen that was open before this one, which is
 * why it can be Home, Explore, Chats or Profile regardless of the tab order. Left
 * is forward: it replays a screen the reader swiped back out of when one exists.
 * Only when that history is exhausted does the gesture fall back to the adjacent
 * tab, so it is never stuck and never lands somewhere unrelated. A pathname
 * outside the sequence, and the ends of the tab order with no history, return
 * null; the caller then leaves the page where it is.
 */
export function swipeDestination(input: {
  history: SwipeHistory;
  pathname: string;
  direction: SwipeDirection;
  ownProfileHref: string;
}): string | null {
  const { history, pathname, direction, ownProfileHref } = input;
  if (!activeSwipeDestination(pathname)) return null;

  // A history can only answer for the screen it ends on. Anything else (a reload
  // mid-route, a browser jump the cursor did not follow) uses the tab fallback.
  if (history.visits[history.index]?.href === pathname) {
    const neighbour =
      direction === "right" ? history.visits[history.index - 1] : history.visits[history.index + 1];
    if (neighbour) return neighbour.href;
  }

  return adjacentSwipeDestination(pathname, direction, ownProfileHref);
}
