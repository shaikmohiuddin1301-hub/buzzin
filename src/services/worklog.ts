import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  consentRecords,
  mediaFiles,
  projects,
  taskAssignments,
  taskSubmissions,
  tasks,
  users,
  workLogEntries,
} from "@/db/schema";
import { getTaskAccess, requireTaskAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import type { WorkLogKind, WorkLogVisibility } from "@/lib/types";

export type WorkLogInput = {
  kind: WorkLogKind;
  title: string;
  body?: string;
  linkUrl?: string;
  fileId?: string | null;
  visibility: WorkLogVisibility;
};

/**
 * Add a documentation entry.
 *
 * Visibility is enforced here, not in the UI:
 * - the project must have public documentation enabled for any public scope;
 * - `public` additionally records the contributor's consent for story use;
 * - without permission the entry silently degrades to `team` so nothing leaks.
 */
export function addWorkLogEntry(taskId: string, userId: string, input: WorkLogInput): string {
  const access = requireTaskAccess(taskId, { id: userId }, "workspace");
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, access.task.projectId)).get();
  if (!project) throw new NotFoundError("Project not found.");

  if (!input.title.trim()) throw new AppError("Give the entry a title.");
  if (input.visibility !== "private" && !access.isAssignee && !access.canReview) {
    throw new ForbiddenError("Only contributors on this task can add shared documentation.");
  }

  let visibility = input.visibility;
  if ((visibility === "public" || visibility === "public_pending") && !project.allowPublicDocs) {
    throw new AppError("This project has not enabled public documentation. Save the entry as team-only.");
  }
  if (visibility === "public" && !access.isAssignee) {
    // Only the contributor who did the work decides whether it becomes public.
    visibility = "public_pending";
  }

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(workLogEntries)
      .values({
        id,
        taskId,
        authorId: userId,
        kind: input.kind,
        title: input.title.trim().slice(0, 160),
        body: input.body?.slice(0, 12000) ?? null,
        linkUrl: input.linkUrl?.slice(0, 500) ?? null,
        fileId: input.fileId ?? null,
        visibility,
      })
      .run();

    if (visibility === "public" || visibility === "public_pending") {
      tx.insert(consentRecords)
        .values({
          userId,
          scope: "public_story",
          projectId: project.id,
          granted: true,
          note: `Consent recorded when documenting "${input.title.slice(0, 120)}"`,
        })
        .run();
    }
  });

  if (visibility === "public_pending") {
    notify({
      userId: project.ownerId,
      actorId: userId,
      kind: "story_approval",
      title: "A contributor requested public documentation",
      body: input.title,
      href: `/tasks/${taskId}/workspace`,
    });
  }
  return id;
}

/** Entries a viewer may read, filtered by scope. */
export function listWorkLogEntries(taskId: string, viewer: Viewer) {
  const access = getTaskAccess(taskId, viewer);
  if (!access || !access.canViewWorkspace) {
    throw new ForbiddenError("Only project members can read this workspace.");
  }
  const db = getDb();

  const rows = db
    .select({
      entry: workLogEntries,
      authorName: users.displayName,
      authorUsername: users.username,
      authorAvatar: users.avatarFileId,
      file: mediaFiles,
    })
    .from(workLogEntries)
    .innerJoin(users, eq(users.id, workLogEntries.authorId))
    .leftJoin(mediaFiles, eq(mediaFiles.id, workLogEntries.fileId))
    .where(eq(workLogEntries.taskId, taskId))
    .orderBy(desc(workLogEntries.createdAt))
    .all();

  return rows.filter((row) => {
    if (row.entry.visibility === "private") return row.entry.authorId === viewer?.id;
    if (row.entry.visibility === "public") return true;
    return access.canViewWorkspace;
  });
}

