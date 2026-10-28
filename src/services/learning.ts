import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  courseCollaborators,
  courseEnrollments,
  courseModules,
  courses,
  exercises,
  follows,
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
import { safeUrl } from "@/lib/form";
import { notify, notifyMany } from "@/lib/notify";
import { awardReputation, REPUTATION_WEIGHTS } from "@/lib/reputation";
import { createPost } from "@/services/social";
import { COURSE_CATEGORIES } from "@/lib/types";
import type {
  CourseCategory,
  CourseVisibility,
  EnrollmentStatus,
  ResourceFormat,
  ResourceLevel,
} from "@/lib/types";

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
    // The same rule `addJourneyStep` enforces when the step is written: a step may
    // cite public documentation, or the creator's own entries — never somebody
    // else's team-only notes, even when the drafter is the project owner.
    if (entry.visibility !== "public" && entry.authorId !== userId) {
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

  // Followers opted into teaching updates; the category can be switched off in
  // Settings. Deduplication means re-publishing the same journey is silent.
  const followers = db
    .select({ userId: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, journey.creatorId))
    .all()
    .map((row) => row.userId);
  notifyMany(followers, {
    actorId: userId,
    kind: "teaching_published",
    title: `New teaching: ${journey.title}`,
    href: `/learn/journeys/${journeyId}`,
    dedupeKey: `teaching_published:journey:${journeyId}`,
    entityType: "journey",
    entityId: journeyId,
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
    href: `/learn/journeys/${journeyId}`,
    dedupeKey: `journey_approved:${journeyId}`,
    entityType: "journey",
    entityId: journeyId,
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
  /** Learning objectives / key takeaways, one per entry. */
  outcomes?: string[];
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
        outcomes: (input.outcomes ?? []).map((entry) => entry.trim().slice(0, 200)).filter(Boolean).slice(0, 10),
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

    // People who follow this creator asked to hear about new material. The
    // preference is user-controllable and the row is deduplicated by resource.
    const followers = db
      .select({ userId: follows.followerId })
      .from(follows)
      .where(eq(follows.followeeId, creatorId))
      .all()
      .map((row) => row.userId);
    notifyMany(followers, {
      actorId: creatorId,
      kind: "teaching_published",
      title: `New teaching: ${input.title.trim()} (${String(input.level).replace(/_/g, " ")})`,
      href: `/learn/${id}`,
      dedupeKey: `teaching_published:resource:${id}`,
      entityType: "resource",
      entityId: id,
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

  // Link-only and private courses never appear in discovery. A left join keeps
  // ordinary resources (which have no course row) visible.
  conditions.push(or(isNull(courses.visibility), eq(courses.visibility, "public"))!);

  return db
    .select({
      resource: learningResources,
      creatorName: users.displayName,
      creatorUsername: users.username,
    })
    .from(learningResources)
    .innerJoin(users, eq(users.id, learningResources.creatorId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
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

/** Full detail with server-side entitlement and visibility gating. */
export function resourceDetail(resourceId: string, viewer: Viewer) {
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) return null;
  const creator = db.select().from(users).where(eq(users.id, resource.creatorId)).get();
  const isOwner = viewer?.id === resource.creatorId;
  const isStaff = !!viewer?.isAdmin;
  const course = db.select().from(courses).where(eq(courses.resourceId, resourceId)).get();
  const isCollaborator = !!course && !!viewer && !!db
    .select({ id: courseCollaborators.id })
    .from(courseCollaborators)
    .where(and(eq(courseCollaborators.resourceId, resourceId), eq(courseCollaborators.userId, viewer.id)))
    .get();
  const canEdit = isOwner || isCollaborator;

  // Private courses are invisible to everyone except their editors, including
  // when published. Link-only courses are reachable by shareable URL but never
  // listed.
  if (course?.visibility === "private" && !canEdit) return null;
  if (resource.status !== "published" && !canEdit && !isStaff) return null;

  const entitled = !!viewer && (hasEntitlement(viewer.id, resourceId) || isStaff || canEdit);
  const premium = resource.priceCents > 0;
  const enrollment = viewer && course
    ? db
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.resourceId, resourceId), eq(courseEnrollments.userId, viewer.id)))
        .get() ?? null
    : null;
  const progressSummary = course ? courseProgressFor(viewer?.id ?? null, resourceId) : null;
  const modules = course
    ? db
        .select({ module: courseModules, lessonRows: lessons })
        .from(courseModules)
        .leftJoin(lessons, eq(lessons.moduleId, courseModules.id))
        .where(eq(courseModules.courseId, course.id))
        .orderBy(asc(courseModules.orderIndex), asc(lessons.orderIndex))
        .all()
    : [];

  const curriculum = new Map<
    string,
    { id: string; title: string; description: string | null; orderIndex: number; lessons: (typeof lessons.$inferSelect)[] }
  >();
  for (const row of modules) {
    const entry = curriculum.get(row.module.id) ?? {
      id: row.module.id,
      title: row.module.title,
      description: row.module.description,
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
    canEdit,
    collaborators: course
      ? db
          .select({ userId: courseCollaborators.userId, displayName: users.displayName, username: users.username })
          .from(courseCollaborators)
          .innerJoin(users, eq(users.id, courseCollaborators.userId))
          .where(eq(courseCollaborators.resourceId, resourceId))
          .all()
      : [],
    course: course ?? null,
    enrollment,
    courseProgress: progressSummary,
    progressPct: progressSummary?.pct ?? (progressRows.some((row) => row.completed && !row.lessonId) ? 100 : 0),
    completedLessonIds: progressSummary?.completedLessonIds ?? [],
    nextLessonId: progressSummary?.nextLessonId ?? null,
    canEnrol:
      !!course &&
      resource.status === "published" &&
      (resource.priceCents === 0 || entitled || isOwner) &&
      (course.visibility !== "private" || canEdit),
  };
}

export type CourseProgress = {
  totalLessons: number;
  completedLessons: number;
  pct: number;
  completedLessonIds: string[];
  nextLessonId: string | null;
};

/** Persisted progress for one learner on one course. Never guesses completion. */
export function courseProgressFor(userId: string | null, resourceId: string): CourseProgress {
  const db = getDb();
  const orderedLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(eq(courses.resourceId, resourceId))
    .orderBy(asc(courseModules.orderIndex), asc(lessons.orderIndex))
    .all();
  const lessonIds = orderedLessons.map((row) => row.id);
  const completedIds = userId && lessonIds.length > 0
    ? db
        .select({ lessonId: learningProgress.lessonId })
        .from(learningProgress)
        .where(
          and(
            eq(learningProgress.userId, userId),
            eq(learningProgress.resourceId, resourceId),
            eq(learningProgress.completed, true),
            inArray(learningProgress.lessonId, lessonIds),
          ),
        )
        .all()
        .map((row) => row.lessonId)
        .filter((id): id is string => !!id)
    : [];
  const completed = new Set(completedIds);
  const total = lessonIds.length;
  return {
    totalLessons: total,
    completedLessons: completed.size,
    pct: total > 0 ? Math.round((completed.size / total) * 100) : 0,
    completedLessonIds: [...completed],
    nextLessonId: lessonIds.find((id) => !completed.has(id)) ?? null,
  };
}

/**
 * Record one explicit completion event.
 *
 * Course progress counts only real lesson rows, so a resource-level
 * "I learned this" reflection can never inflate a course to 100%. Paid and
 * private courses are checked here as well as in the page, because a server
 * action is reachable without going through the page.
 */
export function recordProgress(userId: string, resourceId: string, lessonId: string | null, completed: boolean): void {
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) throw new NotFoundError("Resource not found.");
  const course = db.select().from(courses).where(eq(courses.resourceId, resourceId)).get();

  if (lessonId) {
    const belongs = db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, courseModules.courseId))
      .where(and(eq(lessons.id, lessonId), eq(courses.resourceId, resourceId)))
      .get();
    if (!belongs) throw new AppError("That lesson does not belong to this course.");
  }

  if (course) {
    const isOwner = resource.creatorId === userId;
    const isCollaborator = !!db
      .select({ id: courseCollaborators.id })
      .from(courseCollaborators)
      .where(and(eq(courseCollaborators.resourceId, resourceId), eq(courseCollaborators.userId, userId)))
      .get();
    const canEdit = isOwner || isCollaborator;
    if (course.visibility === "private" && !canEdit) throw new ForbiddenError("This course is private.");
    if (resource.status !== "published" && !canEdit) throw new ForbiddenError("This course is not published.");
    if (resource.priceCents > 0 && !canEdit && !hasEntitlement(userId, resourceId)) {
      throw new ForbiddenError("You need access to this course before recording progress.");
    }
  }

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

  const now = new Date().toISOString();
  const progressId = existing?.id ?? randomUUID();
  transaction((tx) => {
    if (existing) {
      tx.update(learningProgress)
        .set({ completed, progressPct: course ? 0 : completed ? 100 : 0, updatedAt: now })
        .where(eq(learningProgress.id, existing.id))
        .run();
    } else {
      tx.insert(learningProgress)
        .values({
          id: progressId,
          userId,
          resourceId,
          lessonId: lessonId ?? null,
          completed,
          progressPct: course ? 0 : completed ? 100 : 0,
        })
        .run();
    }

    if (course) {
      // Compute after the completion row is written so the last lesson turns the
      // course to 100%, not 50% of the previous state.
      const summary = courseProgressFor(userId, resourceId);
      tx.update(learningProgress)
        .set({ progressPct: summary.pct, updatedAt: now })
        .where(eq(learningProgress.id, progressId))
        .run();

      // Starting a lesson is enough to enrol, but the enrolment is still one row.
      const enrollment = tx
        .select()
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.resourceId, resourceId), eq(courseEnrollments.userId, userId)))
        .get();
      const completedNow = summary.totalLessons > 0 && summary.pct === 100;
      if (enrollment) {
        tx.update(courseEnrollments)
          .set({
            status: (completedNow ? "completed" : "active") satisfies EnrollmentStatus,
            lastAccessedAt: now,
            completedAt: completedNow ? (enrollment.completedAt ?? now) : null,
          })
          .where(eq(courseEnrollments.id, enrollment.id))
          .run();
      } else {
        tx.insert(courseEnrollments)
          .values({
            resourceId,
            userId,
            status: completedNow ? "completed" : "active",
            lastAccessedAt: now,
            completedAt: completedNow ? now : null,
          })
          .run();
      }
    }
  });
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
    dedupeKey: `feedback:${userId}:${resourceId}`,
    entityType: "resource",
    entityId: resourceId,
  });
}

