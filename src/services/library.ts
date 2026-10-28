import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { comments, courses, learningResources, posts, projects, reactions, users } from "@/db/schema";

/**
 * The personal library pages: what an account liked, and what it wrote.
 *
 * Both lists are built from the interaction records that already exist
 * (`reactions` and `comments`) rather than a second history table, and both
 * apply the same visibility rules the feed uses, in SQL, so pagination counts
 * stay honest when content is deleted, hidden or made private.
 */
export const LIBRARY_PAGE_SIZE = 20;

/** A post is listable only while its author, its own state and any linked teaching are public. */
function visiblePost() {
  return and(
    isNull(posts.hiddenAt),
    eq(posts.status, "published"),
    eq(posts.visibility, "public"),
    eq(users.status, "active"),
    or(
      isNull(posts.resourceId),
      and(eq(learningResources.status, "published"), or(isNull(courses.visibility), eq(courses.visibility, "public"))),
    )!,
  )!;
}

function visibleProject() {
  return and(eq(projects.status, "published"), ne(projects.visibility, "private"))!;
}

function basePostQuery() {
  return getDb()
    .select({
      post: posts,
      authorName: users.displayName,
      authorUsername: users.username,
      authorAvatar: users.avatarFileId,
      likedAt: reactions.createdAt,
    })
    .from(reactions)
    .innerJoin(posts, eq(posts.id, reactions.targetId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(learningResources, eq(learningResources.id, posts.resourceId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id));
}

export type LikedPost = {
  id: string;
  body: string;
  imageId: string | null;
  altText: string | null;
  kind: string;
  createdAt: string;
  likedAt: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
};

/** Posts this account has liked, newest like first. */
export function likedPostsForUser(userId: string, options: { limit?: number; offset?: number } = {}): LikedPost[] {
  return basePostQuery()
    .where(and(eq(reactions.userId, userId), eq(reactions.targetType, "post"), eq(reactions.kind, "like"), visiblePost()))
    .orderBy(desc(reactions.createdAt), desc(reactions.id))
    .limit(Math.min(options.limit ?? LIBRARY_PAGE_SIZE, 50))
    .offset(Math.max(options.offset ?? 0, 0))
    .all()
    .map((row) => ({
      id: row.post.id,
      body: row.post.body,
      imageId: row.post.imageId,
      altText: row.post.altText,
      kind: row.post.kind,
      createdAt: row.post.createdAt,
      likedAt: row.likedAt,
      authorName: row.authorName,
      authorUsername: row.authorUsername,
      authorAvatar: row.authorAvatar,
    }));
}

export function countLikedPosts(userId: string): number {
  return Number(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(reactions)
      .innerJoin(posts, eq(posts.id, reactions.targetId))
      .innerJoin(users, eq(users.id, posts.authorId))
      .leftJoin(learningResources, eq(learningResources.id, posts.resourceId))
      .leftJoin(courses, eq(courses.resourceId, learningResources.id))
      .where(and(eq(reactions.userId, userId), eq(reactions.targetType, "post"), eq(reactions.kind, "like"), visiblePost()))
      .get()?.count ?? 0,
  );
}

export type LikedProject = {
  id: string;
  name: string;
  shortDescription: string;
  coverImageId: string | null;
  category: string;
  stage: string;
  ownerName: string;
  ownerUsername: string;
  likedAt: string;
};

/** Projects this account has liked. Private and unpublished projects are excluded. */
export function likedProjectsForUser(userId: string, options: { limit?: number; offset?: number } = {}): LikedProject[] {
  return getDb()
    .select({
      project: projects,
      ownerName: users.displayName,
      ownerUsername: users.username,
      likedAt: reactions.createdAt,
    })
    .from(reactions)
    .innerJoin(projects, eq(projects.id, reactions.targetId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(and(eq(reactions.userId, userId), eq(reactions.targetType, "project"), eq(reactions.kind, "like"), visibleProject()))
    .orderBy(desc(reactions.createdAt), desc(reactions.id))
    .limit(Math.min(options.limit ?? LIBRARY_PAGE_SIZE, 50))
    .offset(Math.max(options.offset ?? 0, 0))
    .all()
    .map((row) => ({
      id: row.project.id,
      name: row.project.name,
      shortDescription: row.project.shortDescription,
      coverImageId: row.project.coverImageId,
      category: row.project.category,
      stage: row.project.stage,
      ownerName: row.ownerName,
      ownerUsername: row.ownerUsername,
      likedAt: row.likedAt,
    }));
}

export function countLikedProjects(userId: string): number {
  return Number(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(reactions)
      .innerJoin(projects, eq(projects.id, reactions.targetId))
      .where(and(eq(reactions.userId, userId), eq(reactions.targetType, "project"), eq(reactions.kind, "like"), visibleProject()))
      .get()?.count ?? 0,
  );
}

function baseCommentQuery() {
  return getDb()
    .select({
      comment: comments,
      postBody: posts.body,
      postId: posts.id,
      postAuthorId: posts.authorId,
      projectId: projects.id,
      projectName: projects.name,
      projectOwnerId: projects.ownerId,
      resourceId: learningResources.id,
      resourceTitle: learningResources.title,
      resourceCreatorId: learningResources.creatorId,
    })
    .from(comments)
    .leftJoin(posts, sql`${comments.targetType} = 'post' and ${posts.id} = ${comments.targetId}`)
    .leftJoin(projects, sql`${comments.targetType} = 'project' and ${projects.id} = ${comments.targetId}`)
    .leftJoin(learningResources, sql`${comments.targetType} = 'resource' and ${learningResources.id} = ${comments.targetId}`);
}

/**
 * Only comments on content the writer can still reach, and on somebody else's
 * content: a private project, a hidden post or a draft teaching drops out of the
 * list rather than leaving a link that 404s.
 */
function commentAccessible(userId: string) {
  return or(
    and(
      eq(comments.targetType, "post"),
      isNotNull(posts.id),
      isNull(posts.hiddenAt),
      eq(posts.status, "published"),
      eq(posts.visibility, "public"),
      ne(posts.authorId, userId),
    ),
    and(
      eq(comments.targetType, "project"),
      isNotNull(projects.id),
      eq(projects.status, "published"),
      ne(projects.visibility, "private"),
      ne(projects.ownerId, userId),
    ),
    and(
      eq(comments.targetType, "resource"),
      isNotNull(learningResources.id),
      eq(learningResources.status, "published"),
      ne(learningResources.creatorId, userId),
    ),
  )!;
}

export type UserComment = {
  id: string;
  body: string;
  isReply: boolean;
  createdAt: string;
  targetType: "post" | "project" | "resource";
  targetId: string;
  targetTitle: string;
  targetHref: string;
};

function targetOf(row: {
  postBody: string | null;
  projectName: string | null;
  resourceTitle: string | null;
  comment: { targetType: string; targetId: string };
}): { targetTitle: string; targetHref: string } | null {
  const { targetType, targetId } = row.comment;
  if (targetType === "post") {
    const body = (row.postBody ?? "").replace(/\s+/g, " ").trim();
    return { targetTitle: body.length > 110 ? `${body.slice(0, 110)}…` : body || "Post", targetHref: `/posts/${targetId}` };
  }
  if (targetType === "project") {
    return { targetTitle: row.projectName ?? "Project", targetHref: `/projects/${targetId}` };
  }
  if (targetType === "resource") {
    return { targetTitle: row.resourceTitle ?? "Teaching", targetHref: `/learn/${targetId}` };
  }
  return null;
}

/** Comments and replies this account wrote on other people's visible content. */
export function commentsByUser(userId: string, options: { limit?: number; offset?: number } = {}): UserComment[] {
  return baseCommentQuery()
    .where(and(eq(comments.authorId, userId), eq(comments.status, "visible"), commentAccessible(userId)))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(Math.min(options.limit ?? LIBRARY_PAGE_SIZE, 50))
    .offset(Math.max(options.offset ?? 0, 0))
    .all()
    .flatMap((row) => {
      const target = targetOf(row);
      if (!target) return [];
      return [
        {
          id: row.comment.id,
          body: row.comment.body,
          isReply: Boolean(row.comment.parentId),
          createdAt: row.comment.createdAt,
          targetType: row.comment.targetType as "post" | "project" | "resource",
          targetId: row.comment.targetId,
          targetTitle: target.targetTitle,
          targetHref: target.targetHref,
        },
      ];
    });
}

export function countCommentsByUser(userId: string): number {
  return Number(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .leftJoin(posts, sql`${comments.targetType} = 'post' and ${posts.id} = ${comments.targetId}`)
      .leftJoin(projects, sql`${comments.targetType} = 'project' and ${projects.id} = ${comments.targetId}`)
      .leftJoin(learningResources, sql`${comments.targetType} = 'resource' and ${learningResources.id} = ${comments.targetId}`)
      .where(and(eq(comments.authorId, userId), eq(comments.status, "visible"), commentAccessible(userId)))
      .get()?.count ?? 0,
  );
}
