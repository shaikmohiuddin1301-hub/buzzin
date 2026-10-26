import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  courseModules,
  courses,
  exercises,
  learningJourneySteps,
  learningJourneys,
  learningProgress,
  learningResources,
  learnerFeedback,
  lessons,
  projectMembers,
  projects,
  tasks,
  users,
  workLogEntries,
} from "@/db/schema";
import { getProjectAccess, getTaskAccess, hasEntitlement, requireProjectAccess, requireTaskAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { slugify, truncate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { awardReputation, REPUTATION_WEIGHTS } from "@/lib/reputation";
import { createPost } from "@/services/social";
import type { ResourceFormat, ResourceLevel, ResourceStatus } from "@/lib/types";

/* ---------------------------------- journeys ------------------------------- */

export function createJourney(
  creatorId: string,
  input: { projectId?: string | null; taskId?: string | null; title: string; summary?: string; visibility: "public" | "private" },
): string {
  const db = getDb();
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: creatorId });
    if (!access?.isMember) throw new ForbiddenError("Only project members can build a journey from this project.");
  }
  if (input.taskId) {
    const access = getTaskAccess(input.taskId, { id: creatorId });
    if (!access?.canViewWorkspace) throw new ForbiddenError("You need workspace access to build a journey from this task.");
  }
  if (!input.title.trim()) throw new AppError("Give the learning journey a title.");

  const id = randomUUID();
  db.insert(learningJourneys)
    .values({
      id,
      creatorId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      title: input.title.trim().slice(0, 160),
      summary: input.summary?.slice(0, 600) ?? null,
      visibility: input.visibility,
    })
    .run();
  return id;
}

export function addJourneyStep(
  journeyId: string,
  userId: string,
  input: {
    title: string;
    body: string;
    kind?: string;
    sourceType?: "work_log" | "task" | "milestone" | "update" | "deliverable" | null;
    sourceId?: string | null;
    skillId?: string | null;
  },
): void {
  const db = getDb();
  const journey = db.select().from(learningJourneys).where(eq(learningJourneys.id, journeyId)).get();
  if (!journey) throw new NotFoundError("Journey not found.");
  if (journey.creatorId !== userId) throw new ForbiddenError("Only the journey creator can edit it.");
  if (!input.title.trim()) throw new AppError("Each step needs a title.");

  if (input.sourceType === "work_log" && input.sourceId) {
    const entry = db.select().from(workLogEntries).where(eq(workLogEntries.id, input.sourceId)).get();
    if (!entry) throw new AppError("That source record no longer exists.");
    if (entry.authorId !== userId && entry.visibility !== "public") {
      throw new ForbiddenError("You cannot cite another contributor's private documentation.");
    }
    // Public journeys may only cite documentation that was approved for release.
    if (journey.visibility === "public" && entry.visibility === "team") {
      throw new AppError("This entry is team-only. Use the project's public documentation or ask the owner to approve it.");
    }
  }

  const max = db
    .select({ value: sql<number>`coalesce(max(${learningJourneySteps.orderIndex}), 0)` })
    .from(learningJourneySteps)
    .where(eq(learningJourneySteps.journeyId, journeyId))
    .get();

  db.insert(learningJourneySteps)
    .values({
      journeyId,
      title: input.title.trim().slice(0, 160),
      body: input.body.slice(0, 8000),
      kind: input.kind ?? "context",
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      skillId: input.skillId ?? null,
      orderIndex: Number(max?.value ?? 0) + 1,
    })
    .run();
}

/**
 * Draft a journey from a task's approved documentation.
 *
 * Deterministic and source-cited: it never adds narrative that is not present in
 * the record. Entries without approval are excluded with an explanation.
 */