export function resourcesForCreator(creatorId: string) {
  return getDb()
    .select({ resource: learningResources, course: courses })
    .from(learningResources)
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(eq(learningResources.creatorId, creatorId))
    .orderBy(desc(learningResources.updatedAt))
    .all()
    .map((row) => ({ ...row.resource, courseVisibility: row.course?.visibility ?? "public" }));
}

export function resourcesForProject(projectId: string, viewer: Viewer) {
  const access = getProjectAccess(projectId, viewer);
  const db = getDb();
  const rows = db
    .select({ resource: learningResources, creatorName: users.displayName, course: courses })
    .from(learningResources)
    .innerJoin(users, eq(users.id, learningResources.creatorId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(eq(learningResources.projectId, projectId))
    .all();
  return rows.filter(
    (row) =>
      (row.resource.status === "published" && (!row.course || row.course.visibility === "public")) || access?.isMember,
  );
}

export function learningTopics(): { topic: string; count: number }[] {
  return getDb()
    .select({ topic: learningResources.topic, count: sql<number>`count(*)` })
    .from(learningResources)
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(and(eq(learningResources.status, "published"), or(isNull(courses.visibility), eq(courses.visibility, "public"))))
    .groupBy(learningResources.topic)
    .all()
    .filter((row) => !!row.topic)
    .map((row) => ({ topic: row.topic!, count: Number(row.count) }));
}

export function myLearning(userId: string) {
  const db = getDb();
  const grouped = new Map<string, { resource: typeof learningResources.$inferSelect; pct: number; updatedAt: string }>();

  const enrolled = db
    .select({ enrollment: courseEnrollments, resource: learningResources, course: courses })
    .from(courseEnrollments)
    .innerJoin(learningResources, eq(learningResources.id, courseEnrollments.resourceId))
    .leftJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(eq(courseEnrollments.userId, userId))
    .all();
  for (const row of enrolled) {
    if (row.resource.status !== "published" && row.resource.creatorId !== userId) continue;
    const pct = row.course ? courseProgressFor(userId, row.resource.id).pct : 0;
    const updatedAt = row.enrollment.lastAccessedAt ?? row.enrollment.enrolledAt;
    grouped.set(row.resource.id, { resource: row.resource, pct, updatedAt });
  }

  const progress = db
    .select({ progress: learningProgress, resource: learningResources })
    .from(learningProgress)
    .innerJoin(learningResources, eq(learningResources.id, learningProgress.resourceId))
    .where(eq(learningProgress.userId, userId))
    .orderBy(desc(learningProgress.updatedAt))
    .all();
  for (const row of progress) {
    if (row.resource.status !== "published" && row.resource.creatorId !== userId) continue;
    const current = grouped.get(row.resource.id);
    if (!current || row.progress.updatedAt > current.updatedAt) {
      const course = db.select().from(courses).where(eq(courses.resourceId, row.resource.id)).get();
      grouped.set(row.resource.id, {
        resource: row.resource,
        pct: course ? courseProgressFor(userId, row.resource.id).pct : row.progress.progressPct,
        updatedAt: row.progress.updatedAt,
      });
    }
  }

  const purchased = db
    .select({ resource: learningResources })
    .from(learningResources)
    .where(and(eq(learningResources.status, "published"), sql`${learningResources.priceCents} > 0`))
    .all()
    .filter((row) => hasEntitlement(userId, row.resource.id));

  const all = [...grouped.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    inProgress: all,
    completed: all.filter((row) => row.pct >= 100),
    purchased: purchased.map((row) => row.resource),
  };
}

/* ------------------------------- courses ---------------------------------- */

export type CourseDetailsInput = {
  title: string;
  summary?: string | null;
  body?: string | null;
  category?: string | null;
  skills?: string[];
  outcomes?: string[];
  audience?: string | null;
  level?: ResourceLevel;
  visibility?: CourseVisibility;
  previewVideoUrl?: string | null;
  attribution?: string | null;
  estimatedMinutes?: number | null;
  projectId?: string | null;
  coverImageId?: string | null;
};

export type CourseModuleInput = { title: string; description?: string | null };

export type LessonInput = {
  title: string;
  body?: string | null;
  summary?: string | null;
  isFreePreview?: boolean;
  durationMinutes?: number | null;
  mediaId?: string | null;
  videoUrl?: string | null;
  externalUrl?: string | null;
  externalLabel?: string | null;
  externalAuthor?: string | null;
  projectId?: string | null;
  exerciseTitle?: string | null;
  exerciseInstructions?: string | null;
  exerciseHint?: string | null;
};

function cleanList(values: string[] | undefined, max: number, maxLength: number): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, max)
    .map((value) => value.slice(0, maxLength));
}

