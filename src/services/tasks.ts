import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  contributorAttributions,
  deliverables,
  disputes,
  expressionsOfInterest,
  projectMembers,
  projects,
  skills,
  taskAssignments,
  taskReviews,
  taskSkills,
  taskSubmissions,
  tasks,
  users,
} from "@/db/schema";
import { getTaskAccess, requireProjectAccess, requireTaskAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify, notifyMany } from "@/lib/notify";
import { awardReputation, REPUTATION_WEIGHTS } from "@/lib/reputation";
import { upsertSkill } from "@/services/users";
import type { CompensationType, EoiIntent, TaskStatus, Visibility } from "@/lib/types";

export type CreateTaskInput = {
  title: string;
  description?: string;
  objective?: string;
  deliverablesSpec?: string;
  acceptanceCriteria?: string;
  effort?: string;
  deadline?: string;
  compensationType: CompensationType;
  compensationDetails?: string;
  visibility: Visibility;
  confidentiality?: string;
  skills: string[];
  publish: boolean;
};

export function createTask(projectId: string, viewer: Viewer, input: CreateTaskInput): string {
  const access = requireProjectAccess(projectId, viewer, "edit");
  if (input.title.trim().length < 4) throw new AppError("Task title must be at least 4 characters.");
  if (input.publish && !input.acceptanceCriteria?.trim()) {
    throw new AppError("Publish requires acceptance criteria, so contributors know what done looks like.");
  }
  if (input.publish && input.compensationType === "unpaid" && !input.compensationDetails?.trim()) {
    throw new AppError("Describe what unpaid contributors receive before publishing.");
  }

  const db = getDb();
  const id = randomUUID();
  transaction((tx) => {
    tx.insert(tasks)
      .values({
        id,
        projectId,
        createdBy: viewer!.id,
        title: input.title.trim().slice(0, 160),
        description: input.description?.slice(0, 6000) ?? null,
        objective: input.objective?.slice(0, 2000) ?? null,
        deliverablesSpec: input.deliverablesSpec?.slice(0, 4000) ?? null,
        acceptanceCriteria: input.acceptanceCriteria?.slice(0, 4000) ?? null,
        effort: input.effort ?? null,
        deadline: input.deadline || null,
        compensationType: input.compensationType,
        compensationDetails: input.compensationDetails?.slice(0, 2000) ?? null,
        visibility: input.visibility,
        confidentiality: input.confidentiality?.slice(0, 2000) ?? null,
        status: input.publish ? "open" : "draft",
        publishedAt: input.publish ? new Date().toISOString() : null,
      })
      .run();

    for (const name of input.skills.slice(0, 10)) {
      const skill = upsertSkill(name);
      if (skill) tx.insert(taskSkills).values({ taskId: id, skillId: skill.id }).onConflictDoNothing().run();
    }
  });

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (input.publish) {
    notify({ userId: access.project.ownerId, kind: "system", title: `Task published: ${input.title}`, href: `/tasks/${id}` });
  }
  return id;
}

export function updateTask(taskId: string, viewer: Viewer, input: Partial<CreateTaskInput>): void {
  requireTaskAccess(taskId, viewer, "edit");
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const field of [
    "title",
    "description",
    "objective",
    "deliverablesSpec",
    "acceptanceCriteria",
    "effort",
    "deadline",
    "compensationType",
    "compensationDetails",
    "visibility",
    "confidentiality",
  ] as const) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  db.update(tasks).set(patch).where(eq(tasks.id, taskId)).run();

  if (input.skills) {
    transaction((tx) => {
      tx.delete(taskSkills).where(eq(taskSkills.taskId, taskId)).run();
      for (const name of input.skills!.slice(0, 10)) {
        const skill = upsertSkill(name);
        if (skill) tx.insert(taskSkills).values({ taskId, skillId: skill.id }).onConflictDoNothing().run();
      }
    });
  }
}

