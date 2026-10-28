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

/**
 * The destination for a deliberate horizontal swipe.
 *
 * Left means forward and right means back, matching the visual direction of the
 * pages. The ends of the sequence return null, so the caller can leave the page
 * untouched instead of bouncing or opening Create.
 */
export function swipeDestination(
  pathname: string,
  direction: SwipeDirection,
  ownProfileHref: string,
): string | null {
  const active = activeSwipeDestination(pathname);
  if (!active) return null;
  const index = SWIPE_ORDER.indexOf(active);
  const target = index + (direction === "left" ? 1 : -1);
  if (target < 0 || target >= SWIPE_ORDER.length) return null;
  const id = SWIPE_ORDER[target];
  return id === "profile" ? ownProfileHref : `/${id}`;
}