function cleanCourseCategory(value: string | null | undefined): CourseCategory | null {
  return value && (COURSE_CATEGORIES as readonly string[]).includes(value) ? (value as CourseCategory) : null;
}

function cleanVisibility(value: string | null | undefined): CourseVisibility {
  return value === "private" || value === "invite_only" ? value : "public";
}

function courseState(resourceId: string, viewer: Viewer) {
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) throw new NotFoundError("Course not found.");
  const course = db.select().from(courses).where(eq(courses.resourceId, resourceId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  const isOwner = !!viewer && resource.creatorId === viewer.id;
  const isCollaborator = !!viewer && !!db
    .select({ id: courseCollaborators.id })
    .from(courseCollaborators)
    .where(and(eq(courseCollaborators.resourceId, resourceId), eq(courseCollaborators.userId, viewer.id)))
    .get();
  return { resource, course, isOwner, isCollaborator, canEdit: isOwner || isCollaborator };
}

function requireCourseEditable(resourceId: string, userId: string) {
  const state = courseState(resourceId, { id: userId });
  if (!state.canEdit) throw new ForbiddenError("Only this course's creator or co-editors can change it.");
  return state;
}

function requireCourseOwner(resourceId: string, userId: string) {
  const state = courseState(resourceId, { id: userId });
  if (!state.isOwner) throw new ForbiddenError("Only the course creator can publish or archive it.");
  return state;
}

export function createCourse(
  creatorId: string,
  input: CourseDetailsInput & { level?: ResourceLevel },
): { id: string; slug: string } {
  const db = getDb();
  const title = input.title.trim();
  if (title.length < 4) throw new AppError("Give the course a clear title.");
  const previewVideoUrl = input.previewVideoUrl?.trim() ? safeUrl(input.previewVideoUrl) : null;
  if (input.previewVideoUrl?.trim() && !previewVideoUrl) {
    throw new AppError("The preview video must be an http(s) link.");
  }
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: creatorId });
    if (!access?.canView) throw new ForbiddenError("You cannot link a project you cannot see.");
  }

  const id = randomUUID();
  const slug = uniqueResourceSlug(title);
  const category = cleanCourseCategory(input.category);
  const now = new Date().toISOString();
  transaction((tx) => {
    tx.insert(learningResources)
      .values({
        id,
        creatorId,
        projectId: input.projectId ?? null,
        title,
        slug,
        summary: input.summary?.trim().slice(0, 600) ?? null,
        body: input.body?.slice(0, 20000) ?? null,
        topic: category,
        level: input.level ?? "beginner",
        format: "course",
        durationMinutes: input.estimatedMinutes ?? null,
        priceCents: 0,
        status: "draft",
        coverImageId: input.coverImageId ?? null,
      })
      .run();
    tx.insert(courses)
      .values({
        id: randomUUID(),
        resourceId: id,
        title,
        description: input.summary?.trim().slice(0, 600) ?? null,
        category,
        skills: cleanList(input.skills, 12, 60),
        outcomes: cleanList(input.outcomes, 10, 240),
        audience: input.audience?.trim().slice(0, 400) ?? null,
        visibility: cleanVisibility(input.visibility),
        previewVideoUrl: previewVideoUrl ?? null,
        attribution: input.attribution?.trim().slice(0, 600) ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        updatedAt: now,
      })
      .run();
  });
  return { id, slug };
}

