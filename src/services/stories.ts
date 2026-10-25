import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  consentRecords,
  deliverables,
  generatedMedia,
  learningResources,
  mediaApprovals,
  projectMilestones,
  projectUpdates,
  projects,
  storyScenes,
  storyboards,
  tasks,
  users,
  workLogEntries,
} from "@/db/schema";
import { getProjectAccess, requireProjectAccess, type Viewer } from "@/lib/authz";
import { getStoryProvider, type SceneDraft, type StorySource } from "@/lib/ai";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { audit, notify } from "@/lib/notify";
import { awardReputation, REPUTATION_WEIGHTS } from "@/lib/reputation";
import { saveGeneratedMedia } from "@/lib/storage";

/**
 * Story pipeline.
 *
 * Only material the requesting user is authorised to use is collected, and a
 * contributor's work is only eligible if they have a live public-story consent
 * record. Generation never invents events: the local provider narrates only what
 * the source rows contain and flags gaps.
 */

/** Users who have granted (and not revoked) project-story consent. */
export function consentedUsers(projectId: string): string[] {
  const db = getDb();
  return db
    .select({ userId: consentRecords.userId })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.scope, "public_story"),
        eq(consentRecords.projectId, projectId),
        eq(consentRecords.granted, true),
        isNull(consentRecords.revokedAt),
      ),
    )
    .all()
    .map((row) => row.userId);
}

export function collectSources(projectId: string, viewer: Viewer): StorySource[] {
  const db = getDb();
  const access = requireProjectAccess(projectId, viewer, "view");
  const taskRows = db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .all();
  const taskIds = taskRows.map((row) => row.id);
  const sources: StorySource[] = [];

  if (taskIds.length) {
    const entries = db
      .select({
        entry: workLogEntries,
        authorName: users.displayName,
        taskTitle: tasks.title,
      })
      .from(workLogEntries)
      .innerJoin(tasks, eq(tasks.id, workLogEntries.taskId))
      .innerJoin(users, eq(users.id, workLogEntries.authorId))
      .where(and(inArray(workLogEntries.taskId, taskIds), inArray(workLogEntries.visibility, ["public", "team"])))
      .orderBy(asc(workLogEntries.createdAt))
      .all();

    for (const row of entries) {
      // Team-only notes are never eligible for AI generation, even for the owner.
      if (row.entry.visibility !== "public") continue;
      if (access.project.allowPublicDocs === false) continue;
      sources.push({
        kind: "work_log",
        id: row.entry.id,
        title: row.entry.title,
        body: row.entry.body ?? "",
        at: row.entry.createdAt,
        contributors: [{ userId: row.entry.authorId, name: row.authorName }],
        approved: true,
      });
    }

    const approvedDeliverables = db
      .select({ deliverable: deliverables, taskTitle: tasks.title, createdAt: deliverables.createdAt })
      .from(deliverables)
      .innerJoin(tasks, eq(tasks.id, deliverables.taskId))
      .where(and(inArray(deliverables.taskId, taskIds), eq(deliverables.approved, true)))
      .all();
    for (const row of approvedDeliverables) {
      sources.push({
        kind: "deliverable",
        id: row.deliverable.id,
        title: row.deliverable.title,
        body: row.deliverable.description ?? `Deliverable for ${row.taskTitle}`,
        at: row.createdAt,
        contributors: [],
        approved: true,
      });
    }
  }

  const milestones = db
    .select()
    .from(projectMilestones)
    .where(and(eq(projectMilestones.projectId, projectId), eq(projectMilestones.status, "completed")))
    .all();
  for (const milestone of milestones) {
    sources.push({
      kind: "milestone",
      id: milestone.id,
      title: `Milestone: ${milestone.title}`,
      body: milestone.description ?? `Completed milestone: ${milestone.title}`,
      at: milestone.completedAt ?? milestone.createdAt,
      contributors: [],
      approved: true,
    });
  }

  const updates = db
    .select()
    .from(projectUpdates)
    .where(and(eq(projectUpdates.projectId, projectId), eq(projectUpdates.visibility, "public")))
    .all();
  for (const update of updates) {
    sources.push({
      kind: "update",
      id: update.id,
      title: update.title,
      body: update.body,
      at: update.createdAt,
      contributors: [{ userId: update.authorId, name: "Project team" }],
      approved: true,
    });
  }

  return sources.sort((a, b) => a.at.localeCompare(b.at));
}

