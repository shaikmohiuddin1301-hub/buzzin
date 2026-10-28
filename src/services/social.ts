import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  blockedUsers,
  businesses,
  challenges,
  comments,
  courses,
  follows,
  learningResources,
  posts,
  projectFollows,
  projectMembers,
  projects,
  reactions,
  savedItems,
  skills,
  taskAssignments,
  userPreferences,
  users,
} from "@/db/schema";
import { getProjectAccess, getTaskAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { getMedia } from "@/lib/storage";
import type { FeedFilter, FeedKind, Visibility } from "@/lib/types";

export type FeedItem = {
  id: string;
  title: string | null;
  topic: string | null;
  linkUrl: string | null;
  body: string;
  kind: FeedKind;
  createdAt: string;
  author: { id: string; username: string; displayName: string; avatarFileId: string | null };
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  imageId: string | null;
  altText: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  followingAuthor: boolean;
  score: number;
};

function blockedIds(userId: string): string[] {
  const db = getDb();
  return db
    .select({ blockedId: blockedUsers.blockedId, blockerId: blockedUsers.blockerId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)))
    .all()
    .map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
}

/**
 * Personalised feed.
 *
 * Ranking blends freshness, explicit follows, stated interests and content type.
 * Deliberately not engagement-only, and never pay-for-placement.
 */