export function draftJourneyFromTask(taskId: string, userId: string): { journeyId: string; skipped: number } {
  const access = requireTaskAccess(taskId, { id: userId }, "workspace");
  const db = getDb();
  const entries = db
    .select()
    .from(workLogEntries)
    .where(and(eq(workLogEntries.taskId, taskId), inArray(workLogEntries.visibility, ["public", "public_pending"])))
    .orderBy(asc(workLogEntries.createdAt))
    .all();

  const journeyId = createJourney(userId, {
    projectId: access.task.projectId,
    taskId,
    title: `How we delivered: ${access.task.title}`,
    summary: access.task.objective ?? truncate(access.task.description, 240),
    visibility: "private",
  });

  let skipped = 0;
  for (const entry of entries) {
    if (entry.visibility !== "public" && entry.authorId !== userId && !access.canReview) {
      skipped += 1;
      continue;
    }
    addJourneyStep(journeyId, userId, {
      title: entry.title,
      body: entry.body ?? "(No written detail was recorded for this entry.)",
      kind: entry.kind === "decision" ? "decision" : entry.kind === "challenge" ? "challenge" : entry.kind === "experiment" ? "experiment" : "context",
      sourceType: "work_log",
      sourceId: entry.id,
    });
  }

  return { journeyId, skipped };
}

export function journeyDetail(journeyId: string, viewer: Viewer) {
  const db = getDb();
  const row = db
    .select({ journey: learningJourneys, creatorName: users.displayName, creatorUsername: users.username })
    .from(learningJourneys)
    .innerJoin(users, eq(users.id, learningJourneys.creatorId))
    .where(eq(learningJourneys.id, journeyId))
    .get();
  if (!row) return null;
  if (row.journey.visibility !== "public" && row.journey.creatorId !== viewer?.id) {
    if (!viewer) return null;
    if (row.journey.projectId && !getProjectAccess(row.journey.projectId, viewer)?.isMember && !viewer.isAdmin) return null;
  }
  const steps = db
    .select()
    .from(learningJourneySteps)
    .where(eq(learningJourneySteps.journeyId, journeyId))
    .orderBy(asc(learningJourneySteps.orderIndex))
    .all();
  const project = row.journey.projectId ? db.select().from(projects).where(eq(projects.id, row.journey.projectId)).get() : null;
  return { ...row, steps, project: project ?? null };
}

export function publishJourney(journeyId: string, userId: string): void {
  const db = getDb();
  const journey = db.select().from(learningJourneys).where(eq(learningJourneys.id, journeyId)).get();
  if (!journey) throw new NotFoundError("Journey not found.");
  const project = journey.projectId ? db.select().from(projects).where(eq(projects.id, journey.projectId)).get() : null;
  const isOwner = project?.ownerId === userId;
  if (journey.creatorId !== userId && !isOwner) throw new ForbiddenError();

  const stepCount = db
    .select({ count: sql<number>`count(*)` })
    .from(learningJourneySteps)
    .where(eq(learningJourneySteps.journeyId, journeyId))
    .get();

  if (Number(stepCount?.count ?? 0) < 2) throw new AppError("Add at least two steps before publishing a journey.");
  if (project && !isOwner && journey.status !== "approved") {
    throw new AppError("The project owner must approve this journey before it is published publicly.");
  }

  db.update(learningJourneys)
    .set({ status: "published", visibility: "public", publishedAt: new Date().toISOString() })
    .where(eq(learningJourneys.id, journeyId))
    .run();
  awardReputation({
    userId: journey.creatorId,
    dimension: "teaching",
    points: REPUTATION_WEIGHTS.teaching.journey_published,
    reason: `Learning journey published: ${journey.title}`,
    sourceType: "journey",
    sourceId: journeyId,
  });
}

export function approveJourney(journeyId: string, viewer: Viewer): void {
  const db = getDb();
  const journey = db.select().from(learningJourneys).where(eq(learningJourneys.id, journeyId)).get();
  if (!journey) throw new NotFoundError("Journey not found.");
  if (!journey.projectId) throw new AppError("Only project-linked journeys need owner approval.");
  requireProjectAccess(journey.projectId, viewer, "edit");
  db.update(learningJourneys).set({ status: "approved" }).where(eq(learningJourneys.id, journeyId)).run();
  notify({
    userId: journey.creatorId,
    actorId: viewer!.id,
    kind: "story_approval",
    title: "Your learning journey was approved",
    href: `/learn/${journeyId}`,
  });
}