export async function generateStoryboard(projectId: string, viewer: Viewer): Promise<{ id: string; warnings: string[] }> {
  const access = requireProjectAccess(projectId, viewer, "story");
  const db = getDb();
  rateLimit(`story:${viewer!.id}`, env.rateLimits.ai, 3_600_000);

  const project = access.project;
  const sources = collectSources(projectId, viewer);
  const consented = consentedUsers(projectId);

  const provider = getStoryProvider();
  const draft = await provider.generateStoryboard({
    projectTitle: project.name,
    projectSummary: project.shortDescription,
    sources,
    consentedUserIds: consented,
    includeOpening: true,
  });

  return db.transaction((tx) => {
    const id = randomUUID();
    tx.insert(storyboards)
      .values({
        id,
        projectId,
        createdBy: viewer!.id,
        title: draft.title,
        summary: draft.summary,
        status: "draft",
        provider: provider.id,
        visibility: project.visibility === "private" ? "private" : "public",
      })
      .run();

    draft.scenes.forEach((scene: SceneDraft, index) => {
      tx.insert(storyScenes)
        .values({
          storyboardId: id,
          orderIndex: index,
          title: scene.title,
          narration: scene.narration,
          visualDescription: scene.visualDescription,
          motion: scene.motion,
          durationSeconds: scene.durationSeconds,
          sourceType: scene.sourceType,
          sourceId: scene.sourceId,
          contributors: scene.contributors,
          factStatus: scene.factStatus,
          aiGenerated: scene.aiGenerated,
        })
        .run();
    });

    tx.insert(generatedMedia)
      .values({ storyboardId: id, kind: "narration", provider: provider.id, status: "ready" })
      .run();

    audit({
      actorId: viewer!.id,
      action: "story.generated",
      targetType: "storyboard",
      targetId: id,
      metadata: { sources: draft.usedSourceIds.length, provider: provider.id },
    });

    return { id, warnings: draft.warnings };
  });
}

/** Render the animated explainer for a storyboard and store it as media. */
export async function renderStoryboard(storyboardId: string, viewer: Viewer): Promise<void> {
  const db = getDb();
  const board = db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  if (board.projectId) {
    const access = requireProjectAccess(board.projectId, viewer, "story");
    if (!access.canManageStory && board.createdBy !== viewer!.id) throw new ForbiddenError();
  } else if (board.createdBy !== viewer!.id) {
    throw new ForbiddenError();
  }

  const scenes = db
    .select()
    .from(storyScenes)
    .where(eq(storyScenes.storyboardId, storyboardId))
    .orderBy(asc(storyScenes.orderIndex))
    .all();

  const provider = getStoryProvider();
  const mediaId = randomUUID();
  db.insert(generatedMedia)
    .values({ id: mediaId, storyboardId, kind: "animation", provider: provider.id, status: "processing" })
    .run();

  try {
    const svg = await provider.renderExplainer(
      { title: board.title, summary: board.summary ?? "" },
      scenes.map((scene) => ({
        title: scene.title,
        narration: scene.narration,
        visualDescription: scene.visualDescription ?? "",
        motion: scene.motion,
        durationSeconds: scene.durationSeconds,
        sourceType: scene.sourceType,
        sourceId: scene.sourceId,
        contributors: scene.contributors ?? [],
        factStatus: scene.factStatus,
        aiGenerated: scene.aiGenerated,
      })),
    );
    const file = await saveGeneratedMedia({
      buffer: svg,
      filename: `${board.id}-v${board.version}.svg`,
      mimeType: "image/svg+xml",
      ownerId: board.createdBy,
      projectId: board.projectId,
      visibility: board.status === "published" ? "public" : "private",
    });
    db.update(generatedMedia).set({ status: "ready", fileId: file.id }).where(eq(generatedMedia.id, mediaId)).run();
  } catch (error) {
    db.update(generatedMedia)
      .set({ status: "failed", error: (error as Error).message.slice(0, 500) })
      .where(eq(generatedMedia.id, mediaId))
      .run();
    throw error;
  }
}