export function feed(
  viewer: Viewer,
  filter: FeedFilter = "for_you",
  options: { limit?: number; offset?: number } = {},
): FeedItem[] {
  const db = getDb();
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  // Drafts are never public, whatever their visibility says. A post that points
  // at a teaching or course also disappears when that resource is unpublished or
  // made private; the post record is kept so republishing restores the link.
  const conditions = [
    isNull(posts.hiddenAt),
    eq(posts.visibility, "public"),
    eq(posts.status, "published"),
    eq(users.status, "active"),
    or(
      isNull(posts.resourceId),
      and(
        eq(learningResources.status, "published"),
        or(isNull(courses.visibility), eq(courses.visibility, "public")),
      ),
    )!,
  ];
  if (filter === "projects") {
    conditions.push(inArray(posts.kind, ["project_update", "milestone", "launch", "challenge"]));
  }
  if (filter === "learning") {
    conditions.push(inArray(posts.kind, ["lesson", "story"]));
  }
  if (filter === "updates") {
    conditions.push(inArray(posts.kind, ["project_update", "milestone", "launch"]));
  }

  const blocked = viewer ? blockedIds(viewer.id) : [];

  let rows = db
    .select({
      post: posts,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId },
      projectName: projects.name,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(projects, eq(projects.id, posts.projectId))
    .leftJoin(learningResources, eq(learningResources.id, posts.resourceId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(filter === "for_you" ? 240 : 60)
    .all();

  if (blocked.length) rows = rows.filter((row) => !blocked.includes(row.post.authorId));

  const followingIds = viewer
    ? db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, viewer.id)).all().map((r) => r.id)
    : [];
  const followedProjectIds = viewer
    ? db.select({ id: projectFollows.projectId }).from(projectFollows).where(eq(projectFollows.userId, viewer.id)).all().map((r) => r.id)
    : [];

  if (filter === "following") {
    rows = rows.filter(
      (row) => followingIds.includes(row.post.authorId) || (row.post.projectId && followedProjectIds.includes(row.post.projectId)),
    );
  }

  const postIds = rows.map((row) => row.post.id);
  const likeRows = postIds.length
    ? db
        .select({ targetId: reactions.targetId, count: sql<number>`count(*)` })
        .from(reactions)
        .where(and(eq(reactions.targetType, "post"), inArray(reactions.targetId, postIds)))
        .groupBy(reactions.targetId)
        .all()
    : [];
  const commentRows = postIds.length
    ? db
        .select({ targetId: comments.targetId, count: sql<number>`count(*)` })
        .from(comments)
        .where(and(eq(comments.targetType, "post"), inArray(comments.targetId, postIds), eq(comments.status, "visible")))
        .groupBy(comments.targetId)
        .all()
    : [];
  const myLikes = viewer && postIds.length
    ? db
        .select({ targetId: reactions.targetId })
        .from(reactions)
        .where(and(eq(reactions.userId, viewer.id), eq(reactions.targetType, "post"), inArray(reactions.targetId, postIds)))
        .all()
        .map((row) => row.targetId)
    : [];
  const mySaves = viewer && postIds.length
    ? db
        .select({ targetId: savedItems.targetId })
        .from(savedItems)
        .where(and(eq(savedItems.userId, viewer.id), eq(savedItems.targetType, "post"), inArray(savedItems.targetId, postIds)))
        .all()
        .map((row) => row.targetId)
    : [];

  const likes = new Map(likeRows.map((row) => [row.targetId, Number(row.count)]));
  const commentCounts = new Map(commentRows.map((row) => [row.targetId, Number(row.count)]));

  // Content preferences are a gentle nudge, never a filter: chosen categories and
  // interests give related posts a small boost so the feed reflects what somebody
  // said they care about, without hiding everything else.
  const preferences = viewer
    ? db
        .select({ categories: userPreferences.categories, interests: userPreferences.interests })
        .from(userPreferences)
        .where(eq(userPreferences.userId, viewer.id))
        .get()
    : undefined;
  const preferredCategories = new Set(preferences?.categories ?? []);
  const preferredInterests = (preferences?.interests ?? []).map((interest) => interest.toLowerCase()).filter(Boolean);
  const projectCategories = new Map<string, string>();
  if (preferredCategories.size > 0) {
    const projectIds = [...new Set(rows.map((row) => row.post.projectId).filter((id): id is string => !!id))];
    if (projectIds.length > 0) {
      for (const row of db
        .select({ id: projects.id, category: projects.category })
        .from(projects)
        .where(inArray(projects.id, projectIds))
        .all()) {
        projectCategories.set(row.id, row.category);
      }
    }
  }

  const kindWeight: Record<string, number> = {
    project_update: 3,
    milestone: 3,
    story: 2,
    lesson: 2,
    launch: 3,
    question: 1,
    challenge: 2,
    general: 1,
  };

  const scored: FeedItem[] = rows.map((row) => {
    const ageHours = (Date.now() - new Date(row.post.createdAt).getTime()) / 3_600_000;
    let score = (kindWeight[row.post.kind] ?? 1) - ageHours / 48;
    if (followingIds.includes(row.post.authorId)) score += 4;
    if (row.post.projectId && followedProjectIds.includes(row.post.projectId)) score += 3;
    if (row.post.kind === "question") score += 1;
    if (row.post.projectId && preferredCategories.has(projectCategories.get(row.post.projectId) ?? "")) score += 1.5;
    if (preferredInterests.length > 0) {
      const haystack = `${row.post.body} ${row.projectName ?? ""}`.toLowerCase();
      if (preferredInterests.some((interest) => haystack.includes(interest))) score += 1;
    }
    return {
      id: row.post.id,
      title: row.post.title,
      topic: row.post.topic,
      linkUrl: row.post.linkUrl,
      body: row.post.body,
      kind: row.post.kind,
      createdAt: row.post.createdAt,
      author: row.author,
      projectId: row.post.projectId,
      projectName: row.projectName,
      taskId: row.post.taskId,
      imageId: row.post.imageId,
      altText: row.post.altText,
      likeCount: likes.get(row.post.id) ?? 0,
      commentCount: commentCounts.get(row.post.id) ?? 0,
      liked: myLikes.includes(row.post.id),
      saved: mySaves.includes(row.post.id),
      followingAuthor: followingIds.includes(row.post.authorId),
      score,
    };
  });

  if (filter === "for_you") scored.sort((a, b) => b.score - a.score);
  return scored.slice(offset, offset + limit);
}

export function postsByAuthor(authorId: string, viewerId: string | null, limit = 10) {
  const isSelf = viewerId === authorId;
  return getDb()
    .select({
      post: posts,
      resourceStatus: learningResources.status,
      courseVisibility: courses.visibility,
    })
    .from(posts)
    .leftJoin(learningResources, eq(learningResources.id, posts.resourceId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(and(eq(posts.authorId, authorId), isNull(posts.hiddenAt)))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .all()
    .filter((row) => {
      if (isSelf) return true;
      if (row.post.visibility !== "public" || row.post.status !== "published") return false;
      if (row.post.resourceId && row.resourceStatus !== "published") return false;
      if (row.post.resourceId && row.courseVisibility && row.courseVisibility !== "public") return false;
      return true;
    })
    .map((row) => row.post);
}

export type CreatePostInput = {
  body: string;
  /** Optional heading for a learning entry or an update. */
  title?: string | null;
  /** Optional topic for a learning entry. */
  topic?: string | null;
  /** Optional supporting link (http/https only). */
  linkUrl?: string | null;
  kind?: FeedKind;
  projectId?: string | null;
  taskId?: string | null;
  resourceId?: string | null;
  imageId?: string | null;
  altText?: string | null;
  visibility?: Visibility;
  publish?: boolean;
};

export function createPost(authorId: string, input: CreatePostInput): string {
  if (input.body.trim().length < 2) throw new AppError("Write something first.");
  if (input.body.length > 5000) throw new AppError("Posts are limited to 5,000 characters.");
  if (input.title && input.title.trim().length > 140) throw new AppError("Keep the heading under 140 characters.");
  if (input.topic && input.topic.trim().length > 80) throw new AppError("Keep the topic under 80 characters.");
  if (input.linkUrl && !/^https?:\/\/\S+$/i.test(input.linkUrl.trim())) {
    throw new AppError("The supporting link needs a full address starting with http:// or https://.");
  }
  if (input.imageId) {
    const image = getMedia(input.imageId);
    if (!image || image.ownerId !== authorId) throw new AppError("That image is not yours to attach.");
    if (!image.mimeType.startsWith("image/")) throw new AppError("Posts can attach an image file.");
  }
  if (input.resourceId) {
    const resource = getDb()
      .select({ id: learningResources.id, status: learningResources.status })
      .from(learningResources)
      .where(eq(learningResources.id, input.resourceId))
      .get();
    if (!resource || resource.status !== "published") throw new AppError("That learning resource is not available.");
  }

  const db = getDb();
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: authorId });
    if (!access?.canView) throw new ForbiddenError("You cannot post about that project.");
    const isMember = access.isMember;
    if (input.kind === "project_update" && !access.canEdit) {
      throw new ForbiddenError("Only project owners can publish project updates from the feed.");
    }
    if (!isMember && !access.project.visibility.startsWith("pub")) {
      throw new ForbiddenError("Join the project before posting about it.");
    }
  }

  const id = randomUUID();
  db.insert(posts)
    .values({
      id,
      authorId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      resourceId: input.resourceId ?? null,
      kind: input.kind ?? "general",
      title: input.title?.trim().slice(0, 140) || null,
      topic: input.topic?.trim().slice(0, 80) || null,
      linkUrl: input.linkUrl?.trim() || null,
      body: input.body.trim(),
      imageId: input.imageId ?? null,
      altText: input.altText?.trim().slice(0, 400) || null,
      visibility: input.visibility ?? "public",
      status: input.publish === false ? "draft" : "published",
    })
    .run();
  return id;
}

