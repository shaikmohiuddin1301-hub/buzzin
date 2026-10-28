import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  analyticsEvents,
  businessMembers,
  conversationMembers,
  conversations,
  expressionsOfInterest,
  projectFollows,
  projectInvitations,
  projectMembers,
  projectMilestones,
  projectSkills,
  projectUpdates,
  projects,
  posts,
  skills,
  tasks,
  users,
  type Project,
} from "@/db/schema";
import { getProjectAccess, requireProjectAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { slugify } from "@/lib/format";
import { notify, notifyMany } from "@/lib/notify";
import { getMedia } from "@/lib/storage";
import { awardReputation, REPUTATION_WEIGHTS } from "@/lib/reputation";
import { ensureProjectGroup } from "@/services/chat";
import { upsertSkill } from "@/services/users";
import type { CompensationType, ProjectCategory, ProjectRole, ProjectStage, Visibility, WorkMode } from "@/lib/types";

export type ProjectFilters = {
  q?: string;
  category?: string;
  skill?: string;
  stage?: string;
  workMode?: string;
  compensation?: string;
  effort?: string;
  sort?: "recent" | "active" | "followed";
  limit?: number;
  offset?: number;
};

/** Projects a viewer is allowed to discover. Private projects are excluded. */
export function listProjects(filters: ProjectFilters, viewer: Viewer = null) {
  const db = getDb();
  const conditions = [eq(projects.status, "published"), ne(projects.visibility, "private")];

  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(or(like(projects.name, term), like(projects.shortDescription, term), like(projects.overview, term))!);
  }
  if (filters.category) conditions.push(eq(projects.category, filters.category as ProjectCategory));
  if (filters.stage) conditions.push(eq(projects.stage, filters.stage as ProjectStage));
  if (filters.workMode) conditions.push(eq(projects.workMode, filters.workMode as WorkMode));
  if (filters.compensation) conditions.push(eq(projects.compensationType, filters.compensation as CompensationType));

  if (filters.skill) {
    const skill = db.select({ id: skills.id }).from(skills).where(eq(skills.slug, filters.skill)).get();
    if (!skill) return [];
    conditions.push(
      sql`exists (select 1 from project_skills ps where ps.project_id = ${projects.id} and ps.skill_id = ${skill.id})`,
    );
  }

  const orderBy =
    filters.sort === "active"
      ? desc(projects.viewCount)
      : filters.sort === "followed"
        ? desc(projects.createdAt)
        : desc(projects.publishedAt);

  const rows = db
    .select({
      project: projects,
      owner: { id: users.id, username: users.username, displayName: users.displayName, avatarFileId: users.avatarFileId },
      followers: sql<number>`(select count(*) from project_follows pf where pf.project_id = ${projects.id})`,
      openTasks: sql<number>`(select count(*) from tasks t where t.project_id = ${projects.id} and t.status = 'open')`,
      members: sql<number>`(select count(*) from project_members pm where pm.project_id = ${projects.id} and pm.status = 'active')`,
    })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(filters.limit ?? 24)
    .offset(filters.offset ?? 0)
    .all();

  return rows.map((row) => ({
    ...row.project,
    owner: row.owner,
    followerCount: Number(row.followers),
    openTaskCount: Number(row.openTasks),
    memberCount: Number(row.members),
    isFollowing: viewer ? followState(row.project.id, viewer.id) : false,
  }));
}

export function countProjects(filters: ProjectFilters): number {
  return listProjects({ ...filters, limit: 500 }).length;
}

export function followState(projectId: string, userId: string): boolean {
  return !!getDb()
    .select({ id: projectFollows.id })
    .from(projectFollows)
    .where(and(eq(projectFollows.projectId, projectId), eq(projectFollows.userId, userId)))
    .get();
}

