import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  blockedUsers,
  follows,
  learningProgress,
  learningResources,
  projectFollows,
  projectMembers,
  projectSkills,
  savedItems,
  skills,
  userSkills,
  users,
} from "@/db/schema";
import { label } from "@/lib/types";
import type { SessionUser } from "@/lib/session";
import { getPreferences, getUserById, userSkillsFor } from "@/services/users";
import { listProjects } from "@/services/projects";
import { learningTopics, listResources } from "@/services/learning";

/**
 * Recommendation weights.
 *
 * These are deliberately small, explicit numbers rather than a model. Every
 * signal comes from a record the user can see and edit: interests, skills,
 * project categories, learning goals, follows, saves and learning progress.
 * Adjusting a weight is the whole tuning surface.
 */
export const RECOMMENDATION_WEIGHTS = {
  /** A project needs a skill the viewer listed. */
  skill: 4,
  /** Each additional matching skill, capped at two more. */
  additionalSkill: 2,
  /** A project sits in a category the viewer selected. */
  category: 3,
  /** Text or skill overlap with a stated interest. */
  interest: 1.5,
  /** The project owner is followed by the viewer. */
  followedPerson: 2.5,
  /** Open tasks make a project actionable now. */
  openTasks: 1.5,
  /** Published within the last two weeks. */
  recent: 1.5,
  /** A person shares a skill the viewer listed. */
  sharedSkill: 4,
  /** Same stated location. */
  sameLocation: 1.5,
  /** A resource covers a topic the viewer is currently studying. */
  learningTopic: 3,
  /** The viewer's goal includes learning. */
  learningGoal: 1,
} as const;

export type RecommendationReasonCode =
  | "skill"
  | "interest"
  | "category"
  | "follow"
  | "tasks"
  | "recent"
  | "location"
  | "learning";

export type RecommendationReason = {
  code: RecommendationReasonCode;
  label: string;
};

export type RecommendedProject = ReturnType<typeof listProjects>[number] & {
  skills: { id: string; name: string; slug: string }[];
  matchScore: number;
  reasons: RecommendationReason[];
};

export type RecommendedPerson = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarFileId: string | null;
  location: string | null;
  skills: { id: string; name: string; slug: string }[];
  matchScore: number;
  reasons: RecommendationReason[];
};

export type RecommendedResource = ReturnType<typeof listResources>[number] & {
  matchScore: number;
  reasons: RecommendationReason[];
};

export type PersonalisedDiscovery = {
  projects: RecommendedProject[];
  people: RecommendedPerson[];
  learning: RecommendedResource[];
  topics: { topic: string; count: number }[];
  hasProfileSignals: boolean;
  signals: { interests: number; skills: number; categories: number; goals: number };
};

type ViewerContext = {
  interests: string[];
  categories: Set<string>;
  goals: Set<string>;
  skillNames: Set<string>;
  skillSlugs: Set<string>;
  followedPeople: Set<string>;
  followedProjects: Set<string>;
  blockedPeople: Set<string>;
  memberProjects: Set<string>;
  savedProjects: Set<string>;
  savedResources: Set<string>;
  startedResources: Set<string>;
  learningTopics: Set<string>;
  location: string | null;
};

const normalise = (value: string) => value.trim().toLowerCase();

/** Ignore very short terms: "ai" or "go" would match almost every description. */
function textMatches(haystack: string, needle: string): boolean {
  const term = normalise(needle);
  return term.length >= 3 && haystack.includes(term);
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecent(iso: string | null | undefined, days = 14): boolean {
  if (!iso) return false;
  const published = new Date(iso).getTime();
  return Number.isFinite(published) && Date.now() - published <= days * 86_400_000;
}

function uniqueReasons(reasons: RecommendationReason[]): RecommendationReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    if (seen.has(reason.label)) return false;
    seen.add(reason.label);
    return true;
  });
}

