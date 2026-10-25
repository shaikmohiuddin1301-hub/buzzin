import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  auditLogs,
  comments,
  contributorAttributions,
  disputes,
  generatedMedia,
  learningResources,
  messages,
  moderationActions,
  posts,
  projects,
  reports,
  storyboards,
  tasks,
  users,
} from "@/db/schema";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { audit, notify } from "@/lib/notify";
import type { ModerationAction, ReportStatus } from "@/lib/types";

const REASON_CODES = new Set([
  "spam",
  "harassment",
  "impersonation",
  "misattribution",
  "unsafe_content",
  "ip_violation",
  "misleading_claims",
  "duplicate_review",
  "appeal",
  "other",
]);

export function platformMetrics() {
  const db = getDb();
  return {
    users: Number(db.select({ value: count() }).from(users).get()?.value ?? 0),
    activeUsers: Number(db.select({ value: count() }).from(users).where(eq(users.status, "active")).get()?.value ?? 0),
    projects: Number(db.select({ value: count() }).from(projects).get()?.value ?? 0),
    publishedProjects: Number(db.select({ value: count() }).from(projects).where(eq(projects.status, "published")).get()?.value ?? 0),
    completedTasks: Number(db.select({ value: count() }).from(tasks).where(eq(tasks.status, "completed")).get()?.value ?? 0),
    resources: Number(db.select({ value: count() }).from(learningResources).where(eq(learningResources.status, "published")).get()?.value ?? 0),
    stories: Number(db.select({ value: count() }).from(storyboards).get()?.value ?? 0),
    storySuccess: Number(
      db
        .select({ value: count() })
        .from(generatedMedia)
        .where(and(eq(generatedMedia.kind, "animation"), eq(generatedMedia.status, "ready")))
        .get()?.value ?? 0,
    ),
    storyFailures: Number(
      db
        .select({ value: count() })
        .from(generatedMedia)
        .where(and(eq(generatedMedia.kind, "animation"), eq(generatedMedia.status, "failed")))
        .get()?.value ?? 0,
    ),
    openReports: Number(db.select({ value: count() }).from(reports).where(eq(reports.status, "open")).get()?.value ?? 0),
    openDisputes: Number(db.select({ value: count() }).from(disputes).where(eq(disputes.status, "open")).get()?.value ?? 0),
    suspendedUsers: Number(db.select({ value: count() }).from(users).where(eq(users.status, "suspended")).get()?.value ?? 0),
    attributions: Number(db.select({ value: count() }).from(contributorAttributions).get()?.value ?? 0),
    disputesRate: Number(db.select({ value: count() }).from(disputes).get()?.value ?? 0),
  };
}