export function setTaskStatus(taskId: string, viewer: Viewer, status: TaskStatus): void {
  const access = requireTaskAccess(taskId, viewer, "edit");
  const task = access.task;
  if (task.status === "completed" && status !== "completed") {
    throw new AppError("Completed tasks are locked. Reopen by creating a follow-up task.");
  }
  getDb()
    .update(tasks)
    .set({ status, updatedAt: new Date().toISOString(), ...(status === "open" ? { publishedAt: task.publishedAt ?? new Date().toISOString() } : {}) })
    .where(eq(tasks.id, taskId))
    .run();
}

export function listTasks(projectId: string, viewer: Viewer) {
  const db = getDb();
  const access = requireProjectAccess(projectId, viewer, "view");
  const rows = db
    .select({
      task: tasks,
      assigneeCount: sql<number>`(select count(*) from task_assignments ta where ta.task_id = ${tasks.id} and ta.status = 'active')`,
      interestCount: sql<number>`(select count(*) from expressions_of_interest eoi where eoi.task_id = ${tasks.id} and eoi.status = 'new')`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.createdAt))
    .all();

  return rows
    .filter((row) => access.canViewWorkspace || (row.task.visibility === "public" && row.task.status !== "draft"))
    .map((row) => ({ ...row.task, assigneeCount: Number(row.assigneeCount), interestCount: Number(row.interestCount) }));
}

export function taskDetail(taskId: string, viewer: Viewer) {
  const db = getDb();
  const access = getTaskAccess(taskId, viewer);
  if (!access || !access.canView) return null;

  const assignees = db
    .select({
      id: taskAssignments.id,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
      status: taskAssignments.status,
      scopeConfirmedAt: taskAssignments.scopeConfirmedAt,
      responsibilities: taskAssignments.responsibilities,
      assignedAt: taskAssignments.assignedAt,
    })
    .from(taskAssignments)
    .innerJoin(users, eq(users.id, taskAssignments.userId))
    .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.status, "active")))
    .all();

  const submissions = db
    .select({
      submission: taskSubmissions,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(taskSubmissions)
    .innerJoin(users, eq(users.id, taskSubmissions.userId))
    .where(eq(taskSubmissions.taskId, taskId))
    .orderBy(desc(taskSubmissions.submittedAt))
    .all();

  const submissionIds = submissions.map((row) => row.submission.id);
  const files = submissionIds.length
    ? db.select().from(deliverables).where(eq(deliverables.taskId, taskId)).all()
    : [];

  const reviews = db
    .select({ review: taskReviews, reviewerName: users.displayName })
    .from(taskReviews)
    .innerJoin(users, eq(users.id, taskReviews.reviewerId))
    .where(eq(taskReviews.taskId, taskId))
    .orderBy(desc(taskReviews.createdAt))
    .all();

  const interests = access.canReview
    ? db
        .select({
          eoi: expressionsOfInterest,
          userName: users.displayName,
          username: users.username,
          avatarFileId: users.avatarFileId,
          bio: users.bio,
        })
        .from(expressionsOfInterest)
        .innerJoin(users, eq(users.id, expressionsOfInterest.userId))
        .where(eq(expressionsOfInterest.taskId, taskId))
        .orderBy(desc(expressionsOfInterest.createdAt))
        .all()
    : [];

  const taskSkillRows = db
    .select({ id: skills.id, name: skills.name, slug: skills.slug })
    .from(taskSkills)
    .innerJoin(skills, eq(skills.id, taskSkills.skillId))
    .where(eq(taskSkills.taskId, taskId))
    .all();

  return { ...access, assignees, submissions, files, reviews, interests, skills: taskSkillRows };
}

/* ------------------------------ expressions of interest -------------------- */

export type InterestInput = {
  projectId: string;
  taskId?: string | null;
  intent: EoiIntent;
  message?: string;
  workSamples?: { label: string; url: string }[];
};

export function expressInterest(viewerId: string, input: InterestInput): string {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
  if (!project) throw new NotFoundError("Project not found.");
  if (project.ownerId === viewerId) throw new AppError("You already own this project.");
  if (project.status !== "published") throw new AppError("This project is not open for interest yet.");

  const existingMember = db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.userId, viewerId),
        eq(projectMembers.status, "active"),
      ),
    )
    .get();
  if (existingMember) throw new AppError("You are already on this project team. Use the team chat instead.");

  if (input.taskId) {
    const task = db.select().from(tasks).where(eq(tasks.id, input.taskId)).get();
    if (!task || task.projectId !== input.projectId) throw new AppError("That task does not belong to this project.");
    if (task.status !== "open") throw new AppError("That task is not currently accepting interest.");
  }

  const duplicate = db
    .select({ id: expressionsOfInterest.id })
    .from(expressionsOfInterest)
    .where(
      and(
        eq(expressionsOfInterest.projectId, input.projectId),
        eq(expressionsOfInterest.userId, viewerId),
        input.taskId ? eq(expressionsOfInterest.taskId, input.taskId) : isNull(expressionsOfInterest.taskId),
      ),
    )
    .get();
  if (duplicate) throw new AppError("You have already expressed interest here. The owner can see your previous note.");

  const id = randomUUID();
  db.insert(expressionsOfInterest)
    .values({
      id,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      userId: viewerId,
      intent: input.intent,
      message: input.message?.slice(0, 2000) ?? null,
      workSamples: (input.workSamples ?? []).filter((sample) => sample.url).slice(0, 3),
      status: "new",
    })
    .run();

  if (input.taskId) {
    db.update(tasks).set({ status: "reviewing_interest" }).where(and(eq(tasks.id, input.taskId), eq(tasks.status, "open"))).run();
  }

  notify({
    userId: project.ownerId,
    actorId: viewerId,
    kind: "interest_received",
    title: `New interest in ${project.name}`,
    body: input.intent === "help_task" ? "A contributor offered to help with a task." : "Someone wants to get involved.",
    href: `/projects/${project.id}?tab=team`,
  });
  return id;
}