/** One post with the engagement state the detail page needs. */

export function postDetail(postId: string, viewer: Viewer) {
  const db = getDb();
  const row = db
    .select({
      post: posts,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId },
      projectName: projects.name,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(projects, eq(projects.id, posts.projectId))
    .where(eq(posts.id, postId))
    .get();
  if (!row || row.post.hiddenAt) return null;

  const isAuthor = viewer?.id === row.post.authorId;
  if (!isAuthor && (row.post.visibility !== "public" || row.post.status !== "published")) return null;
  if (!isAuthor && viewer?.id && blockedIds(viewer.id).includes(row.post.authorId)) return null;
  if (!isAuthor && row.post.resourceId) {
    const linked = db
      .select({ status: learningResources.status, visibility: courses.visibility })
      .from(learningResources)
      .leftJoin(courses, eq(courses.resourceId, learningResources.id))
      .where(eq(learningResources.id, row.post.resourceId))
      .get();
    if (!linked || linked.status !== "published" || (linked.visibility && linked.visibility !== "public")) return null;
  }

  const likeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(reactions)
    .where(and(eq(reactions.targetType, "post"), eq(reactions.targetId, postId)))
    .get();
  const commentCount = db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(eq(comments.targetType, "post"), eq(comments.targetId, postId), eq(comments.status, "visible")))
    .get();
  const mine = (table: typeof reactions | typeof savedItems) =>
    viewer
      ? db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.userId, viewer.id), eq(table.targetType, "post"), eq(table.targetId, postId)))
          .get()
      : undefined;

  return {
    ...row,
    isAuthor,
    likeCount: Number(likeCount?.count ?? 0),
    commentCount: Number(commentCount?.count ?? 0),
    liked: !!mine(reactions),
    saved: !!mine(savedItems),
  };
}