export function journeysFor(userId: string) {
  return getDb().select().from(learningJourneys).where(eq(learningJourneys.creatorId, userId)).orderBy(desc(learningJourneys.createdAt)).all();
}

export function projectJourneys(projectId: string, viewer: Viewer) {
  const access = getProjectAccess(projectId, viewer);
  const db = getDb();
  const rows = db
    .select({ journey: learningJourneys, creatorName: users.displayName })
    .from(learningJourneys)
    .innerJoin(users, eq(users.id, learningJourneys.creatorId))
    .where(eq(learningJourneys.projectId, projectId))
    .orderBy(desc(learningJourneys.createdAt))
    .all();
  return rows.filter((row) => row.journey.visibility === "public" || access?.isMember);
}

/* --------------------------------- resources ------------------------------- */

function uniqueResourceSlug(title: string): string {
  const db = getDb();
  const base = slugify(title) || "resource";
  let candidate = base;
  let counter = 2;
  while (db.select({ id: learningResources.id }).from(learningResources).where(eq(learningResources.slug, candidate)).get()) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

export type CurriculumInput = {
  modules: { title: string; lessons: { title: string; body?: string; isFreePreview?: boolean; durationMinutes?: number; exercise?: string }[] }[];
};

export type ResourceInput = {
  title: string;
  summary?: string;
  body?: string;
  previewBody?: string;
  topic?: string;
  level: ResourceLevel;
  format: ResourceFormat;
  durationMinutes?: number;
  priceCents: number;
  currency?: string;
  projectId?: string | null;
  taskId?: string | null;
  journeyId?: string | null;
  storyboardId?: string | null;
  transcript?: string;
  captions?: string;
  coverImageId?: string | null;
  curriculum?: CurriculumInput;
  publish: boolean;
};

export function createResource(creatorId: string, input: ResourceInput): { id: string; slug: string } {
  const db = getDb();
  if (input.title.trim().length < 4) throw new AppError("Give the resource a clear title.");
  if (input.priceCents > 0 && !input.previewBody?.trim()) {
    throw new AppError("Paid resources need a free preview so learners can judge the material.");
  }
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: creatorId });
    if (!access?.isMember) throw new ForbiddenError("You must be on the project team to publish material from it.");
    if (input.publish && !access.project.allowPublicDocs && access.project.ownerId !== creatorId) {
      throw new ForbiddenError("This project has not enabled public documentation.");
    }
  }

  const id = randomUUID();
  const slug = uniqueResourceSlug(input.title);
  transaction((tx) => {
    tx.insert(learningResources)
      .values({
        id,
        creatorId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        journeyId: input.journeyId ?? null,
        storyboardId: input.storyboardId ?? null,
        title: input.title.trim().slice(0, 160),
        slug,
        summary: input.summary?.slice(0, 600) ?? null,
        body: input.body?.slice(0, 20000) ?? null,
        previewBody: input.previewBody?.slice(0, 4000) ?? null,
        topic: input.topic?.slice(0, 60) ?? null,
        level: input.level,
        format: input.format,
        durationMinutes: input.durationMinutes ?? null,
        priceCents: Math.max(0, Math.min(input.priceCents, 500_000)),
        currency: input.currency ?? "GBP",
        transcript: input.transcript?.slice(0, 40000) ?? null,
        captions: input.captions?.slice(0, 40000) ?? null,
        coverImageId: input.coverImageId ?? null,
        status: input.publish ? "published" : "draft",
        publishedAt: input.publish ? new Date().toISOString() : null,
      })
      .run();

    if (input.curriculum && input.curriculum.modules.length > 0) {
      const courseId = randomUUID();
      tx.insert(courses)
        .values({ id: courseId, resourceId: id, title: input.title, description: input.summary ?? null })
        .run();
      input.curriculum.modules.forEach((module, moduleIndex) => {
        const moduleId = randomUUID();
        tx.insert(courseModules).values({ id: moduleId, courseId, title: module.title.slice(0, 160), orderIndex: moduleIndex }).run();
        module.lessons.forEach((lesson, lessonIndex) => {
          const lessonId = randomUUID();
          tx.insert(lessons)
            .values({
              id: lessonId,
              moduleId,
              title: lesson.title.slice(0, 160),
              body: lesson.body?.slice(0, 12000) ?? null,
              orderIndex: lessonIndex,
              isFreePreview: !!lesson.isFreePreview,
              durationMinutes: lesson.durationMinutes ?? null,
            })
            .run();
          if (lesson.exercise) {
            tx.insert(exercises).values({ lessonId, title: "Practice", instructions: lesson.exercise.slice(0, 4000) }).run();
          }
        });
      });
    }
  });

  if (input.publish) {
    awardReputation({
      userId: creatorId,
      dimension: "teaching",
      points: REPUTATION_WEIGHTS.teaching.resource_published,
      reason: `Learning resource published: ${input.title}`,
      sourceType: "resource",
      sourceId: id,
    });
    // Teaching belongs in the feed too, but as a pointer to the resource rather than
    // a second copy of its content.
    createPost(creatorId, {
      body: `${input.title}${input.summary ? `\n\n${input.summary}` : ""}`.slice(0, 2000),
      kind: "lesson",
      resourceId: id,
      projectId: input.projectId ?? null,
      publish: true,
    });
  }
  return { id, slug };
}