export function projectInterests(projectId: string, viewer: Viewer) {
  requireProjectAccess(projectId, viewer, "review");
  return getDb()
    .select({
      eoi: expressionsOfInterest,
      userName: users.displayName,
      username: users.username,
      avatarFileId: users.avatarFileId,
      bio: users.bio,
      taskTitle: tasks.title,
    })
    .from(expressionsOfInterest)
    .innerJoin(users, eq(users.id, expressionsOfInterest.userId))
    .leftJoin(tasks, eq(tasks.id, expressionsOfInterest.taskId))
    .where(eq(expressionsOfInterest.projectId, projectId))
    .orderBy(desc(expressionsOfInterest.createdAt))
    .all();
}

/** Owner accepts or declines an expression of interest. */
export function respondToInterest(
  eoiId: string,
  viewer: Viewer,
  decision: "accepted" | "declined" | "reviewing",
  responseMessage?: string,
): void {
  const db = getDb();
  const eoi = db.select().from(expressionsOfInterest).where(eq(expressionsOfInterest.id, eoiId)).get();
  if (!eoi) throw new NotFoundError("Interest request not found.");
  const access = requireProjectAccess(eoi.projectId, viewer, "review");
  if (eoi.userId === viewer!.id) throw new ForbiddenError("You cannot accept your own expression of interest.");
  if (eoi.status === "accepted" && decision === "accepted") throw new AppError("Already accepted.");

  const project = access.project;
  transaction((tx) => {
    tx.update(expressionsOfInterest)
      .set({ status: decision, responseMessage: responseMessage?.slice(0, 1200) ?? null, reviewedBy: viewer!.id, respondedAt: new Date().toISOString() })
      .where(eq(expressionsOfInterest.id, eoiId))
      .run();

    if (decision === "accepted") {
      tx.insert(projectMembers)
        .values({ projectId: eoi.projectId, userId: eoi.userId, role: "collaborator", invitedBy: viewer!.id })
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: { status: "active" },
        })
        .run();

      if (eoi.taskId) {
        const task = tx.select().from(tasks).where(eq(tasks.id, eoi.taskId)).get();
        if (task && task.status !== "completed") {
          tx.insert(taskAssignments)
            .values({ taskId: eoi.taskId, userId: eoi.userId, assignedBy: viewer!.id })
            .onConflictDoNothing()
            .run();
          tx.update(tasks).set({ status: "assigned" }).where(eq(tasks.id, eoi.taskId)).run();
        }
      }
    }
  });

  notify({
    userId: eoi.userId,
    actorId: viewer!.id,
    kind: "interest_answered",
    title:
      decision === "accepted"
        ? `You were accepted into ${project.name}`
        : decision === "declined"
          ? `Update on your interest in ${project.name}`
          : `Your interest in ${project.name} is being reviewed`,
    body: responseMessage ?? undefined,
    href: decision === "accepted" ? `/projects/${project.id}?tab=team` : "/home",
  });
}

