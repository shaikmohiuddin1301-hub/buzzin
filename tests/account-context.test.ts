import { describe, expect, it } from "vitest";
import { CREATE_PRIORITY, orderByAccountPriority } from "@/lib/account";
import { accountContext } from "@/services/account";
import { createBusiness } from "@/services/business";
import { createResource } from "@/services/learning";
import { completeOnboarding } from "@/services/users";
import { makeUser, uniqueLabel } from "./helpers";

function onboard(user: { id: string; username: string }, roles: ("learner" | "creator" | "educator" | "contributor" | "business")[]) {
  completeOnboarding(user.id, {
    displayName: `Account ${user.username}`,
    username: user.username,
    timezone: "Europe/London",
    skills: [],
    interests: [],
    goals: ["learn"],
    categories: [],
    portfolioUrls: [],
    roles,
  });
}

describe("account context", () => {
  it("treats a declared creator role as a creator account", async () => {
    const user = await makeUser();
    onboard(user, ["creator"]);
    const account = accountContext(user);
    expect(account.kind).toBe("creator");
    expect(account.isCreator).toBe(true);
    expect(account.isBusiness).toBe(false);
  });

  it("treats a business membership as a business account and keeps the real role", async () => {
    const user = await makeUser();
    onboard(user, ["business", "learner"]);
    const businessId = createBusiness(user.id, {
      name: `Org ${uniqueLabel("org")}`,
      description: "A real organisation created by the account test.",
      visibility: "public",
    });

    const account = accountContext(user);
    expect(account.kind).toBe("business");
    expect(account.isBusiness).toBe(true);
    expect(account.businesses.some((business) => business.id === businessId && business.role === "owner")).toBe(true);
  });

  it("counts published teaching even when no creator role was declared", async () => {
    const user = await makeUser();
    onboard(user, ["learner"]);
    createResource(user.id, {
      title: "Test teaching without a creator role",
      topic: "testing",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });

    const account = accountContext(user);
    expect(account.publishedTeaching).toBeGreaterThan(0);
    expect(account.isCreator).toBe(true);
    expect(account.kind).toBe("creator");
  });

  it("falls back to the individual experience with no creator role, teaching or organisations", async () => {
    const user = await makeUser({ roles: ["learner"] });
    const account = accountContext(user);
    expect(account.kind).toBe("individual");
    expect(account.isCreator).toBe(false);
    expect(account.isBusiness).toBe(false);
    expect(account.businesses).toEqual([]);
  });
});

describe("create ordering", () => {
  it("moves the account's most likely action first without removing anything", () => {
    const labels = ["New post", "Share an update", "New teaching", "New course", "Share a learning", "New project", "New task"];
    const items = labels.map((label) => ({ label }));

    const creator = orderByAccountPriority(items, "creator").map((item) => item.label);
    const business = orderByAccountPriority(items, "business").map((item) => item.label);
    const individual = orderByAccountPriority(items, "individual").map((item) => item.label);

    expect(creator[0]).toBe("New teaching");
    expect(business[0]).toBe("New project");
    expect(individual[0]).toBe("New post");
    for (const ordered of [creator, business, individual]) {
      expect(ordered.slice().sort()).toEqual(labels.slice().sort());
    }
    expect(CREATE_PRIORITY.creator).toContain("New course");
    expect(CREATE_PRIORITY.individual).toContain("New teaching");
  });
});