export function toggleProjectFollow(projectId: string, userId: string): boolean {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new NotFoundError("Project not found.");
  const access = getProjectAccess(projectId, { id: userId } as Viewer);
  if (!access?.canView) throw new NotFoundError("Project not found.");

  const existing = db
    .select()
    .from(projectFollows)
    .where(and(eq(projectFollows.projectId, projectId), eq(projectFollows.userId, userId)))
    .get();

  if (existing) {
    db.delete(projectFollows).where(eq(projectFollows.id, existing.id)).run();
    return false;
  }
  db.insert(projectFollows).values({ projectId, userId }).run();
  notify({
    userId: project.ownerId,
    actorId: userId,
    kind: "new_follower",
    title: `Someone is following ${project.name}`,
    href: `/projects/${projectId}`,
    // To follow → unfollow → follow must not produce a second alert for the
    // same relationship. This preference is user-controllable (new_follower).
    dedupeKey: `project_follow:${projectId}:${userId}`,
    entityType: "project",
    entityId: projectId,
  });
  return true;
}

function uniqueSlug(name: string): string {
  const db = getDb();
  const base = slugify(name) || "project";
  let candidate = base;
  let counter = 2;
  while (db.select({ id: projects.id }).from(projects).where(eq(projects.slug, candidate)).get()) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

export type CreateProjectInput = {
  name: string;
  shortDescription: string;
  overview?: string;
  problem?: string;
  audience?: string;
  category: ProjectCategory;
  stage: ProjectStage;
  visibility: Visibility;
  workMode: WorkMode;
  effort?: string;
  deadline?: string;
  compensationType: CompensationType;
  compensationDetails?: string;
  allowPublicDocs: boolean;
  openToCollaborators?: boolean;
  confidentialityNotes?: string;
  ipNotes?: string;
  links: { label: string; url: string }[];
  skills: string[];
  milestones: { title: string; description?: string; dueDate?: string }[];
  publish: boolean;
  businessId?: string | null;
  coverImageId?: string | null;
};

/**
 * A cover must be an image the same person uploaded.
 *
 * Checking ownership here (not only in the action) means no caller can attach another
 * account's file to a project, which would expose private media through a public page.
 */
function assertUsableCover(coverImageId: string, uploaderId: string): void {
  const file = getMedia(coverImageId);
  if (!file) throw new AppError("That cover image no longer exists. Upload it again.");
  if (file.ownerId !== uploaderId) throw new AppError("You can only use an image you uploaded as a project cover.");
  if (!file.mimeType.startsWith("image/")) throw new AppError("A project cover must be an image.");
}

export function createProject(ownerId: string, input: CreateProjectInput): { id: string; slug: string } {
  if (input.name.trim().length < 3) throw new AppError("Project name must be at least 3 characters.");
  if (input.shortDescription.trim().length < 20) {
    throw new AppError("Add a short description of at least 20 characters so people know what they are joining.");
  }
  if (input.coverImageId) assertUsableCover(input.coverImageId, ownerId);

  if (input.businessId) {
    // The form only lists the organisations somebody belongs to; the server checks
    // it too, so a crafted request cannot publish a project under another company.
    const membership = getDb()
      .select({ role: businessMembers.role })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, input.businessId), eq(businessMembers.userId, ownerId)))
      .get();
    if (!membership) throw new ForbiddenError("You can only publish a project for an organisation you belong to.");
    if (membership.role === "member") {
      throw new ForbiddenError("Only business owners and admins can publish projects for the organisation.");
    }
  }

  if (input.publish && input.compensationType === "unpaid") {
    // We allow unpaid collaboration, but the listing must state that it is unpaid
    // and that no employment relationship is implied (see terms).
    if (!input.compensationDetails?.trim()) {
      throw new AppError(
        "For unpaid projects, describe what contributors receive (credit, learning, equity-free collaboration) so the arrangement is clear.",
      );
    }
  }

  const db = getDb();
  const id = randomUUID();
  const slug = uniqueSlug(input.name);
  const now = new Date().toISOString();

  transaction((tx) => {
    tx.insert(projects)
      .values({
        id,
        ownerId,
        businessId: input.businessId ?? null,
        name: input.name.trim().slice(0, 120),
        slug,
        shortDescription: input.shortDescription.trim().slice(0, 240),
        overview: input.overview?.slice(0, 8000) ?? null,
        problem: input.problem?.slice(0, 2000) ?? null,
        audience: input.audience?.slice(0, 400) ?? null,
        category: input.category,
        stage: input.stage,
        visibility: input.visibility,
        workMode: input.workMode,
        effort: input.effort ?? null,
        deadline: input.deadline || null,
        compensationType: input.compensationType,
        compensationDetails: input.compensationDetails?.slice(0, 2000) ?? null,
        allowPublicDocs: input.allowPublicDocs,
        openToCollaborators: input.openToCollaborators ?? true,
        confidentialityNotes: input.confidentialityNotes?.slice(0, 2000) ?? null,
        ipNotes: input.ipNotes?.slice(0, 2000) ?? null,
        links: input.links.filter((link) => link.url),
        coverImageId: input.coverImageId ?? null,
        status: input.publish ? "published" : "draft",
        publishedAt: input.publish ? now : null,
      })
      .run();

    tx.insert(projectMembers).values({ projectId: id, userId: ownerId, role: "owner", status: "active" }).run();

    for (const name of input.skills.slice(0, 12)) {
      const skill = upsertSkill(name);
      if (skill) tx.insert(projectSkills).values({ projectId: id, skillId: skill.id }).onConflictDoNothing().run();
    }

    input.milestones
      .filter((milestone) => milestone.title.trim())
      .slice(0, 12)
      .forEach((milestone, index) => {
        tx.insert(projectMilestones)
          .values({
            projectId: id,
            title: milestone.title.trim().slice(0, 140),
            description: milestone.description?.slice(0, 1000) ?? null,
            dueDate: milestone.dueDate || null,
            orderIndex: index,
          })
          .run();
      });
  });

  return { id, slug };
}