export function deletePost(postId: string, viewer: Viewer): void {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) throw new NotFoundError("Post not found.");
  if (post.authorId !== viewer?.id && !viewer?.isModerator) throw new ForbiddenError();
  db.delete(posts).where(eq(posts.id, postId)).run();
}

export function hidePost(postId: string, userId: string): void {
  // Hiding is per-user; the post itself is untouched.
  getDb().insert(savedItems).values({ userId, targetType: "post", targetId: postId }).onConflictDoNothing().run();
}

export type CommentTarget = "post" | "project" | "resource" | "task" | "story";

function assertTargetReadable(targetType: CommentTarget, targetId: string, viewer: Viewer): void {
  if (targetType === "project") {
    if (!getProjectAccess(targetId, viewer)?.canView) throw new NotFoundError("Project not found.");
  }
  if (targetType === "task") {
    if (!getTaskAccess(targetId, viewer)?.canView) throw new NotFoundError("Task not found.");
  }
  if (targetType === "resource") {
    const resource = getDb().select().from(learningResources).where(eq(learningResources.id, targetId)).get();
    if (!resource) throw new NotFoundError("Learning resource not found.");
    if (resource.status !== "published") throw new NotFoundError("Learning resource not found.");
  }
  if (targetType === "post") {
    const post = getDb().select().from(posts).where(eq(posts.id, targetId)).get();
    if (!post || post.hiddenAt) throw new NotFoundError("Post not found.");
  }
}