export function listReports(status?: string) {
  const db = getDb();
  const rows = db
    .select({
      report: reports,
      reporterName: users.displayName,
      reporterUsername: users.username,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .orderBy(desc(reports.createdAt))
    .all();
  return status ? rows.filter((row) => row.report.status === (status as ReportStatus)) : rows;
}

export function reportDetail(reportId: string) {
  const db = getDb();
  const report = db.select().from(reports).where(eq(reports.id, reportId)).get();
  if (!report) return null;
  let excerpt = "";
  if (report.targetType === "post") excerpt = db.select().from(posts).where(eq(posts.id, report.targetId)).get()?.body ?? "";
  if (report.targetType === "comment") excerpt = db.select().from(comments).where(eq(comments.id, report.targetId)).get()?.body ?? "";
  if (report.targetType === "message") excerpt = db.select().from(messages).where(eq(messages.id, report.targetId)).get()?.body ?? "";
  if (report.targetType === "project") excerpt = db.select().from(projects).where(eq(projects.id, report.targetId)).get()?.shortDescription ?? "";
  if (report.targetType === "resource") excerpt = db.select().from(learningResources).where(eq(learningResources.id, report.targetId)).get()?.summary ?? "";
  const history = db
    .select({ action: moderationActions, moderatorName: users.displayName })
    .from(moderationActions)
    .innerJoin(users, eq(users.id, moderationActions.moderatorId))
    .where(eq(moderationActions.reportId, reportId))
    .orderBy(desc(moderationActions.createdAt))
    .all();
  return { report, excerpt, history };
}

/**
 * Apply a moderation decision.
 *
 * Every action needs a reason code and writes an audit row plus a moderation
 * action row, so enforcement is reviewable later.
 */
export function applyModeration(input: {
  reportId: string;
  moderatorId: string;
  action: ModerationAction;
  reasonCode: string;
  notes: string;
}): void {
  if (!input.reasonCode.trim()) throw new AppError("A reason code is required for moderation actions.");
  if (!input.notes.trim()) throw new AppError("Add internal notes explaining the decision.");
  if (!REASON_CODES.has(input.reasonCode)) throw new AppError("Unknown reason code.");

  const db = getDb();
  const report = db.select().from(reports).where(eq(reports.id, input.reportId)).get();
  if (!report) throw new NotFoundError("Report not found.");
  if (report.status === "resolved" || report.status === "dismissed") throw new AppError("This report has already been closed.");

  let targetUserId: string | null = null;

  transaction((tx) => {
    switch (input.action) {
      case "hide_content": {
        if (report.targetType === "post") {
          tx.update(posts).set({ hiddenAt: new Date().toISOString() }).where(eq(posts.id, report.targetId)).run();
          targetUserId = tx.select({ id: posts.authorId }).from(posts).where(eq(posts.id, report.targetId)).get()?.id ?? null;
        }
        if (report.targetType === "comment") {
          tx.update(comments).set({ status: "hidden" }).where(eq(comments.id, report.targetId)).run();
          targetUserId = tx.select({ id: comments.authorId }).from(comments).where(eq(comments.id, report.targetId)).get()?.id ?? null;
        }
        if (report.targetType === "message") {
          tx.update(messages).set({ deletedAt: new Date().toISOString() }).where(eq(messages.id, report.targetId)).run();
          targetUserId = tx.select({ id: messages.senderId }).from(messages).where(eq(messages.id, report.targetId)).get()?.id ?? null;
        }
        if (report.targetType === "project") {
          tx.update(projects).set({ status: "archived", visibility: "private" }).where(eq(projects.id, report.targetId)).run();
        }
        if (report.targetType === "story") {
          tx.update(storyboards).set({ status: "rejected", visibility: "private" }).where(eq(storyboards.id, report.targetId)).run();
        }
        if (report.targetType === "resource") {
          tx.update(learningResources).set({ status: "archived" }).where(eq(learningResources.id, report.targetId)).run();
        }
        break;
      }
      case "restrict_account":
      case "suspend_account": {
        if (report.targetType !== "user") throw new AppError("Account actions require a report against a user.");
        targetUserId = report.targetId;
        tx.update(users)
          .set({
            status: input.action === "suspend_account" ? "suspended" : "restricted",
            suspendedReason: input.notes.slice(0, 600),
          })
          .where(eq(users.id, report.targetId))
          .run();
        break;
      }
      case "reinstate": {
        if (report.targetType !== "user") throw new AppError("Reinstatement requires a report against a user.");
        targetUserId = report.targetId;
        tx.update(users).set({ status: "active", suspendedReason: null }).where(eq(users.id, report.targetId)).run();
        break;
      }
      case "warn":
      case "dismiss":
        if (report.targetType === "user") targetUserId = report.targetId;
        break;
    }

    tx.insert(moderationActions)
      .values({
        moderatorId: input.moderatorId,
        reportId: input.reportId,
        action: input.action,
        reasonCode: input.reasonCode,
        notes: input.notes.slice(0, 2000),
        targetUserId,
        targetType: report.targetType,
        targetId: report.targetId,
      })
      .run();

    tx.update(reports)
      .set({
        status: input.action === "dismiss" ? "dismissed" : "resolved",
        resolution: `${input.action}: ${input.notes.slice(0, 300)}`,
        resolvedAt: new Date().toISOString(),
        assignedTo: input.moderatorId,
      })
      .where(eq(reports.id, input.reportId))
      .run();

    // An attribution dispute report also flags the underlying record.
    if (input.reasonCode === "misattribution" && report.targetType === "user") {
      tx.update(contributorAttributions)
        .set({ status: "disputed" })
        .where(eq(contributorAttributions.userId, report.targetId))
        .run();
    }
  });

  audit({
    actorId: input.moderatorId,
    action: `moderation.${input.action}`,
    targetType: report.targetType,
    targetId: report.targetId,
    reasonCode: input.reasonCode,
    metadata: { reportId: input.reportId, notes: input.notes },
  });

  notify({
    userId: report.reporterId,
    actorId: input.moderatorId,
    kind: "moderation",
    title: "Your report was reviewed",
    body: `Decision: ${input.action.replace("_", " ")} (${input.reasonCode.replace("_", " ")})`,
    href: "/notifications",
  });
  if (targetUserId && targetUserId !== input.moderatorId) {
    notify({
      userId: targetUserId,
      kind: "moderation",
      title:
        input.action === "dismiss"
          ? "A report about your content was dismissed"
          : `Moderation action: ${input.action.replace("_", " ")}`,
      body: input.action === "dismiss" ? undefined : "You can appeal this decision from the help centre.",
      href: "/help",
    });
  }
}

export function listDisputes() {
  return getDb()
    .select({ dispute: disputes, raisedByName: users.displayName, username: users.username })
    .from(disputes)
    .innerJoin(users, eq(users.id, disputes.raisedBy))
    .orderBy(desc(disputes.createdAt))
    .all();
}

export function resolveDispute(
  disputeId: string,
  moderatorId: string,
  decision: "resolved" | "rejected",
  resolution: string,
): void {
  if (!resolution.trim()) throw new AppError("Record the resolution for the audit trail.");
  const db = getDb();
  const dispute = db.select().from(disputes).where(eq(disputes.id, disputeId)).get();
  if (!dispute) throw new NotFoundError("Dispute not found.");
  if (dispute.status === "resolved" || dispute.status === "rejected") throw new AppError("Already closed.");

  transaction((tx) => {
    tx.update(disputes)
      .set({ status: decision, resolution: resolution.slice(0, 4000), resolvedAt: new Date().toISOString(), resolvedBy: moderatorId })
      .where(eq(disputes.id, disputeId))
      .run();
    if (dispute.attributionId && decision === "resolved") {
      tx.update(contributorAttributions).set({ status: "corrected" }).where(eq(contributorAttributions.id, dispute.attributionId)).run();
    }
  });
  audit({ actorId: moderatorId, action: "dispute.resolved", targetType: "dispute", targetId: disputeId, metadata: { decision, resolution } });
  notify({
    userId: dispute.raisedBy,
    actorId: moderatorId,
    kind: "moderation",
    title: `Dispute ${decision}`,
    body: resolution,
    href: "/notifications",
  });
}

export function adminUserList(query?: string) {
  const db = getDb();
  const base = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
      createdAt: users.createdAt,
      suspendedReason: users.suspendedReason,
    })
    .from(users);
  return query?.trim()
    ? base
        .where(or(like(users.displayName, `%${query}%`), like(users.email, `%${query}%`), like(users.username, `%${query}%`)))
        .limit(50)
        .all()
    : base.orderBy(desc(users.createdAt)).limit(50).all();
}