function buildContext(viewer: SessionUser): ViewerContext {
  const db = getDb();
  const prefs = getPreferences(viewer.id);
  const mySkills = userSkillsFor(viewer.id);
  const me = getUserById(viewer.id);

  const blocked = db
    .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, viewer.id), eq(blockedUsers.blockedId, viewer.id)))
    .all();

  const progress = db
    .select({
      resourceId: learningProgress.resourceId,
      completed: learningProgress.completed,
      topic: learningResources.topic,
    })
    .from(learningProgress)
    .innerJoin(learningResources, eq(learningResources.id, learningProgress.resourceId))
    .where(eq(learningProgress.userId, viewer.id))
    .all();

  const saved = db
    .select({ targetType: savedItems.targetType, targetId: savedItems.targetId })
    .from(savedItems)
    .where(eq(savedItems.userId, viewer.id))
    .all();

  return {
    interests: (prefs?.interests ?? []).map((interest) => interest.trim()).filter(Boolean),
    categories: new Set(prefs?.categories ?? []),
    goals: new Set(me?.goals ?? []),
    skillNames: new Set(mySkills.map((skill) => normalise(skill.name))),
    skillSlugs: new Set(mySkills.map((skill) => skill.slug)),
    followedPeople: new Set(
      db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(eq(follows.followerId, viewer.id))
        .all()
        .map((row) => row.id),
    ),
    followedProjects: new Set(
      db
        .select({ id: projectFollows.projectId })
        .from(projectFollows)
        .where(eq(projectFollows.userId, viewer.id))
        .all()
        .map((row) => row.id),
    ),
    blockedPeople: new Set(
      blocked.flatMap((row) => [row.blockerId, row.blockedId]).filter((id) => id !== viewer.id),
    ),
    memberProjects: new Set(
      db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, viewer.id), eq(projectMembers.status, "active")))
        .all()
        .map((row) => row.id),
    ),
    savedProjects: new Set(saved.filter((row) => row.targetType === "project" || row.targetType === "task").map((row) => row.targetId)),
    savedResources: new Set(saved.filter((row) => row.targetType === "resource" || row.targetType === "journey").map((row) => row.targetId)),
    // Started content is not "discovery" any more; it belongs in Learning, not here.
    startedResources: new Set(progress.map((row) => row.resourceId)),
    learningTopics: new Set(progress.filter((row) => !row.completed && row.topic).map((row) => row.topic as string)),
    location: me?.location?.trim() ? normalise(me.location) : null,
  };
}

/**
 * Projects worth opening: matched by possessed skills and chosen categories,
 * followed owners and current open tasks. Private/draft projects are already
 * excluded by `listProjects`; blocked owners, the viewer's own projects, projects
 * already followed, joined or saved are excluded here.
 */
