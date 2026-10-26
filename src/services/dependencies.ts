import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, transaction } from "@/db/client";
import { taskAssignments, taskDependencies, tasks, type Task } from "@/db/schema";
import { getTaskAccess, requireTaskAccess, type Viewer } from "@/lib/authz";
import { AppError, NotFoundError } from "@/lib/errors";
import { notify, notifyMany } from "@/lib/notify";

export type DependencyItem = {
  id: string;
  reason: string | null;
  prerequisite: Task;
  /** True once the prerequisite itself was approved and completed. */
  satisfied: boolean;
};

/**
 * Prerequisites for a task.
 *
 * Only tasks the viewer is allowed to see are returned; the count of hidden
 * prerequisites is kept so the UI can say "one prerequisite is restricted"
 * instead of silently pretending there are none.
 */
export function listTaskDependencies(taskId: string, viewer: Viewer) {
  const access = getTaskAccess(taskId, viewer);
  if (!access || !access.canView) throw new NotFoundError("Task not found.");

  const rows = getDb()
    .select({ dependency: taskDependencies, prerequisite: tasks })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(eq(taskDependencies.taskId, taskId))
    .all();

  const items: DependencyItem[] = [];
  let restricted = 0;
  for (const row of rows) {
    const visible = getTaskAccess(row.prerequisite.id, viewer)?.canView ?? false;
    if (!visible) {
      restricted += 1;
      continue;
    }
    items.push({
      id: row.dependency.id,
      reason: row.dependency.reason,
      prerequisite: row.prerequisite,
      satisfied: row.prerequisite.status === "completed",
    });
  }

  return {
    items,
    restricted,
    blocked: items.some((item) => !item.satisfied),
    ready: items.length > 0 && items.every((item) => item.satisfied),
  };
}

/** Whether every (visible or not) prerequisite of `taskId` is completed. */
function isReady(taskId: string): boolean {
  const rows = getDb()
    .select({ status: tasks.status })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(eq(taskDependencies.taskId, taskId))
    .all();
  return rows.every((row) => row.status === "completed");
}

/**
 * Link `taskId` to a prerequisite in the same project.
 *
 * Rejects self-links, cross-project links and cycles so the graph stays a DAG.
 * The unique index is the final guard against a race creating the same link twice.
 */
export function addDependency(
  taskId: string,
  viewer: Viewer,
  input: { dependsOnTaskId: string; reason?: string },
): string {
  const access = requireTaskAccess(taskId, viewer, "edit");
  if (input.dependsOnTaskId === taskId) throw new AppError("A task cannot depend on itself.");

  const db = getDb();
  const prerequisite = db.select().from(tasks).where(eq(tasks.id, input.dependsOnTaskId)).get();
  if (!prerequisite || prerequisite.projectId !== access.task.projectId) {
    throw new AppError("Choose another task from this project.");
  }

  const existing = db
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, input.dependsOnTaskId)))
    .get();
  if (existing) throw new AppError("That dependency already exists.", { status: 409, code: "duplicate_dependency" });

  // Walk backwards from the proposed prerequisite. If we reach this task, the
  // new link would close a loop and nothing would ever become ready.
  const edges = db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .all();
  const seen = new Set<string>();
  const stack = [input.dependsOnTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) throw new AppError("That would create a circular dependency.");
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.taskId === current) stack.push(edge.dependsOnTaskId);
    }
  }

  const id = randomUUID();
  db.insert(taskDependencies)
    .values({
      id,
      taskId,
      dependsOnTaskId: input.dependsOnTaskId,
      reason: input.reason?.trim().slice(0, 500) || null,
      createdBy: viewer!.id,
    })
    .run();

  // Tell the people doing the work that they are waiting on something. This is
  // derived from the dependency that was just written, not a scheduler, and is
  // deduplicated per dependency so re-saving the form cannot repeat it.
  if (prerequisite.status !== "completed") {
    const assignees = db
      .select({ userId: taskAssignments.userId })
      .from(taskAssignments)
      .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.status, "active")))
      .all()
      .map((row) => row.userId);
    notifyMany(assignees, {
      actorId: viewer!.id,
      kind: "system",
      title: `Blocked until a prerequisite is approved: ${access.task.title}`,
      body: `This task depends on "${prerequisite.title}", which is not completed yet.`,
      href: `/tasks/${taskId}`,
      dedupeKey: `dependency_blocked:${id}`,
      entityType: "task",
      entityId: taskId,
    });
  }

  return id;
}

export function removeDependency(dependencyId: string, viewer: Viewer): void {
  const row = getDb().select().from(taskDependencies).where(eq(taskDependencies.id, dependencyId)).get();
  if (!row) throw new NotFoundError("Dependency not found.");
  requireTaskAccess(row.taskId, viewer, "edit");
  getDb().delete(taskDependencies).where(eq(taskDependencies.id, dependencyId)).run();
}

/**
 * Called after a task is approved. Any dependent task whose prerequisites are now
 * all satisfied gets its responsible people told that work can start.
 *
 * Runs outside the approval transaction: the approval must not fail because a
 * notification could not be written, and readiness is always derived from state.
 */
export function notifyDependentsReady(completedTaskId: string, actorId: string): void {
  const db = getDb();
  const completed = db.select().from(tasks).where(eq(tasks.id, completedTaskId)).get();
  if (!completed) return;

  const dependents = db
    .select({ task: tasks })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .where(and(eq(taskDependencies.dependsOnTaskId, completedTaskId), ne(tasks.status, "completed")))
    .all();

  for (const { task } of dependents) {
    if (!isReady(task.id)) continue;

    const responsible = db
      .select({ userId: taskAssignments.userId })
      .from(taskAssignments)
      .where(and(eq(taskAssignments.taskId, task.id), eq(taskAssignments.status, "active")))
      .all()
      .map((row) => row.userId);

    const people = [...new Set([...responsible, task.createdBy])];
    notifyMany(people, {
      actorId,
      kind: "system",
      title: `Ready to start: ${task.title}`,
      body: `"${completed.title}" was approved, so its prerequisite for this task is satisfied.`,
      href: `/tasks/${task.id}`,
      dedupeKey: `dependency_ready:${task.id}:${completedTaskId}`,
      entityType: "task",
      entityId: task.id,
    });
  }
}

/** Used by tests and the project view: are all prerequisites of this task done? */
export function taskReady(taskId: string): boolean {
  return isReady(taskId);
}