/* -------------------------------- assignments ------------------------------ */

export function assignContributor(taskId: string, viewer: Viewer, userId: string, responsibilities?: string): void {
  requireTaskAccess(taskId, viewer, "review");
  const db = getDb();
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get()!;
  const member = db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.userId, userId), eq(projectMembers.status, "active")))
    .get();
  if (!member) {
    // Assigning an outsider is allowed only by also adding them to the team.
    db.insert(projectMembers)
      .values({ projectId: task.projectId, userId, role: "collaborator", invitedBy: viewer!.id })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { status: "active" } })
      .run();
  }
  transaction((tx) => {
    tx.insert(taskAssignments)
      .values({ taskId, userId, assignedBy: viewer!.id, responsibilities: responsibilities?.slice(0, 1200) ?? null })
      .onConflictDoNothing()
      .run();
    tx.update(tasks).set({ status: task.status === "open" || task.status === "reviewing_interest" ? "assigned" : task.status }).where(eq(tasks.id, taskId)).run();
  });
  notify({
    userId,
    actorId: viewer!.id,
    kind: "task_assigned",
    title: `You have been assigned: ${task.title}`,
    href: `/tasks/${taskId}`,
  });
}

export function confirmScope(taskId: string, userId: string): void {
  const access = getTaskAccess(taskId, { id: userId });
  if (!access?.isAssignee) throw new ForbiddenError("Only the assigned contributor can confirm scope.");
  const db = getDb();
  db.update(taskAssignments)
    .set({ scopeConfirmedAt: new Date().toISOString() })
    .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.userId, userId), eq(taskAssignments.status, "active")))
    .run();
  db.update(tasks).set({ status: "in_progress" }).where(and(eq(tasks.id, taskId), eq(tasks.status, "assigned"))).run();
}

export function removeAssignee(taskId: string, viewer: Viewer, userId: string): void {
  requireTaskAccess(taskId, viewer, "review");
  getDb()
    .update(taskAssignments)
    .set({ status: "removed" })
    .where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.userId, userId)))
    .run();
  notify({ userId, kind: "system", title: "You were removed from a task", href: "/home" });
}

/* -------------------------------- submissions ------------------------------ */

export function submitWork(
  taskId: string,
  userId: string,
  input: { note: string; files: { title: string; url?: string; fileId?: string; description?: string }[] },
): string {
  const access = requireTaskAccess(taskId, { id: userId }, "submit");
  if (!input.note.trim() && input.files.length === 0) {
    throw new AppError("Add a note or at least one deliverable before submitting.");
  }
  const db = getDb();
  const id = randomUUID();

  transaction((tx) => {
    tx.insert(taskSubmissions)
      .values({ id, taskId, userId, note: input.note.slice(0, 4000), status: "submitted" })
      .run();
    for (const file of input.files.slice(0, 10)) {
      tx.insert(deliverables)
        .values({
          taskId,
          submissionId: id,
          title: file.title.slice(0, 160),
          description: file.description?.slice(0, 1000) ?? null,
          url: file.url ?? null,
          fileId: file.fileId ?? null,
        })
        .run();
    }
    tx.update(tasks).set({ status: "submitted" }).where(eq(tasks.id, taskId)).run();
  });

  const projectOwner = access.projectAccess.project.ownerId;
  notify({
    userId: projectOwner,
    actorId: userId,
    kind: "submission_received",
    title: `Work submitted: ${access.task.title}`,
    href: `/tasks/${taskId}`,
  });
  return id;
}