export function updateCourse(resourceId: string, editorId: string, input: Partial<CourseDetailsInput>): void {
  const state = requireCourseEditable(resourceId, editorId);
  const db = getDb();
  const title = input.title === undefined ? state.resource.title : input.title.trim();
  if (title.length < 4) throw new AppError("Give the course a clear title.");
  const previewVideoUrl =
    input.previewVideoUrl === undefined
      ? state.course.previewVideoUrl
      : input.previewVideoUrl && input.previewVideoUrl.trim()
        ? safeUrl(input.previewVideoUrl)
        : null;
  if (input.previewVideoUrl?.trim() && !previewVideoUrl) {
    throw new AppError("The preview video must be an http(s) link.");
  }
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: editorId });
    if (!access?.canView) throw new ForbiddenError("You cannot link a project you cannot see.");
  }
  const category =
    input.category === undefined ? state.course.category : cleanCourseCategory(input.category);
  const now = new Date().toISOString();

  transaction((tx) => {
    tx.update(learningResources)
      .set({
        title,
        summary: input.summary === undefined ? state.resource.summary : input.summary?.trim().slice(0, 600) ?? null,
        body: input.body === undefined ? state.resource.body : input.body?.slice(0, 20000) ?? null,
        topic: category,
        level: input.level ?? state.resource.level,
        durationMinutes:
          input.estimatedMinutes === undefined ? state.resource.durationMinutes : input.estimatedMinutes ?? null,
        projectId: input.projectId === undefined ? state.resource.projectId : input.projectId,
        coverImageId: input.coverImageId === undefined ? state.resource.coverImageId : input.coverImageId,
      })
      .where(eq(learningResources.id, resourceId))
      .run();
    tx.update(courses)
      .set({
        title,
        description:
          input.summary === undefined ? state.course.description : input.summary?.trim().slice(0, 600) ?? null,
        category,
        skills: input.skills === undefined ? (state.course.skills ?? []) : cleanList(input.skills, 12, 60),
        outcomes: input.outcomes === undefined ? (state.course.outcomes ?? []) : cleanList(input.outcomes, 10, 240),
        audience: input.audience === undefined ? state.course.audience : input.audience?.trim().slice(0, 400) ?? null,
        visibility: input.visibility === undefined ? state.course.visibility : cleanVisibility(input.visibility),
        previewVideoUrl,
        attribution:
          input.attribution === undefined ? state.course.attribution : input.attribution?.trim().slice(0, 600) ?? null,
        estimatedMinutes:
          input.estimatedMinutes === undefined ? state.course.estimatedMinutes : input.estimatedMinutes ?? null,
        updatedAt: now,
      })
      .where(eq(courses.id, state.course.id))
      .run();
  });
}