export type ResourceFilters = {
  q?: string;
  format?: string;
  level?: string;
  topic?: string;
  price?: "free" | "paid";
  creator?: string;
  limit?: number;
};

export function listResources(filters: ResourceFilters = {}) {
  const db = getDb();
  const conditions = [eq(learningResources.status, "published")];
  if (filters.q?.trim()) conditions.push(forSearch(filters.q));
  if (filters.format) conditions.push(eq(learningResources.format, filters.format as ResourceFormat));
  if (filters.level) conditions.push(eq(learningResources.level, filters.level as ResourceLevel));
  if (filters.topic) conditions.push(eq(learningResources.topic, filters.topic));
  if (filters.price === "free") conditions.push(eq(learningResources.priceCents, 0));
  if (filters.price === "paid") conditions.push(sql`${learningResources.priceCents} > 0`);
  if (filters.creator) {
    const creator = db.select({ id: users.id }).from(users).where(eq(users.username, filters.creator)).get();
    if (!creator) return [];
    conditions.push(eq(learningResources.creatorId, creator.id));
  }

  return db
    .select({
      resource: learningResources,
      creatorName: users.displayName,
      creatorUsername: users.username,
    })
    .from(learningResources)
    .innerJoin(users, eq(users.id, learningResources.creatorId))
    .where(and(...conditions))
    .orderBy(desc(learningResources.publishedAt))
    .limit(filters.limit ?? 24)
    .all()
    .map((row) => ({ ...row.resource, creatorName: row.creatorName, creatorUsername: row.creatorUsername }));
}

function forSearch(query: string) {
  const term = `%${query.trim()}%`;
  return or(like(learningResources.title, term), like(learningResources.summary, term), like(learningResources.topic, term))!;
}