export function addComment(
  authorId: string,
  input: { targetType: CommentTarget; targetId: string; body: string; parentId?: string | null },
): string {
  if (!input.body.trim()) throw new AppError("Write a comment first.");
  if (input.body.length > 3000) throw new AppError("Comments are limited to 3,000 characters.");
  assertTargetReadable(input.targetType, input.targetId, { id: authorId });

  const db = getDb();
  if (input.parentId) {
    const parent = db.select().from(comments).where(eq(comments.id, input.parentId)).get();
    if (!parent || parent.targetType !== input.targetType || parent.targetId !== input.targetId) {
      throw new AppError("That reply target is no longer available.");
    }
  }

  const id = randomUUID();
  db.insert(comments).values({ id, authorId, ...input, parentId: input.parentId ?? null, body: input.body.trim() }).run();

  // Notify the people the comment is actually for, and link to the comment's own
  // page rather than the feed. One row per recipient: a reply to the owner of the
  // post must not arrive twice. The comment body is never copied into a
  // notification preview.
  const recipients = new Map<string, string>();
  let href: string | null = null;
  if (input.targetType === "post") {
    const post = db.select().from(posts).where(eq(posts.id, input.targetId)).get();
    if (post) {
      href = `/posts/${post.id}`;
      recipients.set(post.authorId, "New comment on your post");
    }
  }
  if (input.targetType === "project") {
    const project = db.select().from(projects).where(eq(projects.id, input.targetId)).get();
    if (project) {
      href = `/projects/${project.id}?tab=discussion`;
      recipients.set(project.ownerId, `New comment on ${project.name}`);
    }
  }
  if (input.targetType === "task") {
    const access = getTaskAccess(input.targetId, { id: authorId });
    if (access) {
      href = `/tasks/${access.task.id}`;
      recipients.set(access.projectAccess.project.ownerId, `New comment on ${access.task.title}`);
      const assignees = db
        .select({ userId: taskAssignments.userId })
        .from(taskAssignments)
        .where(and(eq(taskAssignments.taskId, input.targetId), eq(taskAssignments.status, "active")))
        .all();
      for (const row of assignees) {
        if (!recipients.has(row.userId)) recipients.set(row.userId, `New comment on ${access.task.title}`);
      }
    }
  }
  if (input.targetType === "resource") {
    const resource = db.select().from(learningResources).where(eq(learningResources.id, input.targetId)).get();
    if (resource) {
      href = `/learn/${resource.id}`;
      recipients.set(resource.creatorId, `New comment on ${resource.title}`);
    }
  }
  if (input.parentId) {
    const parent = db.select().from(comments).where(eq(comments.id, input.parentId)).get();
    if (parent) recipients.set(parent.authorId, "Someone replied to your comment");
  }

  for (const [userId, title] of recipients) {
    notify({
      userId,
      actorId: authorId,
      kind: "comment",
      title,
      href,
      dedupeKey: `comment:${id}:${userId}`,
      entityType: "comment",
      entityId: id,
    });
  }
  return id;
}

export function listComments(targetType: CommentTarget, targetId: string, viewer: Viewer) {
  assertTargetReadable(targetType, targetId, viewer);
  const db = getDb();
  const rows = db
    .select({
      comment: comments,
      authorName: users.displayName,
      authorUsername: users.username,
      authorAvatar: users.avatarFileId,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId), eq(comments.status, "visible")))
    .orderBy(desc(comments.createdAt))
    .all();

  const roots = rows.filter((row) => !row.comment.parentId);
  const replies = rows.filter((row) => row.comment.parentId);
  return roots.map((root) => ({
    ...root,
    replies: replies.filter((reply) => reply.comment.parentId === root.comment.id).reverse(),
  }));
}

export function toggleReaction(
  userId: string,
  targetType: "post" | "comment" | "resource" | "project",
  targetId: string,
  kind: "like" | "celebrate" | "insight" = "like",
): boolean {
  const db = getDb();
  const existing = db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.targetType, targetType),
        eq(reactions.targetId, targetId),
        eq(reactions.kind, kind),
      ),
    )
    .get();
  if (existing) {
    db.delete(reactions).where(eq(reactions.id, existing.id)).run();
    return false;
  }
  db.insert(reactions).values({ userId, targetType, targetId, kind }).run();
  return true;
}

export function reactionState(userId: string, targetType: string, targetId: string) {
  const db = getDb();
  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(reactions)
    .where(and(eq(reactions.targetType, targetType as never), eq(reactions.targetId, targetId)))
    .get();
  const mine = db
    .select({ id: reactions.id })
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.targetType, targetType as never),
        eq(reactions.targetId, targetId),
      ),
    )
    .get();
  return { count: Number(count?.count ?? 0), mine: !!mine };
}

export function toggleSaved(userId: string, targetType: "post" | "project" | "resource" | "journey" | "task", targetId: string): boolean {
  const db = getDb();
  const existing = db
    .select()
    .from(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.targetType, targetType), eq(savedItems.targetId, targetId)))
    .get();
  if (existing) {
    db.delete(savedItems).where(eq(savedItems.id, existing.id)).run();
    return false;
  }
  db.insert(savedItems).values({ userId, targetType, targetId }).run();
  return true;
}