export function setCourseStatus(
  resourceId: string,
  userId: string,
  status: "published" | "unpublished" | "archived",
): void {
  const state = requireCourseOwner(resourceId, userId);
  const db = getDb();
  if (status === "published") {
    const lessonCount = db
      .select({ count: sql<number>`count(*)` })
      .from(lessons)
      .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, courseModules.courseId))
      .where(eq(courses.resourceId, resourceId))
      .get();
    if (Number(lessonCount?.count ?? 0) === 0) {
      throw new AppError("Add at least one module and one lesson before publishing a course.");
    }
  }
  const now = new Date().toISOString();
  const firstPublish = status === "published" && !state.resource.publishedAt;
  transaction((tx) => {
    tx.update(learningResources)
      .set({
        status,
        publishedAt: status === "published" ? state.resource.publishedAt ?? now : state.resource.publishedAt,
      })
      .where(eq(learningResources.id, resourceId))
      .run();
    tx.update(courses).set({ updatedAt: now }).where(eq(courses.id, state.course.id)).run();
  });

  if (!firstPublish) return;
  awardReputation({
    userId,
    dimension: "teaching",
    points: REPUTATION_WEIGHTS.teaching.resource_published,
    reason: `Course published: ${state.resource.title}`,
    sourceType: "resource",
    sourceId: resourceId,
  });
  createPost(userId, {
    body: `${state.resource.title}${state.resource.summary ? `\n\n${state.resource.summary}` : ""}`.slice(0, 2000),
    kind: "lesson",
    resourceId,
    projectId: state.resource.projectId,
    publish: true,
  });
  const followers = db
    .select({ userId: follows.followerId })
    .from(follows)
    .where(eq(follows.followeeId, userId))
    .all()
    .map((row) => row.userId);
  notifyMany(followers, {
    actorId: userId,
    kind: "teaching_published",
    title: `New course: ${state.resource.title}`,
    href: `/learn/${resourceId}`,
    dedupeKey: `teaching_published:resource:${resourceId}`,
    entityType: "resource",
    entityId: resourceId,
  });
}

export function courseEditorData(resourceId: string, viewer: Viewer) {
  const detail = resourceDetail(resourceId, viewer);
  if (!detail || !detail.course || !detail.canEdit) return null;
  return { ...detail, stats: courseStats(resourceId) };
}

export function addCourseModule(resourceId: string, editorId: string, input: CourseModuleInput): string {
  requireCourseEditable(resourceId, editorId);
  const db = getDb();
  const course = db.select().from(courses).where(eq(courses.resourceId, resourceId)).get()!;
  const title = input.title.trim();
  if (!title) throw new AppError("Give the module a title.");
  const count = db.select({ count: sql<number>`count(*)` }).from(courseModules).where(eq(courseModules.courseId, course.id)).get();
  if (Number(count?.count ?? 0) >= 30) throw new AppError("A course can have at most 30 modules.");
  const max = db
    .select({ value: sql<number>`coalesce(max(${courseModules.orderIndex}), -1)` })
    .from(courseModules)
    .where(eq(courseModules.courseId, course.id))
    .get();
  const id = randomUUID();
  db.insert(courseModules)
    .values({
      id,
      courseId: course.id,
      title: title.slice(0, 160),
      description: input.description?.trim().slice(0, 600) ?? null,
      orderIndex: Number(max?.value ?? -1) + 1,
    })
    .run();
  db.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  return id;
}

export function updateCourseModule(
  moduleId: string,
  editorId: string,
  input: Partial<CourseModuleInput>,
): void {
  const db = getDb();
  const module = db.select().from(courseModules).where(eq(courseModules.id, moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);
  const title = input.title === undefined ? module.title : input.title.trim();
  if (!title) throw new AppError("Give the module a title.");
  db.update(courseModules)
    .set({
      title: title.slice(0, 160),
      description: input.description === undefined ? module.description : input.description?.trim().slice(0, 600) ?? null,
    })
    .where(eq(courseModules.id, moduleId))
    .run();
  db.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
}

export function removeCourseModule(moduleId: string, editorId: string): void {
  const db = getDb();
  const module = db.select().from(courseModules).where(eq(courseModules.id, moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);
  transaction((tx) => {
    tx.delete(courseModules).where(eq(courseModules.id, moduleId)).run();
    const remaining = tx
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseId, course.id))
      .orderBy(asc(courseModules.orderIndex))
      .all();
    remaining.forEach((row, index) => {
      if (row.orderIndex !== index) tx.update(courseModules).set({ orderIndex: index }).where(eq(courseModules.id, row.id)).run();
    });
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  });
}

