import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  contributorAttributions,
  deliverables,
  learningProgress,
  learningResources,
  projects,
  tasks,
  userPreferences,
  users,
} from "@/db/schema";

export type AcceptedWorkRecord = {
  attributionId: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  role: string;
  summary: string | null;
  status: string;
  verificationMethod: string;
  confirmedAt: string | null;
  deliverable: { id: string; title: string; url: string | null; fileId: string | null } | null;
};

/**
 * Accepted work for a profile.
 *
 * Every row comes from the same `contributor_attributions` record that the project
 * uses; deliverables are joined by task, never copied. The UI must keep saying
 * that owner acceptance is not independent verification.
 */
export function acceptedWorkForUser(userId: string): AcceptedWorkRecord[] {
  const rows = getDb()
    .select({
      attribution: contributorAttributions,
      projectName: projects.name,
      taskTitle: tasks.title,
      deliverable: {
        id: deliverables.id,
        title: deliverables.title,
        url: deliverables.url,
        fileId: deliverables.fileId,
      },
    })
    .from(contributorAttributions)
    .innerJoin(projects, eq(projects.id, contributorAttributions.projectId))
    .leftJoin(tasks, eq(tasks.id, contributorAttributions.taskId))
    .leftJoin(deliverables, and(eq(deliverables.taskId, contributorAttributions.taskId), eq(deliverables.approved, true)))
    .where(eq(contributorAttributions.userId, userId))
    .orderBy(desc(contributorAttributions.confirmedAt), desc(contributorAttributions.createdAt))
    .all();

  return rows.map((row) => ({
    attributionId: row.attribution.id,
    projectId: row.attribution.projectId,
    projectName: row.projectName,
    taskId: row.attribution.taskId,
    taskTitle: row.taskTitle ?? null,
    role: row.attribution.role,
    summary: row.attribution.summary,
    status: row.attribution.status,
    verificationMethod: row.attribution.verificationMethod,
    confirmedAt: row.attribution.confirmedAt,
    deliverable: row.deliverable?.id
      ? { id: row.deliverable.id, title: row.deliverable.title ?? "Deliverable", url: row.deliverable.url, fileId: row.deliverable.fileId }
      : null,
  }));
}

export type LearningHistoryItem = {
  resourceId: string;
  title: string;
  summary: string | null;
  creatorName: string;
  creatorUsername: string;
  completedAt: string;
  progressPct: number;
  topic: string | null;
};

/**
 * Completed learning, newest first.
 *
 * This is only exposed publicly when the learner opted in
 * (`user_preferences.share_learning_history`); the caller decides that, not this
 * query, so the owner always sees their own history.
 */
export function learningHistoryFor(userId: string): LearningHistoryItem[] {
  const rows = getDb()
    .select({
      progress: learningProgress,
      resource: learningResources,
      creatorName: users.displayName,
      creatorUsername: users.username,
    })
    .from(learningProgress)
    .innerJoin(learningResources, eq(learningResources.id, learningProgress.resourceId))
    .innerJoin(users, eq(users.id, learningResources.creatorId))
    .where(and(eq(learningProgress.userId, userId), eq(learningProgress.completed, true)))
    .orderBy(desc(learningProgress.updatedAt))
    .all();

  const seen = new Set<string>();
  const items: LearningHistoryItem[] = [];
  for (const row of rows) {
    if (seen.has(row.resource.id)) continue;
    seen.add(row.resource.id);
    items.push({
      resourceId: row.resource.id,
      title: row.resource.title,
      summary: row.resource.summary,
      creatorName: row.creatorName,
      creatorUsername: row.creatorUsername,
      completedAt: row.progress.updatedAt,
      progressPct: row.progress.progressPct,
      topic: row.resource.topic,
    });
  }
  return items;
}

/** Whether a learner has agreed to show completed learning on their profile. */
export function sharesLearningHistory(userId: string): boolean {
  const prefs = getDb().select().from(userPreferences).where(eq(userPreferences.userId, userId)).get();
  return prefs?.shareLearningHistory ?? false;
}