/**
 * Review a submission. Acceptance is the only thing that creates a confirmed
 * contribution record — uploading a file alone never counts as verified work.
 */
export function reviewSubmission(
  submissionId: string,
  viewer: Viewer,
  decision: "accepted" | "revision_requested",
  reason?: string,
): void {
  const db = getDb();
  const submission = db.select().from(taskSubmissions).where(eq(taskSubmissions.id, submissionId)).get();
  if (!submission) throw new NotFoundError("Submission not found.");
  requireTaskAccess(submission.taskId, viewer, "review");
  if (submission.userId === viewer!.id) {
    throw new ForbiddenError("You cannot review your own submission.");
  }
  if (submission.status !== "submitted") throw new AppError("That submission has already been reviewed.");
  if (decision === "revision_requested" && !reason?.trim()) {
    throw new AppError("Explain what needs to change so the contributor can act on it.");
  }

  const task = db.select().from(tasks).where(eq(tasks.id, submission.taskId)).get()!;
  const attributionId = randomUUID();

  transaction((tx) => {
    tx.update(taskSubmissions)
      .set({
        status: decision,
        reviewerId: viewer!.id,
        reviewNote: reason?.slice(0, 2000) ?? null,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(taskSubmissions.id, submissionId))
      .run();

    tx.insert(taskReviews)
      .values({ taskId: task.id, submissionId, reviewerId: viewer!.id, decision, reason: reason?.slice(0, 2000) ?? null })
      .run();

    tx.update(tasks)
      .set({ status: decision === "accepted" ? "completed" : "revision_requested", updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, task.id))
      .run();

    if (decision === "accepted") {
      tx.update(deliverables).set({ approved: true }).where(eq(deliverables.submissionId, submissionId)).run();

      const existing = tx
        .select({ id: contributorAttributions.id })
        .from(contributorAttributions)
        .where(and(eq(contributorAttributions.userId, submission.userId), eq(contributorAttributions.taskId, task.id)))
        .get();

      if (!existing) {
        tx.insert(contributorAttributions)
          .values({
            id: attributionId,
            userId: submission.userId,
            projectId: task.projectId,
            taskId: task.id,
            submissionId,
            role: "Contributor",
            summary: `Completed "${task.title}"${submission.note ? `: ${submission.note.slice(0, 240)}` : ""}`,
            verificationMethod: "owner_confirmed",
            status: "confirmed",
            evidence: `Accepted submission ${submissionId} reviewed by project owner`,
            confirmedBy: viewer!.id,
            confirmedAt: new Date().toISOString(),
          })
          .run();
      }
    }
  });

  if (decision === "accepted") {
    awardReputation({
      userId: submission.userId,
      dimension: "contribution",
      points: REPUTATION_WEIGHTS.contribution.task_completed,
      reason: `Task completed: ${task.title}`,
      sourceType: "task",
      sourceId: task.id,
    });
    awardReputation({
      userId: submission.userId,
      dimension: "expertise",
      points: REPUTATION_WEIGHTS.expertise.skill_evidence,
      reason: `Demonstrated delivery on ${task.title}`,
      sourceType: "submission",
      sourceId: submissionId,
    });
    notify({
      userId: submission.userId,
      actorId: viewer!.id,
      kind: "contribution_confirmed",
      title: `Work accepted: ${task.title}`,
      body: "This is now recorded in your contribution history as owner-confirmed.",
      href: "/settings?tab=contributions",
    });
  } else {
    notify({
      userId: submission.userId,
      actorId: viewer!.id,
      kind: "submission_reviewed",
      title: `Changes requested: ${task.title}`,
      body: reason ?? undefined,
      href: `/tasks/${task.id}`,
    });
  }

  const followers = db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, task.projectId), eq(projectMembers.status, "active")))
    .all()
    .map((row) => row.userId);
  notifyMany(followers, {
    kind: "system",
    title: `Task ${decision === "accepted" ? "completed" : "needs revision"}: ${task.title}`,
    href: `/tasks/${task.id}`,
    actorId: viewer!.id,
  });
}