export type QuickProjectInput = {
  name: string;
  goal?: string;
  shortDescription: string;
  visibility: Visibility;
  category?: ProjectCategory;
  skills?: string[];
  coverImageId?: string | null;
  openToCollaborators?: boolean;
  publish?: boolean;
};

/**
 * The four-field project path: create the project, then open its team chat.
 *
 * Defaults are deliberately modest — category "other" instead of guessing,
 * stage "idea", unpaid with a stated non-monetary benefit. The quick path must
 * never claim a budget, a skill set or a milestone that nobody entered.
 */
export function createQuickProject(ownerId: string, input: QuickProjectInput) {
  const { id, slug } = createProject(ownerId, {
    name: input.name,
    shortDescription: input.shortDescription,
    overview: input.goal,
    category: input.category ?? "other",
    stage: "idea",
    visibility: input.visibility,
    workMode: "remote",
    compensationType: "unpaid",
    compensationDetails: "Portfolio credit and a reference. No payment is implied.",
    allowPublicDocs: input.visibility === "public",
    openToCollaborators: input.openToCollaborators ?? true,
    coverImageId: input.coverImageId ?? null,
    links: [],
    skills: input.skills ?? [],
    milestones: [],
    publish: input.publish ?? true,
  });

  const conversationId = ensureProjectGroup(id, ownerId);
  return { id, slug, conversationId };
}

