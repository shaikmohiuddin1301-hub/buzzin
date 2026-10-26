import { and, eq, inArray, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db/client";
import {
  contributorAttributions,
  deliverables,
  projects,
  skills,
  taskSkills,
  taskSubmissions,
  tasks,
  users,
  workAreas,
} from "@/db/schema";
import { requireProjectAccess, type Viewer } from "@/lib/authz";

export type AcceptedWorkItem = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  fileId: string | null;
  taskId: string;
  taskTitle: string;
  submissionId: string | null;
  contributor: { id: string; name: string; username: string } | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  attributionStatus: string | null;
  verificationMethod: string | null;
  areaKey: string;
  areaLabel: string;
  workAreaId: string | null;
  createdAt: string;
};

export type AcceptedWorkArea = { key: string; label: string; count: number };

const GENERAL = { key: "general", label: "General" };

/** Skill categories are stored as slugs (`software`), so present them as words. */
function formatAreaLabel(raw: string): string {
  if (!/^[a-z0-9_-]+$/.test(raw)) return raw;
  return raw
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function areaKeyOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "general";
}

/**
 * Accepted work for a project — the canonical collection.
 *
 * Every item is a `deliverables` row whose submission was accepted. The same row
 * is what the Drop page shows, so "filed into Accepted Work" means a new view of
 * the original record, never a copy. Grouping uses the task's skill category
 * ("Design", "Engineering", …) because that is the work-area vocabulary the
 * project already carries; tasks without skills fall back to "General".
 *
 * Visibility: project members see all accepted work. Everyone else sees only
 * accepted work from public tasks on a project they can view.
 */
export function projectAcceptedWork(projectId: string, viewer: Viewer) {
  const access = requireProjectAccess(projectId, viewer, "view");
  const db = getDb();
  const reviewer = alias(users, "reviewer");

  const rows = db
    .select({
      deliverable: deliverables,
      task: tasks,
      submission: taskSubmissions,
      workAreaName: workAreas.name,
      workAreaId: workAreas.id,
      contributorId: users.id,
      contributorName: users.displayName,
      contributorUsername: users.username,
      reviewerName: reviewer.displayName,
    })
    .from(deliverables)
    .innerJoin(tasks, eq(tasks.id, deliverables.taskId))
    .leftJoin(taskSubmissions, eq(taskSubmissions.id, deliverables.submissionId))
    .leftJoin(users, eq(users.id, taskSubmissions.userId))
    .leftJoin(reviewer, eq(reviewer.id, taskSubmissions.reviewerId))
    .leftJoin(workAreas, eq(workAreas.id, tasks.workAreaId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(deliverables.approved, true),
        access.canViewWorkspace ? undefined : eq(tasks.visibility, "public"),
      ),
    )
    .orderBy(desc(taskSubmissions.reviewedAt), desc(deliverables.createdAt))
    .all();

  if (rows.length === 0) return { items: [] as AcceptedWorkItem[], areas: [] as AcceptedWorkArea[], canViewFiles: access.canViewWorkspace };

  const taskIds = [...new Set(rows.map((row) => row.task.id))];

  // Work area per task: prefer a categorised skill, then any skill, then General.
  const skillRows = db
    .select({ taskId: taskSkills.taskId, name: skills.name, category: skills.category })
    .from(taskSkills)
    .innerJoin(skills, eq(skills.id, taskSkills.skillId))
    .where(inArray(taskSkills.taskId, taskIds))
    .orderBy(skills.name)
    .all();
  const areaByTask = new Map<string, { key: string; label: string }>();
  for (const row of skillRows) {
    if (areaByTask.has(row.taskId)) continue;
    const label = formatAreaLabel(row.category?.trim() || row.name);
    areaByTask.set(row.taskId, { key: areaKeyOf(label), label });
  }

  const attributions = db
    .select({ attribution: contributorAttributions })
    .from(contributorAttributions)
    .where(inArray(contributorAttributions.taskId, taskIds))
    .all();

  const items: AcceptedWorkItem[] = rows.map((row) => {
    // A work area is the canonical home; the skill category is only a fallback for
    // projects that have not organised themselves yet.
    const area = row.workAreaName
      ? { key: `area-${row.workAreaId}`, label: row.workAreaName }
      : (areaByTask.get(row.task.id) ?? GENERAL);
    const attribution =
      attributions.find(
        (candidate) =>
          candidate.attribution.taskId === row.task.id &&
          row.submission?.userId != null &&
          candidate.attribution.userId === row.submission.userId,
      )?.attribution ?? null;

    return {
      id: row.deliverable.id,
      title: row.deliverable.title,
      description: row.deliverable.description,
      url: row.deliverable.url,
      fileId: row.deliverable.fileId,
      taskId: row.task.id,
      taskTitle: row.task.title,
      submissionId: row.deliverable.submissionId,
      contributor:
        row.contributorId && row.contributorName
          ? { id: row.contributorId, name: row.contributorName, username: row.contributorUsername ?? "" }
          : null,
      reviewerName: row.reviewerName ?? null,
      reviewedAt: row.submission?.reviewedAt ?? null,
      attributionStatus: attribution?.status ?? null,
      verificationMethod: attribution?.verificationMethod ?? null,
      areaKey: area.key,
      areaLabel: area.label,
      workAreaId: row.workAreaId ?? null,
      createdAt: row.deliverable.createdAt,
    };
  });

  const areaCounts = new Map<string, AcceptedWorkArea>();
  for (const item of items) {
    const existing = areaCounts.get(item.areaKey);
    if (existing) existing.count += 1;
    else areaCounts.set(item.areaKey, { key: item.areaKey, label: item.areaLabel, count: 1 });
  }

  return {
    items,
    areas: [...areaCounts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    canViewFiles: access.canViewWorkspace,
  };
}

export function projectNameFor(projectId: string): string | null {
  return getDb().select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).get()?.name ?? null;
}