/** Full detail with server-side entitlement gating. */
export function resourceDetail(resourceId: string, viewer: Viewer) {
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) return null;
  const creator = db.select().from(users).where(eq(users.id, resource.creatorId)).get();
  const isOwner = viewer?.id === resource.creatorId;
  const isStaff = !!viewer?.isAdmin;
  if (resource.status !== "published" && !isOwner && !isStaff) return null;

  const entitled = !!viewer && (hasEntitlement(viewer.id, resourceId) || isStaff);
  const premium = resource.priceCents > 0;

  const course = db.select().from(courses).where(eq(courses.resourceId, resourceId)).get();
  const modules = course
    ? db
        .select({ module: courseModules, lessonRows: lessons })
        .from(courseModules)
        .leftJoin(lessons, eq(lessons.moduleId, courseModules.id))
        .where(eq(courseModules.courseId, course.id))
        .orderBy(asc(courseModules.orderIndex), asc(lessons.orderIndex))
        .all()
    : [];

  const curriculum = new Map<string, { id: string; title: string; orderIndex: number; lessons: (typeof lessons.$inferSelect)[] }>();
  for (const row of modules) {
    const entry = curriculum.get(row.module.id) ?? {
      id: row.module.id,
      title: row.module.title,
      orderIndex: row.module.orderIndex,
      lessons: [],
    };
    if (row.lessonRows) entry.lessons.push(row.lessonRows);
    curriculum.set(row.module.id, entry);
  }

  const exerciseRows = db
    .select({ exercise: exercises, lessonId: lessons.id })
    .from(exercises)
    .innerJoin(lessons, eq(lessons.id, exercises.lessonId))
    .all()
    .filter((row) => [...curriculum.values()].some((module) => module.lessons.some((lesson) => lesson.id === row.lessonId)));

  const feedback = db
    .select({
      id: learnerFeedback.id,
      rating: learnerFeedback.rating,
      body: learnerFeedback.body,
      createdAt: learnerFeedback.createdAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(learnerFeedback)
    .innerJoin(users, eq(users.id, learnerFeedback.userId))
    .where(and(eq(learnerFeedback.resourceId, resourceId), eq(learnerFeedback.status, "visible")))
    .orderBy(desc(learnerFeedback.createdAt))
    .all();

  const progressRows = viewer
    ? db.select().from(learningProgress).where(and(eq(learningProgress.userId, viewer.id), eq(learningProgress.resourceId, resourceId))).all()
    : [];

  const journey = resource.journeyId
    ? db.select().from(learningJourneys).where(eq(learningJourneys.id, resource.journeyId)).get()
    : null;

  return {
    resource,
    creator: creator ?? null,
    entitled,
    premium,
    // Paid body content is withheld server-side, not just hidden in the UI.
    body: premium && !entitled ? null : resource.body,
    previewBody: resource.previewBody,
    transcript: premium && !entitled ? null : resource.transcript,
    captions: resource.captions,
    curriculum: [...curriculum.values()].map((module) => ({
      ...module,
      lessons: module.lessons
        .filter((lesson) => !premium || entitled || lesson.isFreePreview)
        .map((lesson) => ({
          ...lesson,
          body: !premium || entitled || lesson.isFreePreview ? lesson.body : null,
        })),
    })),
    exercises: premium && !entitled ? [] : exerciseRows.map((row) => row.exercise),
    feedback,
    averageRating: feedback.length ? feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length : 0,
    progress: progressRows,
    journey: journey ?? null,
    isOwner,
  };
}

export function recordProgress(userId: string, resourceId: string, lessonId: string | null, completed: boolean): void {
  const db = getDb();
  const existing = db
    .select()
    .from(learningProgress)
    .where(
      and(
        eq(learningProgress.userId, userId),
        eq(learningProgress.resourceId, resourceId),
        lessonId ? eq(learningProgress.lessonId, lessonId) : isNull(learningProgress.lessonId),
      ),
    )
    .get();

  const totalLessons = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(eq(courses.resourceId, resourceId))
    .get();

  const doneCount = db
    .select({ count: sql<number>`count(*)` })
    .from(learningProgress)
    .where(and(eq(learningProgress.userId, userId), eq(learningProgress.resourceId, resourceId), eq(learningProgress.completed, true)))
    .get();

  const pct = totalLessons && Number(totalLessons.count) > 0 ? Math.round((Number(doneCount?.count ?? 0) / Number(totalLessons.count)) * 100) : completed ? 100 : 0;

  if (existing) {
    db.update(learningProgress)
      .set({ completed, progressPct: pct, updatedAt: new Date().toISOString() })
      .where(eq(learningProgress.id, existing.id))
      .run();
    return;
  }
  db.insert(learningProgress)
    .values({ userId, resourceId, lessonId: lessonId ?? null, completed, progressPct: pct })
    .run();
}

export function addFeedback(userId: string, resourceId: string, rating: number, body?: string): void {
  if (rating < 1 || rating > 5) throw new AppError("Choose a rating between 1 and 5.");
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) throw new NotFoundError("Resource not found.");
  if (resource.creatorId === userId) throw new AppError("You cannot rate your own resource.");
  if (resource.priceCents > 0 && !hasEntitlement(userId, resourceId)) {
    throw new ForbiddenError("Only learners with access can rate this resource.");
  }
  db.insert(learnerFeedback)
    .values({ userId, resourceId, rating, body: body?.slice(0, 2000) ?? null })
    .onConflictDoUpdate({
      target: [learnerFeedback.userId, learnerFeedback.resourceId],
      set: { rating, body: body?.slice(0, 2000) ?? null },
    })
    .run();
  if (rating >= 4) {
    awardReputation({
      userId: resource.creatorId,
      dimension: "teaching",
      points: REPUTATION_WEIGHTS.teaching.learner_feedback_positive,
      reason: `Positive learner feedback on ${resource.title}`,
      sourceType: "feedback",
      sourceId: `${userId}:${resourceId}`,
    });
  }
  notify({
    userId: resource.creatorId,
    actorId: userId,
    kind: "learning_feedback",
    title: `New ${rating}-star feedback on ${resource.title}`,
    href: `/learn/${resourceId}`,
  });
}