export function updateProject(
  projectId: string,
  viewer: Viewer,
  input: Partial<
    Pick<
      Project,
      | "name"
      | "shortDescription"
      | "overview"
      | "problem"
      | "audience"
      | "stage"
      | "visibility"
      | "workMode"
      | "effort"
      | "deadline"
      | "compensationType"
      | "compensationDetails"
      | "allowPublicDocs"
      | "openToCollaborators"
      | "confidentialityNotes"
      | "ipNotes"
      | "category"
      | "links"
      | "coverImageId"
    >
  >,
): void {
  const access = requireProjectAccess(projectId, viewer, "edit");
  const { coverImageId, ...fields } = input;
  if (coverImageId) {
    if (!viewer) throw new NotFoundError("Project not found.");
    assertUsableCover(coverImageId, viewer.id);
  }
  if (input.visibility === "private" && access.project.visibility !== "private") {
    // Existing public documentation must not be silently hidden; the owner is
    // told to review it first (documented in the confirmation dialog).
    notify({
      userId: access.project.ownerId,
      kind: "system",
      title: "Project visibility changed to private",
      body: "Review published work logs and learning resources linked to this project.",
    });
  }
  getDb()
    .update(projects)
    .set({
      ...fields,
      // `undefined` means "leave the cover alone"; an explicit null removes it.
      ...(coverImageId !== undefined ? { coverImageId } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId))
    .run();
}

export function publishProject(projectId: string, viewer: Viewer): void {
  const access = requireProjectAccess(projectId, viewer, "edit");
  if (access.project.status === "published") return;
  getDb()
    .update(projects)
    .set({ status: "published", publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(projects.id, projectId))
    .run();
}

export function archiveProject(projectId: string, viewer: Viewer): void {
  requireProjectAccess(projectId, viewer, "edit");
  getDb().update(projects).set({ status: "archived" }).where(eq(projects.id, projectId)).run();
}

export function deleteProject(projectId: string, viewer: Viewer, confirmation: string): void {
  const access = requireProjectAccess(projectId, viewer, "edit");
  if (!access.isOwner) throw new AppError("Only the project owner can delete a project.");
  if (confirmation.trim() !== access.project.name) {
    throw new AppError("Type the project name exactly to confirm deletion.");
  }
  getDb().delete(projects).where(eq(projects.id, projectId)).run();
}

export function projectDetail(projectId: string, viewer: Viewer) {
  const db = getDb();
  const access = getProjectAccess(projectId, viewer);
  if (!access || !access.canView) return null;

  const project = access.project;
  const owner = db.select().from(users).where(eq(users.id, project.ownerId)).get();
  const members = db
    .select({
      id: projectMembers.id,
      role: projectMembers.role,
      title: projectMembers.title,
      status: projectMembers.status,
      joinedAt: projectMembers.joinedAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
      bio: users.bio,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.status, "active")))
    .orderBy(asc(projectMembers.joinedAt))
    .all();

  const milestones = db
    .select()
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId))
    .orderBy(asc(projectMilestones.orderIndex))
    .all();

  const updates = db
    .select({
      id: projectUpdates.id,
      title: projectUpdates.title,
      body: projectUpdates.body,
      visibility: projectUpdates.visibility,
      status: projectUpdates.status,
      progressPercent: projectUpdates.progressPercent,
      milestone: projectUpdates.milestone,
      linkUrl: projectUpdates.linkUrl,
      createdAt: projectUpdates.createdAt,
      authorName: users.displayName,
      authorUsername: users.username,
    })
    .from(projectUpdates)
    .innerJoin(users, eq(users.id, projectUpdates.authorId))
    .where(
      and(
        eq(projectUpdates.projectId, projectId),
        // Drafts are visible to the team that can edit; everybody else only ever
        // sees published, public updates.
        access.isMember ? undefined : eq(projectUpdates.visibility, "public"),
        access.canEdit ? undefined : eq(projectUpdates.status, "published"),
      ),
    )
    .orderBy(desc(projectUpdates.createdAt))
    .all();

  const projectSkillRows = db
    .select({ id: skills.id, name: skills.name, slug: skills.slug })
    .from(projectSkills)
    .innerJoin(skills, eq(skills.id, projectSkills.skillId))
    .where(eq(projectSkills.projectId, projectId))
    .all();

  const counts = {
    followers:
      db.select({ count: sql<number>`count(*)` }).from(projectFollows).where(eq(projectFollows.projectId, projectId)).get()?.count ?? 0,
    openTasks:
      db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "open")))
        .get()?.count ?? 0,
  };

  return {
    project,
    access,
    owner: owner ?? null,
    members,
    milestones,
    updates,
    skills: projectSkillRows,
    counts,
    isFollowing: viewer ? followState(projectId, viewer.id) : false,
  };
}

export function recordProjectView(projectId: string, viewerId?: string | null): void {
  const db = getDb();
  db.update(projects)
    .set({ viewCount: sql`${projects.viewCount} + 1` })
    .where(eq(projects.id, projectId))
    .run();
  db.insert(analyticsEvents)
    .values({ kind: "project_view", targetType: "project", targetId: projectId, userId: viewerId ?? null })
    .run();
}

/**
 * Replace the skills a project asks for.
 *
 * Skills power discovery, so a removed skill must stop matching the project; the
 * replacement is a transaction rather than a merge. Names that already exist are
 * reused through `upsertSkill`, never duplicated.
 */
export function replaceProjectSkills(projectId: string, viewer: Viewer, names: string[]): void {
  requireProjectAccess(projectId, viewer, "edit");
  const cleaned = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 12);
  transaction((tx) => {
    tx.delete(projectSkills).where(eq(projectSkills.projectId, projectId)).run();
    for (const name of cleaned) {
      const skill = upsertSkill(name);
      if (skill) tx.insert(projectSkills).values({ projectId, skillId: skill.id }).onConflictDoNothing().run();
    }
  });
}

