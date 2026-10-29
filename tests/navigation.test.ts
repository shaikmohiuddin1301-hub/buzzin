import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV,
  BOTTOM_NAV_CREATE_INDEX,
  EMPTY_SWIPE_HISTORY,
  SWIPE_ORDER,
  activeSwipeDestination,
  adjacentSwipeDestination,
  pageSurfaceClass,
  profileHref,
  recordSwipeVisit,
  swipedFarEnough,
  swipeDestination,
  type SwipeHistory,
} from "@/lib/navigation";

describe("primary bottom navigation", () => {
  it("has exactly five destinations, in the required order", () => {
    expect(BOTTOM_NAV).toHaveLength(5);
    expect(BOTTOM_NAV.map((entry) => entry.label)).toEqual(["Home", "Explore", "Create", "Chats", "Profile"]);
  });

  it("centres the Create action: third of five equal columns", () => {
    // The bar renders these entries into a five-column grid, so the element at
    // index 2 sits at the horizontal centre whatever the label widths are.
    expect(BOTTOM_NAV_CREATE_INDEX).toBe(2);
    expect(BOTTOM_NAV.indexOf(BOTTOM_NAV[2]!)).toBe((BOTTOM_NAV.length - 1) / 2);
    expect(BOTTOM_NAV[BOTTOM_NAV_CREATE_INDEX]!.id).toBe("create");
  });

  it("no longer carries Learning or Projects, whose routes remain", () => {
    const ids = BOTTOM_NAV.map((entry) => entry.id as string);
    const hrefs = BOTTOM_NAV.map((entry) => ("href" in entry ? entry.href : null)).filter(Boolean);
    expect(ids).not.toContain("learning");
    expect(ids).not.toContain("learn");
    expect(ids).not.toContain("projects");
    expect(hrefs).not.toContain("/learn");
    expect(hrefs).not.toContain("/projects");
  });

  it("points Chats at the chats route and Profile at the signed-in account", () => {
    const chats = BOTTOM_NAV.find((entry) => entry.id === "chats");
    const profile = BOTTOM_NAV.find((entry) => entry.id === "profile");
    expect(chats && "href" in chats ? chats.href : null).toBe("/chats");
    expect(profileHref("riverwatch")).toBe("/u/riverwatch");
  });
});

describe("page surfaces", () => {
  it("uses the warm surface for social, profile and project work", () => {
    for (const path of ["/home", "/u/maya_okafor", "/projects", "/tasks/abc", "/business", "/notifications"]) {
      expect(pageSurfaceClass(path)).toBe("page-surface");
    }
  });

  it("uses the grey surface for discovery, learning, creation and a conversation", () => {
    for (const path of ["/explore", "/search", "/learn", "/learn/abc", "/studio", "/create/post", "/chats/abc"]) {
      expect(pageSurfaceClass(path)).toBe("page-surface-secondary");
    }
    // The chat list itself stays warm; only an open conversation turns grey.
    expect(pageSurfaceClass("/chats")).toBe("page-surface");
  });
});

describe("when a released swipe navigates", () => {
  it("commits a slow drag once it has travelled far enough", () => {
    expect(swipedFarEnough({ dx: -56, dy: 0, velocity: 0.1 })).toBe(true);
    expect(swipedFarEnough({ dx: 90, dy: 4, velocity: 0.05 })).toBe(true);
    expect(swipedFarEnough({ dx: -55, dy: 0, velocity: 0.1 })).toBe(false);
  });

  it("commits a short flick from the finger's own speed", () => {
    expect(swipedFarEnough({ dx: -20, dy: 0, velocity: -0.9 })).toBe(true);
    expect(swipedFarEnough({ dx: 18, dy: 0, velocity: 0.3 })).toBe(true);
    expect(swipedFarEnough({ dx: -18, dy: 0, velocity: -0.29 })).toBe(false);
    expect(swipedFarEnough({ dx: -17, dy: 0, velocity: -2 })).toBe(false);
  });

  it("ignores a diagonal drag that is really a scroll", () => {
    expect(swipedFarEnough({ dx: -80, dy: 70, velocity: -1 })).toBe(false);
  });

  it("ignores a flick that ends up moving the other way", () => {
    expect(swipedFarEnough({ dx: -30, dy: 0, velocity: 0.9 })).toBe(false);
  });
});