export function resourcesForCreator(creatorId: string) {
  return getDb()
    .select()
    .from(learningResources)
    .where(eq(learningResources.creatorId, creatorId))
    .orderBy(desc(learningResources.updatedAt))
    .all();
}

export function resourcesForProject(projectId: string, viewer: Viewer) {
  const access = getProjectAccess(projectId, viewer);
  const db = getDb();
  const rows = db
    .select({ resource: learningResources, creatorName: users.displayName })
    .from(learningResources)
    .innerJoin(users, eq(users.id, learningResources.creatorId))
    .where(eq(learningResources.projectId, projectId))
    .all();
  return rows.filter((row) => row.resource.status === "published" || access?.isMember);
}

export function learningTopics(): { topic: string; count: number }[] {
  return getDb()
    .select({ topic: learningResources.topic, count: sql<number>`count(*)` })
    .from(learningResources)
    .where(and(eq(learningResources.status, "published")))
    .groupBy(learningResources.topic)
    .all()
    .filter((row) => !!row.topic)
    .map((row) => ({ topic: row.topic!, count: Number(row.count) }));
}

export function myLearning(userId: string) {
  const db = getDb();
  const progress = db
    .select({ progress: learningProgress, resource: learningResources })
    .from(learningProgress)
    .innerJoin(learningResources, eq(learningResources.id, learningProgress.resourceId))
    .where(eq(learningProgress.userId, userId))
    .orderBy(desc(learningProgress.updatedAt))
    .all();
  const grouped = new Map<string, { resource: typeof learningResources.$inferSelect; pct: number; updatedAt: string }>();
  for (const row of progress) {
    const current = grouped.get(row.resource.id);
    if (!current || row.progress.updatedAt > current.updatedAt) {
      grouped.set(row.resource.id, { resource: row.resource, pct: row.progress.progressPct, updatedAt: row.progress.updatedAt });
    }
  }
  const purchased = db
    .select({ resource: learningResources })
    .from(learningResources)
    .where(and(eq(learningResources.status, "published"), sql`${learningResources.priceCents} > 0`))
    .all()
    .filter((row) => hasEntitlement(userId, row.resource.id));
  return { inProgress: [...grouped.values()], purchased: purchased.map((row) => row.resource) };
}