export function storyboardDetail(storyboardId: string, viewer: Viewer) {
  const db = getDb();
  const board = db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).get();
  if (!board) return null;

  const access = board.projectId ? getProjectAccess(board.projectId, viewer) : null;
  const isCreator = board.createdBy === viewer?.id;
  const canReview = !!access?.canReview || isCreator;
  const published = board.status === "published" && board.visibility === "public";
  if (!published && !canReview) return null;

  const scenes = db
    .select()
    .from(storyScenes)
    .where(eq(storyScenes.storyboardId, storyboardId))
    .orderBy(asc(storyScenes.orderIndex))
    .all();
  const media = db.select().from(generatedMedia).where(eq(generatedMedia.storyboardId, storyboardId)).all();
  const approvals = db
    .select({ approval: mediaApprovals, approverName: users.displayName })
    .from(mediaApprovals)
    .innerJoin(users, eq(users.id, mediaApprovals.approverId))
    .where(eq(mediaApprovals.storyboardId, storyboardId))
    .orderBy(desc(mediaApprovals.createdAt))
    .all();
  const project = board.projectId ? db.select().from(projects).where(eq(projects.id, board.projectId)).get() : null;

  return {
    board,
    scenes,
    media,
    approvals,
    project: project ?? null,
    canReview,
    canPublish: canReview && board.status === "approved",
    animation: media.find((item) => item.kind === "animation" && item.status === "ready") ?? null,
    // Facts and generated narration are visually separated in the UI.
    unsupported: scenes.filter((scene) => scene.factStatus !== "documented"),
  };
}

export function storyboardsForProject(projectId: string, viewer: Viewer) {
  const access = getProjectAccess(projectId, viewer);
  const db = getDb();
  const rows = db.select().from(storyboards).where(eq(storyboards.projectId, projectId)).orderBy(desc(storyboards.updatedAt)).all();
  return rows.filter((row) => row.status === "published" || access?.isMember);
}

