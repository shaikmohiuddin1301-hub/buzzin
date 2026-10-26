import { asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, transaction } from "@/db/client";
import { deliverables, tasks, workAreas } from "@/db/schema";
import { requireProjectAccess, type Viewer } from "@/lib/authz";
import { AppError, NotFoundError } from "@/lib/errors";
import { ensureGroupConversation } from "@/services/chat";

export type WorkAreaSummary = {
  id: string;
  name: string;
  description: string | null;
  conversationId: string | null;
  drops: number;
  openDrops: number;
  accepted: number;
};

const MAX_NAME = 40;

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new AppError("Give the work area a name of at least 2 characters.");
  if (trimmed.length > MAX_NAME) throw new AppError(`Work area names are limited to ${MAX_NAME} characters.`);
  return trimmed;
}

/**
 * Work areas for a project, with counts derived from real tasks.
 *
 * Names are visible to anyone who can see the project; counts only include work
 * the viewer may see, so a public visitor never learns about private tasks.
 */
export function listWorkAreas(projectId: string, viewer: Viewer): WorkAreaSummary[] {
  const access = requireProjectAccess(projectId, viewer, "view");
  const db = getDb();
  const areas = db.select().from(workAreas).where(eq(workAreas.projectId, projectId)).orderBy(asc(workAreas.name)).all();
  if (areas.length === 0) return [];

  const visibilityFilter = access.canViewWorkspace ? sql`1 = 1` : sql`${tasks.visibility} = 'public' and ${tasks.status} <> 'draft'`;

  return areas.map((area) => {
    const counts = db
      .select({
        drops: sql<number>`count(*)`,
        openDrops: sql<number>`sum(case when ${tasks.status} in ('open','reviewing_interest','assigned','in_progress','submitted','revision_requested') then 1 else 0 end)`,
      })
      .from(tasks)
      .where(sql`${tasks.workAreaId} = ${area.id} and ${visibilityFilter}`)
      .get() as { drops: number | null; openDrops: number | null } | undefined;

    const accepted = db
      .select({ count: sql<number>`count(*)` })
      .from(deliverables)
      .innerJoin(tasks, eq(tasks.id, deliverables.taskId))
      .where(sql`${tasks.workAreaId} = ${area.id} and ${deliverables.approved} = 1 and ${visibilityFilter}`)
      .get() as { count: number } | undefined;

    return {
      id: area.id,
      name: area.name,
      description: area.description,
      conversationId: area.conversationId,
      drops: Number(counts?.drops ?? 0),
      openDrops: Number(counts?.openDrops ?? 0),
      accepted: Number(accepted?.count ?? 0),
    };
  });
}

/**
 * Create a work area and its dedicated chat.
 *
 * The chat is a project group conversation, so members and permissions come from
 * project membership rather than a second access list. If chat creation fails the
 * area still exists; opening it later creates the chat on demand.
 */
export function createWorkArea(
  projectId: string,
  viewer: Viewer,
  input: { name: string; description?: string },
): string {
  requireProjectAccess(projectId, viewer, "edit");
  const db = getDb();
  const name = assertName(input.name);

  const clash = db
    .select({ id: workAreas.id })
    .from(workAreas)
    .where(sql`${workAreas.projectId} = ${projectId} and lower(${workAreas.name}) = lower(${name})`)
    .get();
  if (clash) throw new AppError("A work area with that name already exists.", { status: 409, code: "duplicate_area" });

  const id = randomUUID();
  db.insert(workAreas)
    .values({
      id,
      projectId,
      name,
      description: input.description?.trim().slice(0, 500) || null,
      createdBy: viewer!.id,
    })
    .run();

  const conversationId = ensureGroupConversation(projectId, `${name} · work area`, viewer!.id);
  db.update(workAreas).set({ conversationId }).where(eq(workAreas.id, id)).run();

  return id;
}

export function getWorkArea(areaId: string, viewer: Viewer) {
  const db = getDb();
  const area = db.select().from(workAreas).where(eq(workAreas.id, areaId)).get();
  if (!area) throw new NotFoundError("Work area not found.");
  const access = requireProjectAccess(area.projectId, viewer, "view");
  return { area, access };
}

/** Open (or lazily create) the chat that belongs to a work area. Members only. */
export function ensureWorkAreaChat(areaId: string, viewer: Viewer): string {
  const { area, access } = getWorkArea(areaId, viewer);
  if (!access.canViewWorkspace) throw new AppError("Join the project team to open this chat.", { status: 403, code: "forbidden" });
  const conversationId = ensureGroupConversation(area.projectId, `${area.name} · work area`, viewer!.id, area.conversationId);
  if (conversationId !== area.conversationId) {
    getDb().update(workAreas).set({ conversationId }).where(eq(workAreas.id, area.id)).run();
  }
  return conversationId;
}

/** Move a task into a work area (or out of one). */
export function assignTaskToArea(taskId: string, viewer: Viewer, areaId: string | null): void {
  const db = getDb();
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new NotFoundError("Task not found.");
  requireProjectAccess(task.projectId, viewer, "edit");

  if (areaId) {
    const area = db.select().from(workAreas).where(eq(workAreas.id, areaId)).get();
    if (!area || area.projectId !== task.projectId) throw new AppError("Choose a work area from this project.");
  }

  db.update(tasks)
    .set({ workAreaId: areaId, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId))
    .run();
}

/** The work area a conversation belongs to, if any — used when filing a chat message. */
export function workAreaForConversation(conversationId: string) {
  return (
    getDb()
      .select({ id: workAreas.id, name: workAreas.name, projectId: workAreas.projectId })
      .from(workAreas)
      .where(eq(workAreas.conversationId, conversationId))
      .get() ?? null
  );
}

/** Used by project setup: create a starting area so a new project has a home for work. */
export function ensureStarterArea(projectId: string, viewer: Viewer): string | null {
  const db = getDb();
  const existing = db.select({ id: workAreas.id }).from(workAreas).where(eq(workAreas.projectId, projectId)).get();
  if (existing) return existing.id;
  return createWorkArea(projectId, viewer, {
    name: "General",
    description: "The default home for tasks that do not belong to a more specific area yet.",
  });
}

export function workAreaDropdown(projectId: string) {
  return getDb()
    .select({ id: workAreas.id, name: workAreas.name })
    .from(workAreas)
    .where(eq(workAreas.projectId, projectId))
    .orderBy(asc(workAreas.name))
    .all();
}

export function deleteWorkArea(areaId: string, viewer: Viewer): void {
  const { area } = getWorkArea(areaId, viewer);
  requireProjectAccess(area.projectId, viewer, "edit");
  transaction((tx) => {
    tx.update(tasks).set({ workAreaId: null }).where(eq(tasks.workAreaId, areaId)).run();
    tx.delete(workAreas).where(eq(workAreas.id, areaId)).run();
  });
}