export function updateWorkLogEntry(
  entryId: string,
  userId: string,
  input: { title?: string; body?: string; visibility?: WorkLogVisibility },
): void {
  const db = getDb();
  const entry = db.select().from(workLogEntries).where(eq(workLogEntries.id, entryId)).get();
  if (!entry) throw new NotFoundError("Entry not found.");
  if (entry.authorId !== userId) throw new ForbiddenError("Only the author can edit this entry.");
  const task = db.select().from(tasks).where(eq(tasks.id, entry.taskId)).get();
  const project = task ? db.select().from(projects).where(eq(projects.id, task.projectId)).get() : null;

  if (input.visibility && input.visibility !== entry.visibility) {
    if ((input.visibility === "public" || input.visibility === "public_pending") && !project?.allowPublicDocs) {
      throw new AppError("Public documentation is disabled for this project.");
    }
    db.insert(consentRecords)
      .values({
        userId,
        scope: "public_story",
        projectId: project?.id ?? null,
        granted: input.visibility === "public" || input.visibility === "public_pending",
        note: `Visibility changed on entry ${entryId}`,
      })
      .run();
  }

  const history = [
    ...(entry.editHistory ?? []),
    { at: new Date().toISOString(), by: userId, summary: "Entry edited" },
  ].slice(-20);

  db.update(workLogEntries)
    .set({
      title: input.title?.slice(0, 160) ?? entry.title,
      body: input.body !== undefined ? input.body.slice(0, 12000) : entry.body,
      visibility: input.visibility ?? entry.visibility,
      editHistory: history,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workLogEntries.id, entryId))
    .run();
}

/** Project owner approves an entry queued for public release. */
export function approveWorkLogEntry(entryId: string, viewer: Viewer): void {
  const db = getDb();
  const entry = db.select().from(workLogEntries).where(eq(workLogEntries.id, entryId)).get();
  if (!entry) throw new NotFoundError("Entry not found.");
  const task = db.select().from(tasks).where(eq(tasks.id, entry.taskId)).get();
  if (!task) throw new NotFoundError("Task not found.");
  const access = getTaskAccess(task.id, viewer);
  if (!access?.canReview) throw new ForbiddenError("Only the project owner or a reviewer can approve documentation.");
  if (entry.visibility !== "public_pending") throw new AppError("Only entries awaiting approval can be approved.");

  db.update(workLogEntries)
    .set({ visibility: "public", approvedBy: viewer!.id, approvedAt: new Date().toISOString() })
    .where(eq(workLogEntries.id, entryId))
    .run();
  notify({
    userId: entry.authorId,
    actorId: viewer!.id,
    kind: "story_approval",
    title: "Your documentation is now public",
    body: entry.title,
    href: `/tasks/${task.id}/workspace`,
  });
}

export function withdrawConsent(userId: string, projectId: string): void {
  const db = getDb();
  transaction((tx) => {
    tx.update(consentRecords)
      .set({ revokedAt: new Date().toISOString(), granted: false })
      .where(and(eq(consentRecords.userId, userId), eq(consentRecords.projectId, projectId), eq(consentRecords.scope, "public_story")))
      .run();
    // Entries that were public are pulled back to team-only scope immediately.
    const taskIds = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .all()
      .map((row) => row.id);
    for (const taskId of taskIds) {
      tx.update(workLogEntries)
        .set({ visibility: "team" })
        .where(and(eq(workLogEntries.taskId, taskId), eq(workLogEntries.authorId, userId), eq(workLogEntries.visibility, "public")))
        .run();
    }
  });
}

/** Workspace overview for a task, including the contributor's own entries. */
export function workspaceFor(taskId: string, viewer: Viewer) {
  const access = getTaskAccess(taskId, viewer);
  if (!access) throw new NotFoundError("Task not found.");
  const entries = access.canViewWorkspace ? listWorkLogEntries(taskId, viewer) : [];
  const db = getDb();

  const submitter = viewer
    ? db
        .select()
        .from(taskAssignments)
        .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.userId, viewer.id)))
        .get()
    : undefined;

  const latestSubmission = viewer
    ? db
        .select()
        .from(taskSubmissions)
        .where(and(eq(taskSubmissions.taskId, taskId), eq(taskSubmissions.userId, viewer.id)))
        .orderBy(desc(taskSubmissions.submittedAt))
        .get()
    : undefined;

  return { access, entries, assignment: submitter ?? null, latestSubmission: latestSubmission ?? null };
}

/** Approved, public entries used as source material for story generation. */
export function approvedSourcesForProject(projectId: string) {
  const db = getDb();
  const projectTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId)).all().map((row) => row.id);
  if (projectTaskIds.length === 0) return [];
  return db
    .select({
      entry: workLogEntries,
      taskTitle: tasks.title,
      authorName: users.displayName,
    })
    .from(workLogEntries)
    .innerJoin(tasks, eq(tasks.id, workLogEntries.taskId))
    .innerJoin(users, eq(users.id, workLogEntries.authorId))
    .where(
      and(
        inArray(workLogEntries.taskId, projectTaskIds),
        eq(workLogEntries.visibility, "public"),
        or(isNull(workLogEntries.approvedAt), isNull(workLogEntries.approvedBy)),
      ),
    )
    .orderBy(asc(workLogEntries.createdAt))
    .all();
}