/* -------------------------------- attribution ------------------------------ */

export function listAttributions(userId: string) {
  return getDb()
    .select({
      attribution: contributorAttributions,
      projectName: projects.name,
      projectId: projects.id,
      taskTitle: tasks.title,
    })
    .from(contributorAttributions)
    .innerJoin(projects, eq(projects.id, contributorAttributions.projectId))
    .leftJoin(tasks, eq(tasks.id, contributorAttributions.taskId))
    .where(eq(contributorAttributions.userId, userId))
    .orderBy(desc(contributorAttributions.createdAt))
    .all();
}

export function disputeAttribution(
  attributionId: string,
  raisedBy: string,
  input: { subject: string; details: string },
): string {
  const db = getDb();
  const attribution = db.select().from(contributorAttributions).where(eq(contributorAttributions.id, attributionId)).get();
  if (!attribution) throw new NotFoundError("Contribution record not found.");
  const project = db.select().from(projects).where(eq(projects.id, attribution.projectId)).get();
  const isSubject = attribution.userId === raisedBy;
  const isOwner = project?.ownerId === raisedBy;
  if (!isSubject && !isOwner) throw new ForbiddenError("You can only dispute your own attribution or one on your project.");
  if (!input.details.trim()) throw new AppError("Explain what is inaccurate.");

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(disputes)
      .values({
        id,
        raisedBy,
        attributionId,
        projectId: attribution.projectId,
        taskId: attribution.taskId,
        subject: input.subject.slice(0, 160),
        details: input.details.slice(0, 4000),
      })
      .run();
    tx.update(contributorAttributions).set({ status: "disputed" }).where(eq(contributorAttributions.id, attributionId)).run();
  });
  return id;
}

export function correctAttribution(
  attributionId: string,
  viewer: Viewer,
  input: { role?: string; summary?: string },
): void {
  const db = getDb();
  const attribution = db.select().from(contributorAttributions).where(eq(contributorAttributions.id, attributionId)).get();
  if (!attribution) throw new NotFoundError("Contribution record not found.");
  if (attribution.userId !== viewer!.id && !viewer?.isAdmin) {
    throw new ForbiddenError("Only the contributor or a platform administrator can correct this record.");
  }
  db.update(contributorAttributions)
    .set({ role: input.role ?? attribution.role, summary: input.summary ?? attribution.summary, status: "corrected" })
    .where(eq(contributorAttributions.id, attributionId))
    .run();
}

export function attributionForUser(userId: string) {
  return getDb()
    .select({ attribution: contributorAttributions, projectName: projects.name })
    .from(contributorAttributions)
    .innerJoin(projects, eq(projects.id, contributorAttributions.projectId))
    .where(eq(contributorAttributions.userId, userId))
    .all();
}

export function openTasksForProject(projectId: string) {
  return getDb()
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "open"), eq(tasks.visibility, "public")))
    .orderBy(asc(tasks.deadline))
    .all();
}

export function upcomingDeadlines(userId: string) {
  return getDb()
    .select({ task: tasks, projectName: projects.name })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(taskAssignments.userId, userId), eq(taskAssignments.status, "active"), eq(tasks.status, "in_progress")))
    .orderBy(asc(tasks.deadline))
    .all();
}
