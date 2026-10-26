import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { learningProgress } from "@/db/schema";
import { createSession, resolveSession } from "@/lib/session";
import { blockUser, completeOnboarding, followUser } from "@/services/users";
import { createResource } from "@/services/learning";
import { toggleProjectFollow } from "@/services/projects";
import {
  RECOMMENDATION_WEIGHTS,
  personalisedDiscovery,
  recommendedLearning,
  recommendedPeople,
  recommendedProjects,
} from "@/services/recommendations";
import { addMember, makeProject, makeUser, type TestUser } from "./helpers";

type ProfileOptions = {
  skills?: string[];
  interests?: string[];
  categories?: string[];
  goals?: ("build_projects" | "contribute" | "learn" | "teach" | "grow_audience" | "grow_business")[];
  location?: string;
};

/** Complete the real onboarding flow so recommendations read real rows. */
function onboard(user: TestUser, options: ProfileOptions = {}) {
  completeOnboarding(user.id, {
    displayName: `Recommend ${user.username}`,
    username: user.username,
    bio: options.interests?.length ? `Working on ${options.interests.join(", ")}.` : "Here to build and learn.",
    location: options.location,
    timezone: "Europe/London",
    skills: options.skills ?? [],
    interests: options.interests ?? [],
    goals: options.goals ?? ["learn"],
    categories: options.categories ?? [],
    portfolioUrls: [],
    roles: ["learner"],
  });

  const session = createSession(user.id);
  return resolveSession(session.token)!;
}