/** Add milestones the project does not already have, keeping existing ones. */
export function addProjectMilestones(
  projectId: string,
  viewer: Viewer,
  milestones: { title: string; description?: string; dueDate?: string }[],
): void {
  requireProjectAccess(projectId, viewer, "edit");
  const existing = new Set(
    getDb()
      .select({ title: projectMilestones.title })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .all()
      .map((row) => row.title.trim().toLowerCase()),
  );
  for (const milestone of milestones.slice(0, 12)) {
    if (!milestone.title.trim() || existing.has(milestone.title.trim().toLowerCase())) continue;
    addMilestone(projectId, viewer, milestone);
  }
}

export function addMilestone(
  projectId: string,
  viewer: Viewer,
  input: { title: string; description?: string; dueDate?: string },
): void {
  requireProjectAccess(projectId, viewer, "edit");
  if (!input.title.trim()) throw new AppError("Milestone title is required.");
  const db = getDb();
  const max = db
    .select({ value: sql<number>`coalesce(max(${projectMilestones.orderIndex}), 0)` })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId))
    .get();
  db.insert(projectMilestones)
    .values({
      projectId,
      title: input.title.trim().slice(0, 140),
      description: input.description?.slice(0, 1000) ?? null,
      dueDate: input.dueDate || null,
      orderIndex: Number(max?.value ?? 0) + 1,
    })
    .run();
}

export function setMilestoneStatus(
  milestoneId: string,
  viewer: Viewer,
  status: "pending" | "in_progress" | "completed",
): void {
  const db = getDb();
  const milestone = db.select().from(projectMilestones).where(eq(projectMilestones.id, milestoneId)).get();
  if (!milestone) throw new NotFoundError("Milestone not found.");
  requireProjectAccess(milestone.projectId, viewer, "edit");
  db.update(projectMilestones)
    .set({ status, completedAt: status === "completed" ? new Date().toISOString() : null })
    .where(eq(projectMilestones.id, milestoneId))
    .run();
  if (status === "completed") {
    awardReputation({
      userId: viewer!.id,
      dimension: "contribution",
      points: REPUTATION_WEIGHTS.contribution.milestone_completed,
      reason: `Milestone completed: ${milestone.title}`,
      sourceType: "milestone",
      sourceId: milestone.id,
    });
  }
}