export function savedFor(userId: string) {
  const db = getDb();
  const saved = db.select().from(savedItems).where(eq(savedItems.userId, userId)).orderBy(desc(savedItems.createdAt)).all();
  const postIds = saved.filter((s) => s.targetType === "post").map((s) => s.targetId);
  const projectIds = saved.filter((s) => s.targetType === "project").map((s) => s.targetId);
  const resourceIds = saved.filter((s) => s.targetType === "resource").map((s) => s.targetId);

  return {
    posts: postIds.length ? db.select().from(posts).where(inArray(posts.id, postIds)).all() : [],
    projects: projectIds.length ? db.select().from(projects).where(inArray(projects.id, projectIds)).all() : [],
    resources: resourceIds.length ? db.select().from(learningResources).where(inArray(learningResources.id, resourceIds)).all() : [],
  };
}

/* ---------------------------------- search -------------------------------- */

export type SearchResults = {
  projects: { id: string; name: string; shortDescription: string; category: string; stage: string }[];
  people: { id: string; username: string; displayName: string; bio: string | null; avatarFileId: string | null }[];
  skills: { id: string; name: string; slug: string }[];
  resources: { id: string; title: string; summary: string | null; format: string; priceCents: number; slug: string }[];
  businesses: { id: string; name: string; slug: string; industry: string | null; description: string | null }[];
};

export function searchAll(query: string, limit = 6): SearchResults {
  const db = getDb();
  const term = `%${query.trim()}%`;
  if (!query.trim()) return { projects: [], people: [], skills: [], resources: [], businesses: [] };

  return {
    projects: db
      .select({ id: projects.id, name: projects.name, shortDescription: projects.shortDescription, category: projects.category, stage: projects.stage })
      .from(projects)
      .where(and(eq(projects.status, "published"), ne(projects.visibility, "private"), or(like(projects.name, term), like(projects.shortDescription, term))))
      .limit(limit)
      .all(),
    people: db
      .select({ id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, avatarFileId: users.avatarFileId })
      .from(users)
      .where(and(eq(users.status, "active"), or(like(users.displayName, term), like(users.username, term))))
      .limit(limit)
      .all(),
    skills: db.select({ id: skills.id, name: skills.name, slug: skills.slug }).from(skills).where(like(skills.name, term)).limit(limit).all(),
    resources: db
      .select({
        id: learningResources.id,
        title: learningResources.title,
        summary: learningResources.summary,
        format: learningResources.format,
        priceCents: learningResources.priceCents,
        slug: learningResources.slug,
      })
      .from(learningResources)
      .where(and(eq(learningResources.status, "published"), or(like(learningResources.title, term), like(learningResources.topic, term))))
      .limit(limit)
      .all(),
    businesses: db
      .select({ id: businesses.id, name: businesses.name, slug: businesses.slug, industry: businesses.industry, description: businesses.description })
      .from(businesses)
      .where(and(eq(businesses.visibility, "public"), or(like(businesses.name, term), like(businesses.industry, term))))
      .limit(limit)
      .all(),
  };
}

export function listChallenges() {
  return getDb().select().from(challenges).orderBy(desc(challenges.createdAt)).limit(12).all();
}

export function listBusinesses(query?: string) {
  const db = getDb();
  const conditions = [eq(businesses.visibility, "public")];
  if (query?.trim()) conditions.push(like(businesses.name, `%${query}%`));
  return db.select().from(businesses).where(and(...conditions)).limit(24).all();
}

export function projectDiscussion(projectId: string, viewer: Viewer) {
  return listComments("project", projectId, viewer);
}

export function teamMemberIds(projectId: string): string[] {
  return getDb()
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.status, "active")))
    .all()
    .map((row) => row.userId);
}
