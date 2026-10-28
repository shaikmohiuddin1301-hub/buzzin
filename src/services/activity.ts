import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  blockedUsers,
  courses,
  follows,
  learningResources,
  posts,
  projectFollows,
  projectMilestones,
  projectUpdates,
  projects,
  tasks,
  users,
} from "@/db/schema";

/**
 * Activity from the people and projects an account follows.
 *
 * Every row is a real record: a post, a published teaching, a project update, a
 * completed milestone or an open task on a followed project. Nothing is
 * fabricated to fill the rail, private projects and private tasks are excluded,
 * and blocked accounts never appear.
 */
export type ActivityKind = "post" | "teaching" | "update" | "milestone" | "recruiting";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** Short marker shown on the card, e.g. "New teaching". */
  marker: string;
  title: string;
  actorName: string | null;
  actorUsername: string | null;
  actorAvatar: string | null;
  projectId: string | null;
  projectName: string | null;
  coverImageId: string | null;
  href: string;
  timestamp: string;
};

const MARKERS: Record<ActivityKind, string> = {
  post: "New post",
  teaching: "New teaching",
  update: "Project update",
  milestone: "Milestone hit",
  recruiting: "Looking for contributors",
};

export function followingActivity(userId: string, options: { limit?: number } = {}): ActivityItem[] {
  const db = getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 30));
  const blocked = db
    .select({ id: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(eq(blockedUsers.blockerId, userId))
    .all()
    .map((row) => row.id);
  const excluded = new Set([userId, ...blocked]);

  const followedPeople = db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId))
    .all()
    .map((row) => row.id)
    .filter((id) => !excluded.has(id));

  const followedProjectIds = db
    .select({ id: projectFollows.projectId })
    .from(projectFollows)
    .where(eq(projectFollows.userId, userId))
    .all()
    .map((row) => row.id);

  const items: ActivityItem[] = [];

  if (followedPeople.length > 0) {
    const recentPosts = db
      .select({
        id: posts.id,
        body: posts.body,
        createdAt: posts.createdAt,
        actorName: users.displayName,
        actorUsername: users.username,
        actorAvatar: users.avatarFileId,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .leftJoin(learningResources, eq(learningResources.id, posts.resourceId))
      .leftJoin(courses, eq(courses.resourceId, learningResources.id))
      .where(
        and(
          inArray(posts.authorId, followedPeople),
          isNull(posts.hiddenAt),
          eq(posts.status, "published"),
          eq(posts.visibility, "public"),
          eq(users.status, "active"),
          or(
            isNull(posts.resourceId),
            and(eq(learningResources.status, "published"), or(isNull(courses.visibility), eq(courses.visibility, "public"))),
          )!,
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(12)
      .all();

    for (const row of recentPosts) {
      const body = row.body.replace(/\s+/g, " ").trim();
      items.push({
        id: `post:${row.id}`,
        kind: "post",
        marker: MARKERS.post,
        title: body.length > 90 ? `${body.slice(0, 90)}…` : body,
        actorName: row.actorName,
        actorUsername: row.actorUsername,
        actorAvatar: row.actorAvatar,
        projectId: null,
        projectName: null,
        coverImageId: null,
        href: `/posts/${row.id}`,
        timestamp: row.createdAt,
      });
    }

    const recentTeaching = db
      .select({
        id: learningResources.id,
        title: learningResources.title,
        summary: learningResources.summary,
        publishedAt: learningResources.publishedAt,
        coverImageId: learningResources.coverImageId,
        actorName: users.displayName,
        actorUsername: users.username,
        actorAvatar: users.avatarFileId,
      })
      .from(learningResources)
      .innerJoin(users, eq(users.id, learningResources.creatorId))
      .leftJoin(courses, eq(courses.resourceId, learningResources.id))
      .where(
        and(
          inArray(learningResources.creatorId, followedPeople),
          eq(learningResources.status, "published"),
          isNotNull(learningResources.publishedAt),
          or(isNull(courses.visibility), eq(courses.visibility, "public"))!,
        ),
      )
      .orderBy(desc(learningResources.publishedAt))
      .limit(8)
      .all();

    for (const row of recentTeaching) {
      items.push({
        id: `teaching:${row.id}`,
        kind: "teaching",
        marker: MARKERS.teaching,
        title: row.title,
        actorName: row.actorName,
        actorUsername: row.actorUsername,
        actorAvatar: row.actorAvatar,
        projectId: null,
        projectName: null,
        coverImageId: row.coverImageId,
        href: `/learn/${row.id}`,
        timestamp: row.publishedAt ?? "",
      });
    }
  }

  if (followedProjectIds.length > 0) {
    const publicFollowed = db
      .select({ id: projects.id, name: projects.name, coverImageId: projects.coverImageId, ownerId: projects.ownerId })
      .from(projects)
      .where(and(inArray(projects.id, followedProjectIds), eq(projects.status, "published"), ne(projects.visibility, "private")))
      .all()
      .filter((project) => !excluded.has(project.ownerId));
    const publicIds = publicFollowed.map((project) => project.id);
    const projectById = new Map(publicFollowed.map((project) => [project.id, project]));
    const ownerIds = [...new Set(publicFollowed.map((project) => project.ownerId))];
    const owners = ownerIds.length
      ? new Map(
          db
            .select({ id: users.id, displayName: users.displayName, username: users.username, avatarFileId: users.avatarFileId })
            .from(users)
            .where(inArray(users.id, ownerIds))
            .all()
            .map((owner) => [owner.id, owner]),
        )
      : new Map<string, { id: string; displayName: string; username: string; avatarFileId: string | null }>();

    if (publicIds.length > 0) {
      const updates = db
        .select()
        .from(projectUpdates)
        .where(
          and(inArray(projectUpdates.projectId, publicIds), eq(projectUpdates.visibility, "public"), isNotNull(projectUpdates.createdAt)),
        )
        .orderBy(desc(projectUpdates.createdAt))
        .limit(8)
        .all();

      for (const row of updates) {
        const project = projectById.get(row.projectId);
        const owner = project ? owners.get(project.ownerId) : undefined;
        items.push({
          id: `update:${row.id}`,
          kind: "update",
          marker: MARKERS.update,
          title: row.title,
          actorName: owner?.displayName ?? null,
          actorUsername: owner?.username ?? null,
          actorAvatar: owner?.avatarFileId ?? null,
          projectId: row.projectId,
          projectName: project?.name ?? null,
          coverImageId: project?.coverImageId ?? null,
          href: `/projects/${row.projectId}?tab=progress`,
          timestamp: row.createdAt,
        });
      }

      const milestones = db
        .select()
        .from(projectMilestones)
        .where(
          and(
            inArray(projectMilestones.projectId, publicIds),
            eq(projectMilestones.status, "completed"),
            isNotNull(projectMilestones.completedAt),
          ),
        )
        .orderBy(desc(projectMilestones.completedAt))
        .limit(6)
        .all();

      for (const row of milestones) {
        const project = projectById.get(row.projectId);
        const owner = project ? owners.get(project.ownerId) : undefined;
        items.push({
          id: `milestone:${row.id}`,
          kind: "milestone",
          marker: MARKERS.milestone,
          title: row.title,
          actorName: owner?.displayName ?? null,
          actorUsername: owner?.username ?? null,
          actorAvatar: owner?.avatarFileId ?? null,
          projectId: row.projectId,
          projectName: project?.name ?? null,
          coverImageId: project?.coverImageId ?? null,
          href: `/projects/${row.projectId}?tab=progress`,
          timestamp: row.completedAt ?? "",
        });
      }

      const openTasks = db
        .select({
          id: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          publishedAt: tasks.publishedAt,
          createdAt: tasks.createdAt,
        })
        .from(tasks)
        .where(
          and(
            inArray(tasks.projectId, publicIds),
            eq(tasks.status, "open"),
            eq(tasks.visibility, "public"),
          ),
        )
        .orderBy(desc(tasks.publishedAt), desc(tasks.createdAt))
        .limit(6)
        .all();

      for (const row of openTasks) {
        const project = projectById.get(row.projectId);
        const owner = project ? owners.get(project.ownerId) : undefined;
        items.push({
          id: `recruiting:${row.id}`,
          kind: "recruiting",
          marker: MARKERS.recruiting,
          title: row.title,
          actorName: owner?.displayName ?? null,
          actorUsername: owner?.username ?? null,
          actorAvatar: owner?.avatarFileId ?? null,
          projectId: row.projectId,
          projectName: project?.name ?? null,
          coverImageId: project?.coverImageId ?? null,
          href: `/tasks/${row.id}`,
          timestamp: row.publishedAt ?? row.createdAt,
        });
      }
    }
  }

  return items
    .filter((item) => item.timestamp)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
    .slice(0, limit);
}