export function moveCourseModule(moduleId: string, editorId: string, direction: "up" | "down"): void {
  const db = getDb();
  const module = db.select().from(courseModules).where(eq(courseModules.id, moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);
  const siblings = db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, course.id))
    .orderBy(asc(courseModules.orderIndex))
    .all();
  const index = siblings.findIndex((row) => row.id === moduleId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const other = siblings[target]!;
  transaction((tx) => {
    tx.update(courseModules).set({ orderIndex: other.orderIndex }).where(eq(courseModules.id, module.id)).run();
    tx.update(courseModules).set({ orderIndex: module.orderIndex }).where(eq(courseModules.id, other.id)).run();
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  });
}

export function addLesson(resourceId: string, moduleId: string, editorId: string, input: LessonInput): string {
  requireCourseEditable(resourceId, editorId);
  const db = getDb();
  const module = db
    .select({ module: courseModules, course: courses })
    .from(courseModules)
    .innerJoin(courses, eq(courses.id, courseModules.courseId))
    .where(and(eq(courseModules.id, moduleId), eq(courses.resourceId, resourceId)))
    .get();
  if (!module) throw new NotFoundError("Module not found on this course.");
  const title = input.title.trim();
  if (!title) throw new AppError("Give the lesson a title.");
  const count = db
    .select({ count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(eq(courseModules.courseId, module.course.id))
    .get();
  if (Number(count?.count ?? 0) >= 200) throw new AppError("A course can have at most 200 lessons.");
  const videoUrl = input.videoUrl?.trim() ? safeUrl(input.videoUrl) : null;
  const externalUrl = input.externalUrl?.trim() ? safeUrl(input.externalUrl) : null;
  if (input.videoUrl?.trim() && !videoUrl) throw new AppError("The video link must be an http(s) URL.");
  if (input.externalUrl?.trim() && !externalUrl) throw new AppError("The resource link must be an http(s) URL.");
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: editorId });
    if (!access?.canView) throw new ForbiddenError("You cannot link a project you cannot see.");
  }
  const max = db
    .select({ value: sql<number>`coalesce(max(${lessons.orderIndex}), -1)` })
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId))
    .get();
  const lessonId = randomUUID();
  transaction((tx) => {
    tx.insert(lessons)
      .values({
        id: lessonId,
        moduleId,
        title: title.slice(0, 160),
        body: input.body?.slice(0, 12000) ?? null,
        orderIndex: Number(max?.value ?? -1) + 1,
        isFreePreview: !!input.isFreePreview,
        durationMinutes: input.durationMinutes ?? null,
        mediaId: input.mediaId ?? null,
        videoUrl: videoUrl ?? null,
        externalUrl: externalUrl ?? null,
        externalLabel: input.externalLabel?.trim().slice(0, 160) ?? null,
        externalAuthor: input.externalAuthor?.trim().slice(0, 160) ?? null,
        projectId: input.projectId ?? null,
      })
      .run();
    if (input.exerciseInstructions?.trim()) {
      tx.insert(exercises)
        .values({
          lessonId,
          title: input.exerciseTitle?.trim().slice(0, 160) || "Practice",
          instructions: input.exerciseInstructions.trim().slice(0, 4000),
          hint: input.exerciseHint?.trim().slice(0, 600) ?? null,
        })
        .run();
    }
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, module.course.id)).run();
  });
  return lessonId;
}

