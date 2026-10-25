import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  blockedUsers,
  conversationMembers,
  conversations,
  entitlements,
  learningResources,
  projectMembers,
  projects,
  taskAssignments,
  tasks,
  users,
  type Project,
  type Task,
} from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";
import type { ProjectRole } from "@/lib/types";

export type Viewer = { id: string; isAdmin?: boolean; isModerator?: boolean } | null;

export type ProjectAccess = {
  project: Project;
  viewerId: string | null;
  isOwner: boolean;
  isMember: boolean;
  role: ProjectRole | null;
  canView: boolean;
  canEdit: boolean;
  canManageTeam: boolean;
  canReview: boolean;
  canViewWorkspace: boolean;
  canManageStory: boolean;
};

/**
 * Central project authorization decision.
 *
 * Deliberately does NOT grant platform admins access to private project content:
 * moderation works on reports and metadata, not on confidential material.
 */
export function getProjectAccess(projectId: string, viewer: Viewer): ProjectAccess | null {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return null;

  const membership = viewer
    ? db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, viewer.id),
            eq(projectMembers.status, "active"),
          ),
        )
        .get()
    : undefined;

  const isOwner = !!viewer && project.ownerId === viewer.id;
  const isMember = isOwner || !!membership;
  const role: ProjectRole | null = isOwner ? "owner" : (membership?.role ?? null);
  const isDraft = project.status !== "published";

  let canView = project.visibility === "public" && !isDraft;
  if (project.visibility === "invite_only") canView = true; // limited view, interest still possible
  if (isMember) canView = true;
  if (isDraft && !isMember) canView = false;
  if (project.visibility === "private" && !isMember) canView = false;

  const privileged = role === "owner" || role === "admin";

  return {
    project,
    viewerId: viewer?.id ?? null,
    isOwner,
    isMember,
    role,
    canView,
    canEdit: privileged,
    canManageTeam: privileged,
    canReview: privileged || role === "reviewer",
    canViewWorkspace: isMember,
    canManageStory: privileged,
  };
}

export function requireProjectAccess(
  projectId: string,
  viewer: Viewer,
  level: "view" | "edit" | "team" | "review" | "story" = "view",
): ProjectAccess {
  const access = getProjectAccess(projectId, viewer);
  // A private project should not reveal its existence to outsiders.
  if (!access) throw new NotFoundError("Project not found.");
  if (level === "view" && !access.canView) {
    throw new NotFoundError("Project not found.");
  }
  if (level === "edit" && !access.canEdit) throw new ForbiddenError("Only project owners and admins can do that.");
  if (level === "team" && !access.canViewWorkspace) throw new ForbiddenError("Only accepted project members can access this.");
  if (level === "review" && !access.canReview) throw new ForbiddenError("Only project reviewers can do that.");
  if (level === "story" && !access.canManageStory) throw new ForbiddenError("Only project owners can manage stories.");
  if (!access.canView) throw new NotFoundError("Project not found.");
  return access;
}

export type TaskAccess = {
  task: Task;
  projectAccess: ProjectAccess;
  isAssignee: boolean;
  canView: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canViewWorkspace: boolean;
};

export function getTaskAccess(taskId: string, viewer: Viewer): TaskAccess | null {
  const db = getDb();
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return null;

  const projectAccess = getProjectAccess(task.projectId, viewer);
  if (!projectAccess) return null;

  const assignment = viewer
    ? db
        .select()
        .from(taskAssignments)
        .where(
          and(
            eq(taskAssignments.taskId, taskId),
            eq(taskAssignments.userId, viewer.id),
            eq(taskAssignments.status, "active"),
          ),
        )
        .get()
    : undefined;

  const isAssignee = !!assignment;
  const taskIsPublic = task.visibility === "public" && task.status !== "draft";
  const canView =
    projectAccess.canViewWorkspace || (taskIsPublic && projectAccess.canView);

  return {
    task,
    projectAccess,
    isAssignee,
    canView,
    canEdit: projectAccess.canEdit,
    canSubmit:
      isAssignee &&
      ["assigned", "in_progress", "revision_requested"].includes(task.status),
    canReview: projectAccess.canReview,
    canViewWorkspace: isAssignee || projectAccess.canReview,
  };
}

export function requireTaskAccess(taskId: string, viewer: Viewer, level: "view" | "submit" | "review" | "workspace" | "edit" = "view"): TaskAccess {
  const access = getTaskAccess(taskId, viewer);
  if (!access) throw new NotFoundError("Task not found.");
  if (!access.canView) throw new NotFoundError("Task not found.");
  if (level === "submit" && !access.canSubmit) {
    throw new ForbiddenError("Only the assigned contributor can submit work for this task.");
  }
  if (level === "review" && !access.canReview) throw new ForbiddenError("Only project reviewers can review submissions.");
  if (level === "workspace" && !access.canViewWorkspace) {
    throw new ForbiddenError("Only the assigned contributor and project team can open this workspace.");
  }
  if (level === "edit" && !access.canEdit) throw new ForbiddenError("Only the project owner can edit tasks.");
  return access;
}

/** Active membership of a conversation. */
export function assertConversationMember(conversationId: string, userId: string) {
  const db = getDb();
  const conversation = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  if (!conversation) throw new NotFoundError("Conversation not found.");
  const member = db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .get();
  if (!member || member.removedAt) throw new NotFoundError("Conversation not found.");
  return { conversation, member };
}

export function hasEntitlement(userId: string, resourceId: string): boolean {
  const db = getDb();
  const resource = db.select().from(learningResources).where(eq(learningResources.id, resourceId)).get();
  if (!resource) return false;
  if (resource.creatorId === userId) return true;
  if (resource.priceCents <= 0) return true;

  const now = new Date().toISOString();
  // Expiry is compared in JS so the query stays portable across SQL engines.
  const grants = db
    .select({ expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.resourceId, resourceId), isNull(entitlements.revokedAt)))
    .all();
  return grants.some((grant) => !grant.expiresAt || grant.expiresAt > now);
}

export function canViewProfile(
  targetUserId: string,
  viewer: Viewer,
  preferences: { profileVisibility: { contributions: boolean; learning: boolean; followers: boolean } } | null,
): { profile: boolean; contributions: boolean; learning: boolean; followers: boolean; email: boolean } {
  const isSelf = viewer?.id === targetUserId;
  const isStaff = !!viewer?.isAdmin || !!viewer?.isModerator;
  if (isSelf || isStaff) {
    return { profile: true, contributions: true, learning: true, followers: true, email: true };
  }
  const prefs = preferences?.profileVisibility ?? { contributions: true, learning: true, followers: true };
  return {
    profile: true,
    contributions: prefs.contributions,
    learning: prefs.learning,
    followers: prefs.followers,
    email: false,
  };
}

export function assertNotSuspended(user: { status: string }): void {
  if (user.status === "suspended") throw new ForbiddenError("Your account is suspended.");
}

export function isBlockedEitherWay(a: string, b: string): boolean {
  const db = getDb();
  const rows = db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, a), eq(blockedUsers.blockedId, b)),
        and(eq(blockedUsers.blockerId, b), eq(blockedUsers.blockedId, a)),
      ),
    )
    .all();
  return rows.length > 0;
}

/** Users may not act on behalf of an account they do not own unless granted a role. */
export function assertSelf(user: Viewer, ownerId: string, extraRole?: string | null): void {
  if (user?.id === ownerId) return;
  if (user?.isAdmin) return;
  if (extraRole === "owner" || extraRole === "admin") return;
  throw new ForbiddenError();
}

export function userExists(userId: string): boolean {
  return !!getDb().select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
}
