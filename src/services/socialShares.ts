/**
 * Sharing published project updates to social networks.
 *
 * Rules this service enforces (not the UI):
 *  - only a project editor may share, and only a published project;
 *  - only a `public` update may leave the platform, because a team-only update is confidential;
 *  - every attempt is recorded, including failures, with the exact text that was published;
 *  - a deleted share is removed at the provider when it was actually published.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projectUpdates, socialShares, users } from "@/db/schema";
import { requireProjectAccess, type Viewer } from "@/lib/authz";
import {
  SocialNotConfiguredError,
  deleteSocialPost,
  isSocialPlatform,
  publishSocialPost,
  type SocialPlatform,
} from "@/lib/ayrshare";
import { env } from "@/lib/env";
import { AppError, NotFoundError } from "@/lib/errors";
import { audit } from "@/lib/notify";

const MAX_MESSAGE = 1000;
const MAX_PLATFORMS = 6;
const MAX_UPDATE_BODY = 300;

export type ShareInput = { platforms: string[]; message?: string };

export type ProjectShare = {
  id: string;
  platforms: string[];
  body: string;
  status: "pending" | "posted" | "failed" | "deleted";
  error: string | null;
  remoteId: string | null;
  createdAt: string;
  authorName: string | null;
  updateTitle: string | null;
};

function composeBody(projectName: string, projectId: string, update: { title: string; body: string }, override?: string): string {
  const link = `${env.appUrl}/projects/${projectId}`;
  // The owner may rewrite the copy; leaving it blank uses the update itself. The project link
  // is always appended so a share never lands without a way back to the source.
  const base =
    override?.trim() ||
    `${projectName}: ${update.title}\n\n${update.body.replace(/\s+/g, " ").trim().slice(0, MAX_UPDATE_BODY)}`;
  const text = base.includes(link) ? base : `${base}\n\n${link}`;
  return text.slice(0, MAX_MESSAGE);
}

/** Shares for one project, newest first. Editors only. */
export function listProjectShares(projectId: string, viewer: Viewer): ProjectShare[] {
  requireProjectAccess(projectId, viewer, "edit");
  return getDb()
    .select({
      id: socialShares.id,
      platforms: socialShares.platforms,
      body: socialShares.body,
      status: socialShares.status,
      error: socialShares.error,
      remoteId: socialShares.remoteId,
      createdAt: socialShares.createdAt,
      authorName: users.displayName,
      updateTitle: projectUpdates.title,
    })
    .from(socialShares)
    .leftJoin(users, eq(users.id, socialShares.authorId))
    .leftJoin(projectUpdates, eq(projectUpdates.id, socialShares.updateId))
    .where(eq(socialShares.projectId, projectId))
    .orderBy(desc(socialShares.createdAt))
    .limit(10)
    .all();
}

export async function shareProjectUpdate(
  projectId: string,
  updateId: string,
  viewer: Viewer,
  input: ShareInput,
): Promise<ProjectShare> {
  const access = requireProjectAccess(projectId, viewer, "edit");
  if (!viewer) throw new NotFoundError("Project not found.");

  // Check configuration before writing anything: an unconfigured deployment should not fill
  // the project's share history with rows that never had a chance of being published.
  if (!env.ayrshareApiKey) throw new SocialNotConfiguredError();

  if (access.project.status !== "published") {
    throw new AppError("Publish the project before sharing its updates publicly.");
  }

  const update = getDb()
    .select()
    .from(projectUpdates)
    .where(and(eq(projectUpdates.id, updateId), eq(projectUpdates.projectId, projectId)))
    .get();
  if (!update) throw new NotFoundError("Update not found.");
  if (update.visibility !== "public") {
    throw new AppError("Team-only updates cannot be shared to social networks.");
  }

  const platforms = [...new Set(input.platforms)].filter(isSocialPlatform) as SocialPlatform[];
  if (platforms.length === 0) throw new AppError("Choose at least one social network.");
  if (platforms.length > MAX_PLATFORMS) throw new AppError("Too many networks selected for one post.");

  const body = composeBody(access.project.name, projectId, update, input.message);
  const id = randomUUID();
  const now = new Date().toISOString();

  getDb()
    .insert(socialShares)
    .values({
      id,
      projectId,
      updateId,
      authorId: viewer.id,
      platforms,
      body,
      status: "pending",
      createdAt: now,
    })
    .run();

  try {
    const result = await publishSocialPost({ post: body, platforms });
    getDb()
      .update(socialShares)
      .set({ status: "posted", remoteId: result.id ?? null, updatedAt: new Date().toISOString() })
      .where(eq(socialShares.id, id))
      .run();

    audit({
      actorId: viewer.id,
      action: "social.share",
      targetType: "project",
      targetId: projectId,
      metadata: { shareId: id, platforms, remoteId: result.id ?? null },
    });
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    getDb()
      .update(socialShares)
      .set({ status: "failed", error: message, updatedAt: new Date().toISOString() })
      .where(eq(socialShares.id, id))
      .run();

    audit({
      actorId: viewer.id,
      action: "social.share_failed",
      targetType: "project",
      targetId: projectId,
      metadata: { shareId: id, platforms, reason: message },
    });
    throw error;
  }

  return {
    id,
    platforms,
    body,
    status: "posted",
    error: null,
    remoteId: null,
    createdAt: now,
    authorName: null,
    updateTitle: update.title,
  };
}

export async function deleteProjectShare(shareId: string, viewer: Viewer): Promise<void> {
  if (!viewer) throw new NotFoundError("Share not found.");
  const share = getDb().select().from(socialShares).where(eq(socialShares.id, shareId)).get();
  if (!share) throw new NotFoundError("Share not found.");

  // Deleting a post is an editorial action, so it uses the same edit permission as sharing.
  requireProjectAccess(share.projectId, viewer, "edit");

  if (share.remoteId) {
    try {
      await deleteSocialPost(share.remoteId);
    } catch (error) {
      // The provider may already have removed it; the local record still becomes `deleted` so
      // the project page reflects intent, and the failure is audited.
      audit({
        actorId: viewer.id,
        action: "social.delete_failed",
        targetType: "project",
        targetId: share.projectId,
        metadata: { shareId, remoteId: share.remoteId, reason: (error as Error).message.slice(0, 300) },
      });
      throw new AppError("The social network did not confirm the deletion. Try again from the provider dashboard.", {
        status: 502,
        code: "social_delete_failed",
      });
    }
  }

  getDb()
    .update(socialShares)
    .set({ status: "deleted", updatedAt: new Date().toISOString() })
    .where(eq(socialShares.id, shareId))
    .run();

  audit({
    actorId: viewer.id,
    action: "social.delete",
    targetType: "project",
    targetId: share.projectId,
    metadata: { shareId, remoteId: share.remoteId },
  });
}