export function recommendedProjects(
  viewer: SessionUser,
  limit = 6,
  context?: ViewerContext,
): RecommendedProject[] {
  const ctx = context ?? buildContext(viewer);
  const db = getDb();
  const candidates = listProjects({ sort: "active", limit: 60 }, viewer);
  const ids = candidates.map((project) => project.id);

  const skillRows = ids.length
    ? db
        .select({
          projectId: projectSkills.projectId,
          id: skills.id,
          name: skills.name,
          slug: skills.slug,
        })
        .from(projectSkills)
        .innerJoin(skills, eq(skills.id, projectSkills.skillId))
        .where(inArray(projectSkills.projectId, ids))
        .all()
    : [];

  const projectSkillsById = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const row of skillRows) {
    const list = projectSkillsById.get(row.projectId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    projectSkillsById.set(row.projectId, list);
  }

  const scored = candidates
    .filter((project) => project.owner.id !== viewer.id)
    .filter((project) => !ctx.blockedPeople.has(project.owner.id))
    .filter((project) => !ctx.followedProjects.has(project.id))
    .filter((project) => !ctx.memberProjects.has(project.id))
    .filter((project) => !ctx.savedProjects.has(project.id))
    .map((project) => {
      const projectSkillsList = projectSkillsById.get(project.id) ?? [];
      const reasons: RecommendationReason[] = [];
      let score = 0;

      const matchingSkills = projectSkillsList.filter(
        (skill) => ctx.skillSlugs.has(skill.slug) || ctx.skillNames.has(normalise(skill.name)),
      );
      if (matchingSkills.length > 0) {
        score +=
          RECOMMENDATION_WEIGHTS.skill +
          Math.min(matchingSkills.length - 1, 2) * RECOMMENDATION_WEIGHTS.additionalSkill;
        reasons.push({
          code: "skill",
          label: `Needs ${matchingSkills
            .slice(0, 2)
            .map((skill) => skill.name)
            .join(" and ")}${matchingSkills.length > 2 ? " and more" : ""} — skills you listed`,
        });
      }

      if (ctx.categories.has(project.category)) {
        score += RECOMMENDATION_WEIGHTS.category;
        reasons.push({ code: "category", label: `In ${label(project.category)}, a category you follow` });
      }

      const haystack = `${project.name} ${project.shortDescription} ${project.overview ?? ""} ${projectSkillsList
        .map((skill) => skill.name)
        .join(" ")}`.toLowerCase();
      const interest = ctx.interests.find((value) => textMatches(haystack, value));
      if (interest) {
        score += RECOMMENDATION_WEIGHTS.interest;
        reasons.push({ code: "interest", label: `Matches your interest in ${interest}` });
      }

      if (ctx.followedPeople.has(project.owner.id)) {
        score += RECOMMENDATION_WEIGHTS.followedPerson;
        reasons.push({ code: "follow", label: `From ${project.owner.displayName}, someone you follow` });
      }

      if (project.openTaskCount > 0) {
        score += RECOMMENDATION_WEIGHTS.openTasks;
        reasons.push({
          code: "tasks",
          label: `${project.openTaskCount} open task${project.openTaskCount === 1 ? "" : "s"} right now`,
        });
      }

      if (isRecent(project.publishedAt)) {
        score += RECOMMENDATION_WEIGHTS.recent;
        reasons.push({ code: "recent", label: "Recently published" });
      }

      if (ctx.goals.has("contribute") || ctx.goals.has("build_projects")) score += 1;

      return {
        ...project,
        skills: projectSkillsList.slice(0, 3),
        matchScore: roundScore(score),
        reasons: uniqueReasons(reasons).slice(0, 2),
      };
    });

  return scored
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
        b.followerCount - a.followerCount,
    )
    .slice(0, limit);
}

/**
 * People to follow: shared skills first, then shared location and stated
 * interests. Already-followed and blocked accounts are excluded, so the list
 * cannot become a repeat of the viewer's own network.
 */
export function recommendedPeople(
  viewer: SessionUser,
  limit = 4,
  context?: ViewerContext,
): RecommendedPerson[] {
  const ctx = context ?? buildContext(viewer);
  const db = getDb();

  const candidates = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      avatarFileId: users.avatarFileId,
      location: users.location,
    })
    .from(users)
    .where(and(eq(users.status, "active"), ne(users.id, viewer.id)))
    .orderBy(desc(users.lastSeenAt))
    .limit(120)
    .all();

  const ids = candidates.map((person) => person.id);
  const skillRows = ids.length
    ? db
        .select({
          userId: userSkills.userId,
          id: skills.id,
          name: skills.name,
          slug: skills.slug,
        })
        .from(userSkills)
        .innerJoin(skills, eq(skills.id, userSkills.skillId))
        .where(inArray(userSkills.userId, ids))
        .all()
    : [];

  const skillsByUser = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const row of skillRows) {
    const list = skillsByUser.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    skillsByUser.set(row.userId, list);
  }

  const scored = candidates
    .filter((person) => !ctx.blockedPeople.has(person.id))
    .filter((person) => !ctx.followedPeople.has(person.id))
    .map((person) => {
      const personSkills = skillsByUser.get(person.id) ?? [];
      const reasons: RecommendationReason[] = [];
      let score = 0;

      const shared = personSkills.filter(
        (skill) => ctx.skillSlugs.has(skill.slug) || ctx.skillNames.has(normalise(skill.name)),
      );
      if (shared.length > 0) {
        score += RECOMMENDATION_WEIGHTS.sharedSkill + Math.min(shared.length - 1, 2);
        reasons.push({
          code: "skill",
          label: `Shares your ${shared
            .slice(0, 2)
            .map((skill) => skill.name)
            .join(" and ")} skill${shared.length > 1 ? "s" : ""}`,
        });
      }

      const bio = (person.bio ?? "").toLowerCase();
      const interest = ctx.interests.find((value) => textMatches(bio, value));
      if (interest) {
        score += RECOMMENDATION_WEIGHTS.interest;
        reasons.push({ code: "interest", label: `Talks about ${interest}` });
      }

      if (ctx.location && person.location && normalise(person.location) === ctx.location) {
        score += RECOMMENDATION_WEIGHTS.sameLocation;
        reasons.push({ code: "location", label: `Also based in ${person.location}` });
      }

      return {
        ...person,
        skills: personSkills,
        matchScore: roundScore(score),
        reasons: uniqueReasons(reasons).slice(0, 2),
      };
    });

  return scored
    .filter((person) => person.matchScore > 0 || person.skills.length > 0)
    .sort((a, b) => b.matchScore - a.matchScore || a.displayName.localeCompare(b.displayName))
    .slice(0, limit);
}