export function postProjectUpdate(
  projectId: string,
  viewer: Viewer,
  input: {
    title: string;
    body: string;
    visibility: Visibility;
    /** A draft is kept for the team and never mirrored into the feed. */
    publish?: boolean;
    progressPercent?: number | null;
    milestone?: string | null;
    linkUrl?: string | null;
  },
): string {
  requireProjectAccess(projectId, viewer, "edit");
  if (input.title.trim().length < 3) throw new AppError("Give the update a short title.");
  if (input.body.trim().length < 10) throw new AppError("Write a little more detail in the update.");
  if (input.progressPercent !== null && input.progressPercent !== undefined) {
    if (!Number.isInteger(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100) {
      throw new AppError("Progress must be a whole number between 0 and 100.");
    }
  }
  if (input.linkUrl && !/^https?:\/\/\S+$/i.test(input.linkUrl.trim())) {
    throw new AppError("The supporting link needs a full address starting with http:// or https://.");
  }
  const publish = input.publish ?? true;

  const db = getDb();
  const id = randomUUID();
  const project = db.select({ name: projects.name, visibility: projects.visibility }).from(projects).where(eq(projects.id, projectId)).get();
  transaction((tx) => {
    tx.insert(projectUpdates)
      .values({
        id,
        projectId,
        authorId: viewer!.id,
        title: input.title.trim().slice(0, 140),
        body: input.body.slice(0, 6000),
        visibility: input.visibility,
        status: publish ? "published" : "draft",
        progressPercent: input.progressPercent ?? null,
        milestone: input.milestone?.trim().slice(0, 140) || null,
        linkUrl: input.linkUrl?.trim() || null,
      })
      .run();
    if (publish && input.visibility === "public") {
      tx.insert(posts)
        .values({
          authorId: viewer!.id,
          projectId,
          kind: "project_update",
          title: input.title.trim().slice(0, 140),
          linkUrl: input.linkUrl?.trim() || null,
          body: input.body.slice(0, 4000),
        })
        .run();
    }
  });

  // Notifications are written after the update exists, so a failed insert cannot
  // announce an update that was rolled back. Only a published, public update on a
  // public project is announced to followers: a draft announces nothing.
  if (publish && input.visibility === "public" && project?.visibility === "public") {
    const followerIds = db
      .select({ userId: projectFollows.userId })
      .from(projectFollows)
      .where(eq(projectFollows.projectId, projectId))
      .all()
      .map((row) => row.userId);
    notifyMany(followerIds, {
      actorId: viewer!.id,
      kind: "project_update",
      title: `New update on ${project.name}`,
      href: `/projects/${projectId}?tab=progress`,
      dedupeKey: `project_update:${id}`,
      entityType: "project_update",
      entityId: id,
    });
  }
  return id;
}

export function inviteToProject(
  projectId: string,
  viewer: Viewer,
  input: { userId?: string; email?: string; role: ProjectRole; message?: string },
): void {
  requireProjectAccess(projectId, viewer, "edit");
  if (!input.userId && !input.email) throw new AppError("Choose a person or enter an email address.");
  if (input.role === "owner") throw new AppError("Ownership transfers are not supported from invitations.");

  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()!;
  if (input.userId) {
    const already = db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, input.userId)))
      .get();
    if (already) throw new AppError("That person is already on the team.");
  }

  if (input.userId) {
    const pending = db
      .select({ id: projectInvitations.id })
      .from(projectInvitations)
      .where(
        and(
          eq(projectInvitations.projectId, projectId),
          eq(projectInvitations.inviteeId, input.userId),
          eq(projectInvitations.status, "pending"),
        ),
      )
      .get();
    if (pending) throw new AppError("That person already has a pending invitation.", { status: 409, code: "invitation_pending" });
  }

  const invitationId = randomUUID();
  db.insert(projectInvitations)
    .values({
      id: invitationId,
      projectId,
      inviterId: viewer!.id,
      inviteeId: input.userId ?? null,
      inviteeEmail: input.email?.toLowerCase() ?? null,
      role: input.role,
      message: input.message?.slice(0, 600) ?? null,
    })
    .run();

  if (input.userId) {
    notify({
      userId: input.userId,
      actorId: viewer!.id,
      kind: "invitation",
      title: `Invitation to join ${project.name}`,
      // The invitation note stays on the invitation itself rather than in a
      // notification preview.
      href: "/notifications",
      dedupeKey: `invitation:${invitationId}`,
      entityType: "invitation",
      entityId: invitationId,
    });
  }
}

export function respondToInvitation(invitationId: string, userId: string, accept: boolean): void {
  const db = getDb();
  const invitation = db.select().from(projectInvitations).where(eq(projectInvitations.id, invitationId)).get();
  if (!invitation || invitation.inviteeId !== userId) throw new NotFoundError("Invitation not found.");
  if (invitation.status !== "pending") throw new AppError("That invitation has already been answered.");

  transaction((tx) => {
    tx.update(projectInvitations)
      .set({ status: accept ? "accepted" : "declined", respondedAt: new Date().toISOString() })
      .where(eq(projectInvitations.id, invitationId))
      .run();
    if (accept) {
      tx.insert(projectMembers)
        .values({
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
          invitedBy: invitation.inviterId,
        })
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: { status: "active", role: invitation.role },
        })
        .run();
    }
  });

  notify({
    userId: invitation.inviterId,
    actorId: userId,
    kind: "invitation",
    title: accept ? "Your project invitation was accepted" : "Your project invitation was declined",
    href: `/projects/${invitation.projectId}?tab=team`,
    dedupeKey: `invitation_response:${invitationId}`,
    entityType: "invitation",
    entityId: invitationId,
  });
}