describe("horizontal swipe navigation", () => {
  const own = profileHref("maya_okafor");

  function visit(...pathnames: string[]): SwipeHistory {
    return pathnames.reduce(recordSwipeVisit, EMPTY_SWIPE_HISTORY);
  }

  function destination(history: SwipeHistory, pathname: string, direction: "left" | "right") {
    return swipeDestination({ history, pathname, direction, ownProfileHref: own });
  }

  it("falls back to the adjacent tab when nothing has been visited", () => {
    const history = visit("/explore");
    expect(destination(history, "/explore", "left")).toBe("/chats");
    expect(destination(history, "/explore", "right")).toBe("/home");
  });

  it("returns to the screen the reader actually came from", () => {
    // Home → Chats by tapping the bar: a right swipe is Home, not Explore, which
    // is what the fixed tab order would have said.
    const history = visit("/home", "/chats");
    expect(destination(history, "/chats", "right")).toBe("/home");
  });

  it("walks the visited screens in reverse on repeated right swipes", () => {
    const history = visit("/home", "/explore", "/chats");
    expect(destination(history, "/chats", "right")).toBe("/explore");
    expect(destination(visit("/home", "/chats"), "/chats", "right")).toBe("/home");
    expect(destination(visit("/home", "/explore", "/chats", "/u/maya_okafor"), "/u/maya_okafor", "right")).toBe(
      "/chats",
    );
  });

  it("replays a screen the reader swiped back out of on a left swipe", () => {
    const history = visit("/home", "/explore", "/chats");
    const back = recordSwipeVisit(history, "/explore");
    expect(back.index).toBe(1);
    expect(destination(back, "/explore", "left")).toBe("/chats");
  });

  it("continues the tab sequence once the forward history is used up", () => {
    const history = visit("/home", "/explore", "/chats", "/u/maya_okafor");
    expect(destination(history, "/u/maya_okafor", "left")).toBeNull();
    expect(destination(visit("/home", "/chats"), "/chats", "left")).toBe("/u/maya_okafor");
  });

  it("does not store the same screen twice", () => {
    const history = visit("/home", "/explore", "/explore", "/explore");
    expect(history.visits.map((entry) => entry.href)).toEqual(["/home", "/explore"]);
    expect(history.index).toBe(1);
    expect(destination(history, "/explore", "right")).toBe("/home");
  });

  it("truncates forward entries when a different screen is opened", () => {
    // Home → Explore → Chats, back to Explore, then tap Profile: the old Chats
    // entry is no longer ahead of the cursor, exactly as the browser behaves.
    const back = recordSwipeVisit(visit("/home", "/explore", "/chats"), "/explore");
    const history = recordSwipeVisit(back, "/u/maya_okafor");
    expect(history.visits.map((entry) => entry.href)).toEqual(["/home", "/explore", "/u/maya_okafor"]);
    expect(destination(history, "/u/maya_okafor", "right")).toBe("/explore");
    expect(destination(history, "/u/maya_okafor", "left")).toBeNull();
  });

  it("keeps pages outside the sequence out of the history", () => {
    const history = recordSwipeVisit(visit("/home"), "/settings");
    expect(history.visits.map((entry) => entry.href)).toEqual(["/home"]);
    expect(destination(history, "/settings", "right")).toBeNull();
  });

  it("ignores a history whose cursor is not on the current route", () => {
    const history = visit("/home", "/explore");
    // A tab change the effect has not folded in yet still navigates sensibly.
    expect(destination(history, "/chats", "right")).toBe("/explore");
  });

  it("never treats Create as a destination", () => {
    expect(SWIPE_ORDER).not.toContain("create");
    expect(destination(visit("/home", "/chats"), "/create", "left")).toBeNull();
    expect(destination(visit("/home", "/chats"), "/create", "right")).toBeNull();
    expect(adjacentSwipeDestination("/chats", "left", own)).toBe("/u/maya_okafor");
    expect(adjacentSwipeDestination("/home", "right", own)).toBeNull();
  });

  it("only claims the four page routes, not every protected page", () => {
    expect(activeSwipeDestination("/home")).toBe("home");
    expect(activeSwipeDestination("/explore")).toBe("explore");
    expect(activeSwipeDestination("/chats")).toBe("chats");
    expect(activeSwipeDestination("/u/someone_else")).toBe("profile");
    expect(activeSwipeDestination("/projects")).toBeNull();
    expect(activeSwipeDestination("/settings")).toBeNull();
    expect(destination(visit("/home"), "/projects", "left")).toBeNull();
  });

  it("drops the oldest visits once the limit is reached", () => {
    const routes = ["/home", "/explore", "/chats", "/u/maya_okafor"];
    let history = EMPTY_SWIPE_HISTORY;
    for (let step = 0; step < 24; step += 1) {
      history = recordSwipeVisit(history, routes[step % routes.length]!);
    }
    expect(history.visits.length).toBeLessThanOrEqual(20);
    expect(history.visits[history.index]?.href).toBe(routes[23 % routes.length]);
  });
});