export function updateScene(
  sceneId: string,
  viewer: Viewer,
  input: { title?: string; narration?: string; durationSeconds?: number },
): void {
  const db = getDb();
  const scene = db.select().from(storyScenes).where(eq(storyScenes.id, sceneId)).get();
  if (!scene) throw new NotFoundError("Scene not found.");
  const board = db.select().from(storyboards).where(eq(storyboards.id, scene.storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  const access = board.projectId ? requireProjectAccess(board.projectId, viewer, "story") : null;
  if (!access?.canManageStory && board.createdBy !== viewer?.id) throw new ForbiddenError();

  db.update(storyScenes)
    .set({
      title: input.title?.slice(0, 160) ?? scene.title,
      narration: input.narration?.slice(0, 2000) ?? scene.narration,
      durationSeconds: input.durationSeconds ? Math.min(30, Math.max(3, input.durationSeconds)) : scene.durationSeconds,
      // A human edit makes this a human-authored claim, still tied to its source.
      aiGenerated: false,
      factStatus: scene.sourceType ? "documented" : "needs_review",
    })
    .where(eq(storyScenes.id, sceneId))
    .run();
  db.update(storyboards).set({ updatedAt: new Date().toISOString() }).where(eq(storyboards.id, board.id)).run();
}

export function moveScene(sceneId: string, viewer: Viewer, direction: "up" | "down"): void {
  const db = getDb();
  const scene = db.select().from(storyScenes).where(eq(storyScenes.id, sceneId)).get();
  if (!scene) throw new NotFoundError("Scene not found.");
  const board = db.select().from(storyboards).where(eq(storyboards.id, scene.storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  const access = board.projectId ? requireProjectAccess(board.projectId, viewer, "story") : null;
  if (!access?.canManageStory && board.createdBy !== viewer?.id) throw new ForbiddenError();

  const all = db
    .select()
    .from(storyScenes)
    .where(eq(storyScenes.storyboardId, board.id))
    .orderBy(asc(storyScenes.orderIndex))
    .all();
  const index = all.findIndex((item) => item.id === sceneId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= all.length) return;

  transaction((tx) => {
    tx.update(storyScenes).set({ orderIndex: all[swapWith]!.orderIndex }).where(eq(storyScenes.id, all[index]!.id)).run();
    tx.update(storyScenes).set({ orderIndex: all[index]!.orderIndex }).where(eq(storyScenes.id, all[swapWith]!.id)).run();
  });
}

export function submitStoryForReview(storyboardId: string, viewer: Viewer): void {
  const db = getDb();
  const board = db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  if (board.createdBy !== viewer?.id) throw new ForbiddenError("Only the author can submit this story for review.");
  const scenes = db.select().from(storyScenes).where(eq(storyScenes.storyboardId, storyboardId)).all();
  if (scenes.length < 2) throw new AppError("Add at least two scenes before requesting review.");
  if (scenes.some((scene) => scene.factStatus === "unsupported")) {
    throw new AppError("Resolve unsupported claims before requesting review.");
  }

  db.update(storyboards).set({ status: "in_review", updatedAt: new Date().toISOString() }).where(eq(storyboards.id, storyboardId)).run();
  if (board.projectId) {
    const project = db.select().from(projects).where(eq(projects.id, board.projectId)).get();
    notify({
      userId: project!.ownerId,
      actorId: viewer!.id,
      kind: "story_approval",
      title: "A project story needs your approval",
      href: `/projects/${board.projectId}/story`,
    });
  }
}

export function decideStory(
  storyboardId: string,
  viewer: Viewer,
  decision: "approved" | "changes_requested" | "rejected",
  note?: string,
): void {
  const db = getDb();
  const board = db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  if (!board.projectId) throw new AppError("Only project stories require review.");
  const access = requireProjectAccess(board.projectId, viewer, "story");
  if (board.createdBy === viewer?.id && !access.isOwner) {
    throw new ForbiddenError("The author cannot approve their own story.");
  }
  if (board.status !== "in_review") throw new AppError("This story is not awaiting review.");

  transaction((tx) => {
    tx.insert(mediaApprovals)
      .values({ storyboardId, approverId: viewer!.id, decision, note: note?.slice(0, 1200) ?? null })
      .run();
    tx.update(storyboards)
      .set({
        status: decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "draft",
        approvedBy: decision === "approved" ? viewer!.id : board.approvedBy,
        approvedAt: decision === "approved" ? new Date().toISOString() : board.approvedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(storyboards.id, storyboardId))
      .run();
  });

  audit({
    actorId: viewer!.id,
    action: `story.${decision}`,
    targetType: "storyboard",
    targetId: storyboardId,
    metadata: { note: note ?? null },
  });
  notify({
    userId: board.createdBy,
    actorId: viewer!.id,
    kind: "story_approval",
    title: decision === "approved" ? "Your project story was approved" : "Your project story needs changes",
    body: note ?? undefined,
    href: `/projects/${board.projectId}/story`,
  });
}

export async function publishStory(storyboardId: string, viewer: Viewer): Promise<void> {
  const db = getDb();
  const board = db.select().from(storyboards).where(eq(storyboards.id, storyboardId)).get();
  if (!board) throw new NotFoundError("Storyboard not found.");
  if (!board.projectId) throw new AppError("Only project stories can be published here.");
  requireProjectAccess(board.projectId, viewer, "story");
  if (board.status !== "approved") throw new AppError("The story must be approved before publication.");

  const animation = db
    .select()
    .from(generatedMedia)
    .where(and(eq(generatedMedia.storyboardId, storyboardId), eq(generatedMedia.kind, "animation"), eq(generatedMedia.status, "ready")))
    .get();
  if (!animation?.fileId) throw new AppError("Render the animated explainer before publishing.");

  db.update(storyboards)
    .set({ status: "published", approvedBy: board.approvedBy, updatedAt: new Date().toISOString() })
    .where(eq(storyboards.id, storyboardId))
    .run();

  awardReputation({
    userId: board.createdBy,
    dimension: "influence",
    points: REPUTATION_WEIGHTS.influence.story_published,
    reason: `Project story published: ${board.title}`,
    sourceType: "storyboard",
    sourceId: storyboardId,
  });
  audit({ actorId: viewer!.id, action: "story.published", targetType: "storyboard", targetId: storyboardId });
}

export function publishedStories(limit = 6) {
  return getDb()
    .select({ board: storyboards, projectName: projects.name, projectId: projects.id })
    .from(storyboards)
    .leftJoin(projects, eq(projects.id, storyboards.projectId))
    .where(and(eq(storyboards.status, "published"), eq(storyboards.visibility, "public")))
    .orderBy(desc(storyboards.updatedAt))
    .limit(limit)
    .all();
}

export function grantConsent(userId: string, projectId: string, scope: "public_story" | "voice" | "likeness"): void {
  getDb()
    .insert(consentRecords)
    .values({ userId, projectId, scope, granted: true, note: "Granted from project settings" })
    .run();
}

export function revokeConsent(userId: string, projectId: string, scope: "public_story" | "voice" | "likeness"): void {
  getDb()
    .update(consentRecords)
    .set({ granted: false, revokedAt: new Date().toISOString() })
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.projectId, projectId), eq(consentRecords.scope, scope)))
    .run();
}

export function storyResource(projectId: string) {
  return getDb()
    .select()
    .from(learningResources)
    .where(and(eq(learningResources.projectId, projectId), eq(learningResources.format, "story")))
    .all();
}