/**
 * Learning that fits the viewer's interests, current study topics and the
 * creators they follow. Completed resources and the viewer's own material are
 * excluded. `listResources` already enforces published + public visibility.
 */
export function recommendedLearning(
  viewer: SessionUser,
  limit = 4,
  context?: ViewerContext,
): RecommendedResource[] {
  const ctx = context ?? buildContext(viewer);
  const candidates = listResources({ limit: 60 });

  const scored = candidates
    .filter((resource) => resource.creatorId !== viewer.id)
    .filter((resource) => !ctx.startedResources.has(resource.id))
    .filter((resource) => !ctx.savedResources.has(resource.id))
    .filter((resource) => {
      const creator = getUserById(resource.creatorId);
      return !creator || !ctx.blockedPeople.has(creator.id);
    })
    .map((resource) => {
      const haystack = `${resource.title} ${resource.summary ?? ""} ${resource.topic ?? ""} ${resource.creatorName}`.toLowerCase();
      const reasons: RecommendationReason[] = [];
      let score = 0;

      const interest = ctx.interests.find((value) => textMatches(haystack, value));
      if (interest) {
        score += RECOMMENDATION_WEIGHTS.interest;
        reasons.push({ code: "interest", label: `Matches your interest in ${interest}` });
      }

      const toolSkill = [...ctx.skillNames].find((value) => textMatches(haystack, value));
      if (toolSkill) {
        score += RECOMMENDATION_WEIGHTS.interest;
        if (reasons.length < 2) {
          reasons.push({ code: "skill", label: `Related to your ${toolSkill} skill` });
        }
      }

      if (resource.topic && ctx.learningTopics.has(resource.topic)) {
        score += RECOMMENDATION_WEIGHTS.learningTopic;
        reasons.unshift({ code: "learning", label: `Because you are learning ${resource.topic}` });
      }

      const creator = getUserById(resource.creatorId);
      if (creator && ctx.followedPeople.has(creator.id)) {
        score += RECOMMENDATION_WEIGHTS.followedPerson;
        reasons.push({ code: "follow", label: `From ${creator.displayName}, a creator you follow` });
      }

      if (ctx.goals.has("learn")) score += RECOMMENDATION_WEIGHTS.learningGoal;

      if (isRecent(resource.publishedAt)) score += RECOMMENDATION_WEIGHTS.recent;

      return {
        ...resource,
        matchScore: roundScore(score),
        reasons: uniqueReasons(reasons).slice(0, 2),
      };
    });

  return scored
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    )
    .slice(0, limit);
}

/** Everything the Explore "For you" view needs, in one call. */
export function personalisedDiscovery(viewer: SessionUser): PersonalisedDiscovery {
  const ctx = buildContext(viewer);
  const signals = {
    interests: ctx.interests.length,
    skills: ctx.skillNames.size,
    categories: ctx.categories.size,
    goals: ctx.goals.size,
  };

  return {
    projects: recommendedProjects(viewer, 6, ctx),
    people: recommendedPeople(viewer, 4, ctx),
    learning: recommendedLearning(viewer, 4, ctx),
    topics: learningTopics().slice(0, 10),
    hasProfileSignals: Object.values(signals).some((count) => count > 0),
    signals,
  };
}