describe("project recommendations", () => {
  it("ranks skill, interest and category matches first and explains why", async () => {
    const owner = await makeUser();
    const viewer = await makeUser();
    const viewerSession = onboard(viewer, {
      skills: ["TypeScript", "Accessibility"],
      interests: ["climate"],
      categories: ["software"],
      goals: ["contribute"],
    });

    const matching = makeProject(owner.id, {
      name: "Accessible climate dashboard",
      shortDescription: "Build an accessible climate data dashboard for community groups.",
      category: "software",
      skills: ["TypeScript", "Accessibility"],
    });
    const unrelated = makeProject(owner.id, {
      name: "Rust audio hardware",
      shortDescription: "Design a small Rust-based audio interface for musicians.",
      category: "hardware",
      skills: ["Rust"],
    });

    const results = recommendedProjects(viewerSession, 10);
    const top = results.find((project) => project.id === matching.id)!;
    const lower = results.find((project) => project.id === unrelated.id)!;

    expect(top).toBeTruthy();
    expect(lower).toBeTruthy();
    expect(results[0].id).toBe(matching.id);
    expect(top.skills.map((skill) => skill.name)).toEqual(expect.arrayContaining(["TypeScript", "Accessibility"]));
    expect(top.reasons.map((reason) => reason.code)).toContain("skill");
    expect(top.reasons.some((reason) => /TypeScript|Accessibility/.test(reason.label))).toBe(true);
    expect(top.matchScore).toBeGreaterThan(lower.matchScore);
  });

  it("never recommends the viewer's own, private, draft, joined, followed or blocked work", async () => {
    const owner = await makeUser();
    const blockedOwner = await makeUser();
    const viewer = await makeUser();
    const viewerSession = onboard(viewer, { skills: ["TypeScript"], categories: ["software"], goals: ["contribute"] });

    const own = makeProject(viewer.id, { skills: ["TypeScript"], category: "software" });
    const priv = makeProject(owner.id, { skills: ["TypeScript"], category: "software", visibility: "private" });
    const draft = makeProject(owner.id, { skills: ["TypeScript"], category: "software", publish: false });
    const joined = makeProject(owner.id, { skills: ["TypeScript"], category: "software" });
    addMember(joined.id, viewer.id);
    const followed = makeProject(owner.id, { skills: ["TypeScript"], category: "software" });
    toggleProjectFollow(followed.id, viewer.id);
    const blocked = makeProject(blockedOwner.id, { skills: ["TypeScript"], category: "software" });
    blockUser(viewer.id, blockedOwner.id);

    const ids = recommendedProjects(viewerSession, 50).map((project) => project.id);
    expect(ids).not.toContain(own.id);
    expect(ids).not.toContain(priv.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(joined.id);
    expect(ids).not.toContain(followed.id);
    expect(ids).not.toContain(blocked.id);
  });
});

describe("people recommendations", () => {
  it("surfaces shared skills and excludes self, followed and blocked accounts", async () => {
    const viewer = await makeUser();
    const viewerSession = onboard(viewer, {
      skills: ["TypeScript"],
      interests: ["accessibility"],
      location: "London",
    });
    const matching = await makeUser();
    onboard(matching, { skills: ["TypeScript"], location: "London" });
    const different = await makeUser();
    onboard(different, { skills: ["Welding"] });

    const results = recommendedPeople(viewerSession, 20);
    expect(results.map((person) => person.id)).not.toContain(viewer.id);
    expect(results[0].id).toBe(matching.id);
    expect(results[0].reasons.some((reason) => /TypeScript/.test(reason.label))).toBe(true);
    expect(results[0].reasons.some((reason) => /London/.test(reason.label))).toBe(true);

    followUser(viewer.id, matching.id);
    expect(recommendedPeople(viewerSession, 20).map((person) => person.id)).not.toContain(matching.id);

    const blocked = await makeUser();
    onboard(blocked, { skills: ["TypeScript"] });
    blockUser(viewer.id, blocked.id);
    expect(recommendedPeople(viewerSession, 20).map((person) => person.id)).not.toContain(blocked.id);
  });
});

describe("learning recommendations", () => {
  it("matches interests, boosts current study topics and excludes own or started material", async () => {
    const creator = await makeUser();
    const viewer = await makeUser();
    const viewerSession = onboard(viewer, { interests: ["accessibility"], goals: ["learn"] });

    const accessible = createResource(creator.id, {
      title: "Accessible design foundations",
      summary: "Practical accessibility patterns for product teams.",
      topic: "accessibility",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });
    const gardening = createResource(creator.id, {
      title: "Balcony gardening basics",
      summary: "Growing food in small urban spaces.",
      topic: "gardening",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });
    const own = createResource(viewer.id, {
      title: "My accessibility notes",
      topic: "accessibility",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });
    const design = createResource(creator.id, {
      title: "Design systems in practice",
      topic: "design",
      level: "intermediate",
      format: "article",
      priceCents: 0,
      publish: true,
    });

    const first = recommendedLearning(viewerSession, 10);
    const accessibleResult = first.find((resource) => resource.id === accessible.id)!;
    const gardeningResult = first.find((resource) => resource.id === gardening.id);
    expect(accessibleResult).toBeTruthy();
    expect(accessibleResult.reasons.some((reason) => /accessibility/i.test(reason.label))).toBe(true);
    if (gardeningResult) expect(accessibleResult.matchScore).toBeGreaterThan(gardeningResult.matchScore);
    expect(first.map((resource) => resource.id)).not.toContain(own.id);

    // Starting a design resource adds its topic as a study signal for other design material.
    getDb()
      .insert(learningProgress)
      .values({ userId: viewer.id, resourceId: design.id, completed: false, progressPct: 30 })
      .run();

    const designFollowUp = createResource(creator.id, {
      title: "Advanced design tokens",
      topic: "design",
      level: "advanced",
      format: "article",
      priceCents: 0,
      publish: true,
    });
    const second = recommendedLearning(viewerSession, 10);
    expect(second.map((resource) => resource.id)).not.toContain(design.id);
    const boosted = second.find((resource) => resource.id === designFollowUp.id);
    expect(boosted).toBeTruthy();
    expect(boosted!.reasons.some((reason) => /Because you are learning design/.test(reason.label))).toBe(true);

    // Starting accessible material also removes it from discovery.
    getDb()
      .insert(learningProgress)
      .values({ userId: viewer.id, resourceId: accessible.id, completed: false, progressPct: 10 })
      .run();
    const third = recommendedLearning(viewerSession, 10);
    expect(third.map((resource) => resource.id)).not.toContain(accessible.id);

    // Completed material stays out of discovery too.
    getDb().update(learningProgress).set({ completed: true }).where(eq(learningProgress.userId, viewer.id)).run();
    expect(recommendedLearning(viewerSession, 10).map((resource) => resource.id)).not.toContain(accessible.id);
  });
});

describe("personalised discovery", () => {
  it("reports missing profile signals and still returns eligible general content", async () => {
    const owner = await makeUser();
    const viewer = await makeUser();
    const session = createSession(viewer.id);
    const viewerSession = resolveSession(session.token)!;

    makeProject(owner.id, { name: "General public project", skills: ["TypeScript"] });
    createResource(owner.id, {
      title: "A general public lesson",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });

    const discovery = personalisedDiscovery(viewerSession);
    expect(discovery.hasProfileSignals).toBe(false);
    expect(discovery.signals).toEqual({ interests: 0, skills: 0, categories: 0, goals: 0 });
    expect(Array.isArray(discovery.projects)).toBe(true);
    expect(Array.isArray(discovery.people)).toBe(true);
    expect(Array.isArray(discovery.learning)).toBe(true);
    expect(discovery.projects.length + discovery.learning.length).toBeGreaterThan(0);
  });

  it("exposes the documented weights so ranking stays explainable", () => {
    expect(RECOMMENDATION_WEIGHTS.skill).toBeGreaterThan(RECOMMENDATION_WEIGHTS.category);
    expect(RECOMMENDATION_WEIGHTS.category).toBeGreaterThan(RECOMMENDATION_WEIGHTS.recent);
    expect(RECOMMENDATION_WEIGHTS.sharedSkill).toBeGreaterThan(0);
  });
});