export function setUserRole(adminId: string, userId: string, role: "admin" | "moderator", grant: boolean): void {
  const db = getDb();
  db.update(users).set(role === "admin" ? { isAdmin: grant } : { isModerator: grant }).where(eq(users.id, userId)).run();
  audit({ actorId: adminId, action: "user.role_changed", targetType: "user", targetId: userId, metadata: { role, grant } });
}

export function auditTrail(limit = 100) {
  return getDb()
    .select({ log: auditLogs, actorName: users.displayName, actorUsername: users.username })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .all();
}

export function storyReviewQueue() {
  return getDb()
    .select({ board: storyboards, projectName: projects.name, authorName: users.displayName })
    .from(storyboards)
    .leftJoin(projects, eq(projects.id, storyboards.projectId))
    .innerJoin(users, eq(users.id, storyboards.createdBy))
    .where(eq(storyboards.status, "in_review"))
    .orderBy(desc(storyboards.updatedAt))
    .all();
}

export function assertModerator(user: { isAdmin: boolean; isModerator: boolean }): void {
  if (!user.isAdmin && !user.isModerator) throw new ForbiddenError("Administrator or moderator role required.");
}

export function reportCountsByReason() {
  return getDb()
    .select({ reason: reports.reasonCode, total: sql<number>`count(*)` })
    .from(reports)
    .groupBy(reports.reasonCode)
    .all()
    .map((row) => ({ reason: row.reason, total: Number(row.total) }));
}
