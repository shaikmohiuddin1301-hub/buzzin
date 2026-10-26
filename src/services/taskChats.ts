import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import { conversationMembers, conversations, projectMembers, taskAssignments } from "@/db/schema";
import { getTaskAccess, type Viewer } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";

/**
 * The dedicated chat for one task.
 *
 * Membership is derived from the task itself (assignees, the project owner,
 * reviewers and admins) rather than a manual invite list, so there is nothing to
 * set up after creating a task. `ensureTaskChat` is idempotent: it creates the
 * conversation once and then only adds anyone newly responsible for the work.
 *
 * This lives outside `chat.ts` so `tasks.ts` can create a task's chat as part of
 * creating the task; `chat.ts` re-exports it for the rest of the app.
 */
export function ensureTaskChat(taskId: string, viewer: Viewer): string {
  const access = getTaskAccess(taskId, viewer);
  if (!access || !access.canViewWorkspace) throw new NotFoundError("Task chat not found.");

  const db = getDb();
  const task = access.task;
  const memberIds = new Set<string>();
  for (const row of db
    .select({ userId: taskAssignments.userId })
    .from(taskAssignments)
    .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.status, "active")))
    .all()) {
    memberIds.add(row.userId);
  }
  for (const row of db
    .select({ userId: projectMembers.userId, role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.status, "active")))
    .all()) {
    if (row.userId === access.projectAccess.project.ownerId || row.role === "admin" || row.role === "reviewer") {
      memberIds.add(row.userId);
    }
  }

  const existing = db.select().from(conversations).where(eq(conversations.taskId, taskId)).get();
  if (existing) {
    const known = new Set(
      db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, existing.id))
        .all()
        .map((row) => row.userId),
    );
    for (const userId of memberIds) {
      if (!known.has(userId)) {
        db.insert(conversationMembers).values({ conversationId: existing.id, userId, role: "member" }).onConflictDoNothing().run();
      }
    }
    return existing.id;
  }

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(conversations)
      .values({ id, projectId: task.projectId, taskId, kind: "group", title: `Task · ${task.title}`.slice(0, 120), createdBy: viewer!.id })
      .run();
    for (const userId of memberIds) {
      tx.insert(conversationMembers)
        .values({ conversationId: id, userId, role: userId === access.projectAccess.project.ownerId ? "admin" : "member" })
        .onConflictDoNothing()
        .run();
    }
  });
  return id;
}