export function updateLesson(lessonId: string, editorId: string, input: Partial<LessonInput>): void {
  const db = getDb();
  const lesson = db.select().from(lessons).where(eq(lessons.id, lessonId)).get();
  if (!lesson) throw new NotFoundError("Lesson not found.");
  const module = db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);

  const title = input.title === undefined ? lesson.title : input.title.trim();
  if (!title) throw new AppError("Give the lesson a title.");
  const validateUrl = (value: string | null | undefined, field: string) => {
    if (value === undefined) return undefined;
    if (!value?.trim()) return null;
    const parsed = safeUrl(value);
    if (!parsed) throw new AppError(`${field} must be an http(s) URL.`);
    return parsed;
  };
  const videoUrl = validateUrl(input.videoUrl, "The video link");
  const externalUrl = validateUrl(input.externalUrl, "The resource link");
  if (input.projectId) {
    const access = getProjectAccess(input.projectId, { id: editorId });
    if (!access?.canView) throw new ForbiddenError("You cannot link a project you cannot see.");
  }

  transaction((tx) => {
    tx.update(lessons)
      .set({
        title: title.slice(0, 160),
        body: input.body === undefined ? lesson.body : input.body?.slice(0, 12000) ?? null,
        isFreePreview: input.isFreePreview === undefined ? lesson.isFreePreview : !!input.isFreePreview,
        durationMinutes:
          input.durationMinutes === undefined ? lesson.durationMinutes : input.durationMinutes ?? null,
        mediaId: input.mediaId === undefined ? lesson.mediaId : input.mediaId,
        videoUrl: videoUrl === undefined ? lesson.videoUrl : videoUrl,
        externalUrl: externalUrl === undefined ? lesson.externalUrl : externalUrl,
        externalLabel:
          input.externalLabel === undefined ? lesson.externalLabel : input.externalLabel?.trim().slice(0, 160) || null,
        externalAuthor:
          input.externalAuthor === undefined ? lesson.externalAuthor : input.externalAuthor?.trim().slice(0, 160) || null,
        projectId: input.projectId === undefined ? lesson.projectId : input.projectId,
      })
      .where(eq(lessons.id, lessonId))
      .run();

    if (input.exerciseInstructions !== undefined) {
      const existing = tx.select().from(exercises).where(eq(exercises.lessonId, lessonId)).get();
      if (!input.exerciseInstructions?.trim()) {
        tx.delete(exercises).where(eq(exercises.lessonId, lessonId)).run();
      } else if (existing) {
        tx.update(exercises)
          .set({
            title: input.exerciseTitle?.trim().slice(0, 160) || existing.title,
            instructions: input.exerciseInstructions.trim().slice(0, 4000),
            hint: input.exerciseHint === undefined ? existing.hint : input.exerciseHint?.trim().slice(0, 600) || null,
          })
          .where(eq(exercises.id, existing.id))
          .run();
      } else {
        tx.insert(exercises)
          .values({
            lessonId,
            title: input.exerciseTitle?.trim().slice(0, 160) || "Practice",
            instructions: input.exerciseInstructions.trim().slice(0, 4000),
            hint: input.exerciseHint?.trim().slice(0, 600) ?? null,
          })
          .run();
      }
    }
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  });
}

export function removeLesson(lessonId: string, editorId: string): void {
  const db = getDb();
  const lesson = db.select().from(lessons).where(eq(lessons.id, lessonId)).get();
  if (!lesson) throw new NotFoundError("Lesson not found.");
  const module = db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);
  transaction((tx) => {
    tx.delete(lessons).where(eq(lessons.id, lessonId)).run();
    const remaining = tx.select().from(lessons).where(eq(lessons.moduleId, module.id)).orderBy(asc(lessons.orderIndex)).all();
    remaining.forEach((row, index) => {
      if (row.orderIndex !== index) tx.update(lessons).set({ orderIndex: index }).where(eq(lessons.id, row.id)).run();
    });
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  });
}

export function moveLesson(lessonId: string, editorId: string, direction: "up" | "down"): void {
  const db = getDb();
  const lesson = db.select().from(lessons).where(eq(lessons.id, lessonId)).get();
  if (!lesson) throw new NotFoundError("Lesson not found.");
  const module = db.select().from(courseModules).where(eq(courseModules.id, lesson.moduleId)).get();
  if (!module) throw new NotFoundError("Module not found.");
  const course = db.select().from(courses).where(eq(courses.id, module.courseId)).get();
  if (!course) throw new NotFoundError("Course not found.");
  requireCourseEditable(course.resourceId, editorId);
  const siblings = db
    .select()
    .from(lessons)
    .where(eq(lessons.moduleId, module.id))
    .orderBy(asc(lessons.orderIndex))
    .all();
  const index = siblings.findIndex((row) => row.id === lessonId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const other = siblings[target]!;
  transaction((tx) => {
    tx.update(lessons).set({ orderIndex: other.orderIndex }).where(eq(lessons.id, lesson.id)).run();
    tx.update(lessons).set({ orderIndex: lesson.orderIndex }).where(eq(lessons.id, other.id)).run();
    tx.update(courses).set({ updatedAt: new Date().toISOString() }).where(eq(courses.id, course.id)).run();
  });
}

export function enrolInCourse(resourceId: string, userId: string) {
  const state = courseState(resourceId, { id: userId });
  if (state.resource.status !== "published") throw new AppError("This course is not published yet.");
  if (state.course.visibility === "private" && !state.canEdit) throw new ForbiddenError("This course is private.");
  if (state.resource.priceCents > 0 && !state.canEdit && !hasEntitlement(userId, resourceId)) {
    throw new ForbiddenError("You need access to this course before enrolling.");
  }
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(courseEnrollments)
    .values({ resourceId, userId, status: "active", lastAccessedAt: now })
    .onConflictDoNothing({ target: [courseEnrollments.resourceId, courseEnrollments.userId] })
    .run();
  const enrollment = db
    .select()
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.resourceId, resourceId), eq(courseEnrollments.userId, userId)))
    .get()!;
  db.update(courseEnrollments)
    .set({ lastAccessedAt: now })
    .where(eq(courseEnrollments.id, enrollment.id))
    .run();
  return enrollment;
}

