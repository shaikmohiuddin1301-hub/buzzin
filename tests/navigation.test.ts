import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV,
  BOTTOM_NAV_CREATE_INDEX,
  SWIPE_ORDER,
  activeSwipeDestination,
  pageSurfaceClass,
  profileHref,
  swipeDestination,
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

describe("horizontal swipe navigation", () => {
  const own = profileHref("maya_okafor");

  it("steps forward on a left swipe, skipping Create", () => {
    expect(swipeDestination("/home", "left", own)).toBe("/explore");
    expect(swipeDestination("/explore", "left", own)).toBe("/chats");
    expect(swipeDestination("/chats", "left", own)).toBe("/u/maya_okafor");
    expect(swipeDestination("/u/maya_okafor", "left", own)).toBeNull();
  });

  it("steps back on a right swipe, returning to Explore from Chats", () => {
    expect(swipeDestination("/u/maya_okafor", "right", own)).toBe("/chats");
    expect(swipeDestination("/chats", "right", own)).toBe("/explore");
    expect(swipeDestination("/explore", "right", own)).toBe("/home");
    expect(swipeDestination("/home", "right", own)).toBeNull();
  });

  it("never treats Create as a destination", () => {
    expect(SWIPE_ORDER).not.toContain("create");
    expect(swipeDestination("/create", "left", own)).toBeNull();
    expect(swipeDestination("/create", "right", own)).toBeNull();
  });

  it("only claims the four page routes, not every protected page", () => {
    expect(activeSwipeDestination("/home")).toBe("home");
    expect(activeSwipeDestination("/explore")).toBe("explore");
    expect(activeSwipeDestination("/chats")).toBe("chats");
    expect(activeSwipeDestination("/u/someone_else")).toBe("profile");
    expect(activeSwipeDestination("/projects")).toBeNull();
    expect(activeSwipeDestination("/settings")).toBeNull();
    expect(swipeDestination("/projects", "left", own)).toBeNull();
  });
});