export function pendingInvitations(userId: string) {
  return getDb()
    .select({
      id: projectInvitations.id,
      role: projectInvitations.role,
      message: projectInvitations.message,
      createdAt: projectInvitations.createdAt,
      projectId: projects.id,
      projectName: projects.name,
      inviterName: users.displayName,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .innerJoin(users, eq(users.id, projectInvitations.inviterId))
    .where(and(eq(projectInvitations.inviteeId, userId), eq(projectInvitations.status, "pending")))
    .all();
}

export function removeMember(projectId: string, viewer: Viewer, memberUserId: string): void {
  const access = requireProjectAccess(projectId, viewer, "edit");
  if (memberUserId === access.project.ownerId) throw new AppError("The project owner cannot be removed.");
  const db = getDb();
  const membership = db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId), eq(projectMembers.status, "active")))
    .get();
  if (!membership) return;
  transaction((tx) => {
    tx.update(projectMembers)
      .set({ status: "removed" })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)))
      .run();
    // Access to the project's private group chat is revoked immediately.
    const groupIds = tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.projectId, projectId))
      .all()
      .map((row) => row.id);
    for (const conversationId of groupIds) {
      tx.update(conversationMembers)
        .set({ removedAt: new Date().toISOString() })
        .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, memberUserId)))
        .run();
    }
    // Remove them from active task assignments without erasing the record.
    tx.run(sql`update task_assignments set status = 'removed' where user_id = ${memberUserId} and status = 'active' and task_id in (select id from tasks where project_id = ${projectId})`);
  });
  notify({
    userId: memberUserId,
    kind: "system",
    title: "You were removed from a project team",
    href: access.project.visibility === "public" ? `/projects/${projectId}` : "/home",
    dedupeKey: `project_removed:${membership.id}`,
    entityType: "project",
    entityId: projectId,
  });
}

export function projectAnalytics(projectId: string, viewer: Viewer) {
  const db = getDb();
  const access = getProjectAccess(projectId, viewer);
  if (!access) throw new NotFoundError("Project not found.");
  if (!access.canEdit) throw new AppError("Only the project owner can view analytics.", { status: 403 });

  const events = db
    .select({ kind: analyticsEvents.kind, createdAt: analyticsEvents.createdAt })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.targetType, "project"), eq(analyticsEvents.targetId, projectId)))
    .all();

  const byDay = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "project_view") continue;
    const day = event.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const followsCount =
    db.select({ count: sql<number>`count(*)` }).from(projectFollows).where(eq(projectFollows.projectId, projectId)).get()?.count ?? 0;

  const interestCount = Number(
    db
      .select({ count: sql<number>`count(*)` })
      .from(expressionsOfInterest)
      .where(eq(expressionsOfInterest.projectId, projectId))
      .get()?.count ?? 0,
  );

  return {
    views: access.project.viewCount,
    follows: Number(followsCount),
    interests: interestCount,
    viewsByDay: [...byDay.entries()].sort().slice(-14).map(([day, count]) => ({ day, count })),
    milestones: db
      .select({ status: projectMilestones.status, count: sql<number>`count(*)` })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .groupBy(projectMilestones.status)
      .all(),
  };
}

export function projectsForUser(userId: string) {
  const db = getDb();
  const owned = db.select().from(projects).where(eq(projects.ownerId, userId)).orderBy(desc(projects.updatedAt)).all();
  const contributed = db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "active"), ne(projects.ownerId, userId)))
    .all()
    .map((row) => row.project);
  return { owned, contributed };
}

export function followedProjects(userId: string) {
  return getDb()
    .select({ project: projects })
    .from(projectFollows)
    .innerJoin(projects, eq(projects.id, projectFollows.projectId))
    .where(eq(projectFollows.userId, userId))
    .orderBy(desc(projectFollows.createdAt))
    .all()
    .map((row) => row.project);
}

export function projectsForBusiness(businessId: string) {
  return getDb().select().from(projects).where(eq(projects.businessId, businessId)).orderBy(desc(projects.createdAt)).all();
}

export function featuredProjects(limit = 6) {
  return listProjects({ sort: "active", limit });
}

export function authorisationSummary(projectId: string, userId: string) {
  const access = getProjectAccess(projectId, { id: userId });
  return access ? { canEdit: access.canEdit, canReview: access.canReview, role: access.role } : null;
}

export function bulkProjects(ids: string[]) {
  if (ids.length === 0) return [];
  return getDb().select().from(projects).where(inArray(projects.id, ids)).all();
}