export function courseStats(resourceId: string) {
  const db = getDb();
  const enrollments = db.select().from(courseEnrollments).where(eq(courseEnrollments.resourceId, resourceId)).all();
  let sum = 0;
  let completed = 0;
  for (const enrollment of enrollments) {
    const pct = courseProgressFor(enrollment.userId, resourceId).pct;
    sum += pct;
    if (pct >= 100) completed += 1;
  }
  return {
    learners: enrollments.length,
    completions: completed,
    averagePct: enrollments.length ? Math.round(sum / enrollments.length) : 0,
  };
}

export function courseSummariesForCreator(creatorId: string) {
  const db = getDb();
  const rows = db
    .select({ resource: learningResources, course: courses })
    .from(learningResources)
    .innerJoin(courses, eq(courses.resourceId, learningResources.id))
    .where(and(eq(learningResources.creatorId, creatorId), eq(learningResources.format, "course")))
    .orderBy(desc(learningResources.updatedAt))
    .all();
  return rows.map((row) => {
    const lessonCount = db
      .select({ count: sql<number>`count(*)` })
      .from(lessons)
      .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
      .where(eq(courseModules.courseId, row.course.id))
      .get();
    const moduleCount = db
      .select({ count: sql<number>`count(*)` })
      .from(courseModules)
      .where(eq(courseModules.courseId, row.course.id))
      .get();
    return {
      resource: row.resource,
      course: row.course,
      lessonCount: Number(lessonCount?.count ?? 0),
      moduleCount: Number(moduleCount?.count ?? 0),
      stats: courseStats(row.resource.id),
    };
  });
}

export function courseAnalytics(creatorId: string) {
  const courses = courseSummariesForCreator(creatorId);
  const uniqueLearners = new Set(
    getDb()
      .select({ userId: courseEnrollments.userId })
      .from(courseEnrollments)
      .innerJoin(learningResources, eq(learningResources.id, courseEnrollments.resourceId))
      .where(eq(learningResources.creatorId, creatorId))
      .all()
      .map((row) => row.userId),
  ).size;
  const totals = courses.reduce(
    (acc, row) => ({
      learners: uniqueLearners,
      completions: acc.completions + row.stats.completions,
      enrollments: acc.enrollments + row.stats.learners,
      published: acc.published + (row.resource.status === "published" ? 1 : 0),
    }),
    { learners: 0, completions: 0, enrollments: 0, published: 0 },
  );
  const averagePct = courses.length
    ? Math.round(courses.reduce((sum, row) => sum + row.stats.averagePct, 0) / courses.length)
    : 0;
  return { courses, totals, averagePct };
}

export function recentCourseEnrollments(creatorId: string, limit = 6) {
  return getDb()
    .select({
      enrollment: courseEnrollments,
      resource: learningResources,
      learnerName: users.displayName,
      learnerUsername: users.username,
    })
    .from(courseEnrollments)
    .innerJoin(learningResources, eq(learningResources.id, courseEnrollments.resourceId))
    .innerJoin(users, eq(users.id, courseEnrollments.userId))
    .where(eq(learningResources.creatorId, creatorId))
    .orderBy(desc(courseEnrollments.enrolledAt))
    .limit(limit)
    .all();
}

export function addCourseCollaborator(resourceId: string, ownerId: string, username: string) {
  requireCourseOwner(resourceId, ownerId);
  const db = getDb();
  const person = db.select().from(users).where(eq(users.username, username.trim().replace(/^@/, ""))).get();
  if (!person) throw new NotFoundError("No account with that username.");
  if (person.id === ownerId) throw new AppError("You already own this course.");
  db.insert(courseCollaborators)
    .values({ resourceId, userId: person.id, addedBy: ownerId })
    .onConflictDoNothing({ target: [courseCollaborators.resourceId, courseCollaborators.userId] })
    .run();
  return person;
}

export function removeCourseCollaborator(resourceId: string, ownerId: string, collaboratorId: string): void {
  requireCourseOwner(resourceId, ownerId);
  getDb()
    .delete(courseCollaborators)
    .where(and(eq(courseCollaborators.resourceId, resourceId), eq(courseCollaborators.userId, collaboratorId)))
    .run();
}

export function lessonDetail(resourceId: string, lessonId: string, viewer: Viewer) {
  const detail = resourceDetail(resourceId, viewer);
  if (!detail || !detail.course) return null;
  const lessons = detail.curriculum.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson })));
  const index = lessons.findIndex((row) => row.lesson.id === lessonId);
  if (index < 0) return null;
  const entry = lessons[index]!;
  const exercise = detail.exercises.find((row) => row.lessonId === lessonId) ?? null;
  const project = entry.lesson.projectId
    ? getDb().select().from(projects).where(eq(projects.id, entry.lesson.projectId)).get()
    : null;
  return {
    detail,
    lesson: entry.lesson,
    module: entry.module,
    exercise,
    index,
    prev: lessons[index - 1]?.lesson ?? null,
    next: lessons[index + 1]?.lesson ?? null,
    project: project ?? null,
    projectAccess: project ? getProjectAccess(project.id, viewer) : null,
    completed: detail.progress.some((row) => row.lessonId === lessonId && row.completed),
  };
}
