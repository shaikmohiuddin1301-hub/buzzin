import { randomUUID } from "node:crypto";
/**
 * BuildTogether relational schema (Drizzle ORM, SQLite dialect).
 *
 * Conventions
 *  - Primary keys are UUID strings generated in the application layer.
 *  - Timestamps are ISO-8601 UTC strings (lexicographically sortable in SQLite).
 *  - Money is stored in minor units (integer cents) with an ISO-4217 currency.
 *  - Soft state changes use status columns rather than destructive deletes so that
 *    audit trails and moderation history stay intact.
 *  - The dialect is SQLite for local/self-hosted deployments. Column types are
 *    deliberately portable (text/integer only) so the schema can move to
 *    PostgreSQL by swapping the driver; see docs/DEPLOYMENT.md.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  AttributionStatus,
  BusinessRole,
  CompensationType,
  DisputeStatus,
  EoiIntent,
  EoiStatus,
  FactStatus,
  FeedKind,
  JourneyStatus,
  MilestoneStatus,
  ModerationAction,
  ProjectCategory,
  ProjectRole,
  ProjectStage,
  ProjectStatus,
  ReputationDimension,
  ResourceFormat,
  ResourceLevel,
  ResourceStatus,
  StoryStatus,
  SubmissionStatus,
  TaskStatus,
  UserGoal,
  UserRole,
  VerificationMethod,
  Visibility,
  WorkLogKind,
  WorkLogVisibility,
  WorkMode,
  ReportReason,
  ReportStatus,
} from "@/lib/types";

const uuid = (column = "id") =>
  text(column)
    .primaryKey()
    .$defaultFn(() => randomUUID());

const now = () => new Date().toISOString();
const createdAt = () => text("created_at").notNull().$defaultFn(now);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(now)
    .$onUpdateFn(now);

/* ------------------------------- identity --------------------------------- */

export const users = sqliteTable(
  "users",
  {
    id: uuid(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    avatarUrl: text("avatar_url"),
    avatarFileId: text("avatar_file_id"),
    bio: text("bio"),
    location: text("location"),
    timezone: text("timezone"),
    portfolioUrls: text("portfolio_urls", { mode: "json" }).$type<string[]>().default([]),
    goals: text("goals", { mode: "json" }).$type<UserGoal[]>().default([]),
    onboardingCompletedAt: text("onboarding_completed_at"),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    isModerator: integer("is_moderator", { mode: "boolean" }).notNull().default(false),
    status: text("status").$type<"active" | "restricted" | "suspended" | "deleted">().notNull().default("active"),
    suspendedReason: text("suspended_reason"),
    lastSeenAt: text("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_status_idx").on(t.status),
  ],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<UserRole>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_roles_uq").on(t.userId, t.role)],
);

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  profileVisibility: text("profile_visibility", { mode: "json" })
    .$type<{ contributions: boolean; learning: boolean; followers: boolean }>()
    .notNull()
    .default({ contributions: true, learning: true, followers: true }),
  allowDirectMessages: text("allow_direct_messages").$type<"everyone" | "project_members" | "nobody">().notNull().default("project_members"),
  showEmail: integer("show_email", { mode: "boolean" }).notNull().default(false),
  notifyEmail: integer("notify_email", { mode: "boolean" }).notNull().default(true),
  notifyMatrix: text("notify_matrix", { mode: "json" }).$type<Record<string, boolean>>().notNull().default({}),
  categories: text("categories", { mode: "json" }).$type<string[]>().notNull().default([]),
  interests: text("interests", { mode: "json" }).$type<string[]>().notNull().default([]),
  reduceMotion: integer("reduce_motion", { mode: "boolean" }).notNull().default(false),
  /** Completed learning history is private unless the learner opts in. */
  shareLearningHistory: integer("share_learning_history", { mode: "boolean" }).notNull().default(false),
  theme: text("theme").$type<"light" | "dark" | "system">().notNull().default("system"),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the session token; raw token only in the cookie
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.expiresAt)],
);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(), // sha256 of the token
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"verify_email" | "reset_password">().notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.kind)],
);

export const skills = sqliteTable(
  "skills",
  {
    id: uuid(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("skills_slug_uq").on(t.slug)],
);

export const userSkills = sqliteTable(
  "user_skills",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
    level: text("level").$type<ResourceLevel>().notNull().default("beginner"),
    evidenceCount: integer("evidence_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_skills_uq").on(t.userId, t.skillId)],
);

/* -------------------------------- businesses ------------------------------- */

export const businesses = sqliteTable(
  "businesses",
  {
    id: uuid(),
    ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    industry: text("industry"),
    website: text("website"),
    logoFileId: text("logo_file_id"),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("businesses_slug_uq").on(t.slug), index("businesses_owner_idx").on(t.ownerId)],
);

export const businessMembers = sqliteTable(
  "business_members",
  {
    id: uuid(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<BusinessRole>().notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("business_members_uq").on(t.businessId, t.userId)],
);

/* ---------------------------------- media ---------------------------------- */

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: uuid(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    projectId: text("project_id"),
    taskId: text("task_id"),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum"),
    visibility: text("visibility").$type<Visibility>().notNull().default("private"),
    createdAt: createdAt(),
  },
  (t) => [index("media_owner_idx").on(t.ownerId), index("media_project_idx").on(t.projectId)],
);

/* -------------------------------- projects -------------------------------- */

export const projects = sqliteTable(
  "projects",
  {
    id: uuid(),
    ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessId: text("business_id").references(() => businesses.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description").notNull(),
    overview: text("overview"),
    problem: text("problem"),
    audience: text("audience"),
    category: text("category").$type<ProjectCategory>().notNull(),
    stage: text("stage").$type<ProjectStage>().notNull().default("idea"),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    workMode: text("work_mode").$type<WorkMode>().notNull().default("remote"),
    effort: text("effort"),
    deadline: text("deadline"),
    compensationType: text("compensation_type").$type<CompensationType>().notNull().default("unpaid"),
    compensationDetails: text("compensation_details"),
    allowPublicDocs: integer("allow_public_docs", { mode: "boolean" }).notNull().default(false),
    confidentialityNotes: text("confidentiality_notes"),
    ipNotes: text("ip_notes"),
    links: text("links", { mode: "json" }).$type<{ label: string; url: string }[]>().default([]),
    coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    status: text("status").$type<ProjectStatus>().notNull().default("draft"),
    publishedAt: text("published_at"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("projects_slug_uq").on(t.slug),
    index("projects_owner_idx").on(t.ownerId),
    index("projects_status_idx").on(t.status, t.visibility),
    index("projects_category_idx").on(t.category),
    index("projects_business_idx").on(t.businessId),
  ],
);

export const projectSkills = sqliteTable(
  "project_skills",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("project_skills_uq").on(t.projectId, t.skillId)],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<ProjectRole>().notNull().default("collaborator"),
    title: text("title"),
    status: text("status").$type<"active" | "removed">().notNull().default("active"),
    invitedBy: text("invited_by"),
    joinedAt: text("joined_at").notNull().$defaultFn(now),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("project_members_uq").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId, t.status),
  ],
);

export const projectInvitations = sqliteTable(
  "project_invitations",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    inviteeId: text("invitee_id").references(() => users.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email"),
    role: text("role").$type<ProjectRole>().notNull().default("collaborator"),
    message: text("message"),
    status: text("status").$type<"pending" | "accepted" | "declined" | "revoked">().notNull().default("pending"),
    createdAt: createdAt(),
    respondedAt: text("responded_at"),
  },
  (t) => [index("project_invitations_invitee_idx").on(t.inviteeId, t.status)],
);

export const projectFollows = sqliteTable(
  "project_follows",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("project_follows_uq").on(t.projectId, t.userId)],
);

export const projectMilestones = sqliteTable(
  "project_milestones",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: text("due_date"),
    status: text("status").$type<MilestoneStatus>().notNull().default("pending"),
    orderIndex: integer("order_index").notNull().default(0),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId, t.orderIndex)],
);

export const projectUpdates = sqliteTable(
  "project_updates",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    createdAt: createdAt(),
  },
  (t) => [index("project_updates_project_idx").on(t.projectId, t.createdAt)],
);

/* ---------------------------------- tasks --------------------------------- */

/**
 * One row per attempt to publish a BuildTogether update to social networks through Ayrshare.
 *
 * The post body is stored because the platform copy can differ from the in-app update (an
 * owner may shorten it), and `remoteId` is kept so a share can be deleted upstream rather
 * than only forgotten locally.
 */
export const socialShares = sqliteTable(
  "social_shares",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    updateId: text("update_id").references(() => projectUpdates.id, { onDelete: "set null" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("ayrshare"),
    platforms: text("platforms", { mode: "json" }).$type<string[]>().notNull(),
    body: text("body").notNull(),
    remoteId: text("remote_id"),
    status: text("status").$type<"pending" | "posted" | "failed" | "deleted">().notNull().default("pending"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("social_shares_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * A named work area inside a project (Design, Development, Research…).
 *
 * It gives Drops a canonical home, owns an optional dedicated chat, and is the
 * grouping used by the Accepted Work collection. Keeping it a project-scoped row
 * (rather than a global role) means two projects can name their areas differently
 * without inventing a second permission system.
 */
export const workAreas = sqliteTable(
  "work_areas",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("work_areas_name_uq").on(t.projectId, t.name), index("work_areas_project_idx").on(t.projectId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    objective: text("objective"),
    deliverablesSpec: text("deliverables_spec"),
    acceptanceCriteria: text("acceptance_criteria"),
    status: text("status").$type<TaskStatus>().notNull().default("draft"),
    effort: text("effort"),
    deadline: text("deadline"),
    compensationType: text("compensation_type").$type<CompensationType>().notNull().default("unpaid"),
    compensationDetails: text("compensation_details"),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    confidentiality: text("confidentiality"),
    workAreaId: text("work_area_id").references(() => workAreas.id, { onDelete: "set null" }),
    publishedAt: text("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId, t.status),
    index("tasks_deadline_idx").on(t.deadline),
  ],
);

export const taskSkills = sqliteTable(
  "task_skills",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("task_skills_uq").on(t.taskId, t.skillId)],
);

export const taskAssignments = sqliteTable(
  "task_assignments",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<"active" | "removed">().notNull().default("active"),
    responsibilities: text("responsibilities"),
    scopeConfirmedAt: text("scope_confirmed_at"),
    assignedAt: text("assigned_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("task_assignments_uq").on(t.taskId, t.userId, t.status)],
);

export const expressionsOfInterest = sqliteTable(
  "expressions_of_interest",
  {
    id: uuid(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    intent: text("intent").$type<EoiIntent>().notNull(),
    message: text("message"),
    workSamples: text("work_samples", { mode: "json" }).$type<{ label: string; url: string }[]>().default([]),
    status: text("status").$type<EoiStatus>().notNull().default("new"),
    responseMessage: text("response_message"),
    reviewedBy: text("reviewed_by"),
    createdAt: createdAt(),
    respondedAt: text("responded_at"),
  },
  (t) => [
    index("eoi_project_idx").on(t.projectId, t.status),
    index("eoi_user_idx").on(t.userId),
    uniqueIndex("eoi_task_user_uq").on(t.taskId, t.userId),
  ],
);

export const taskSubmissions = sqliteTable(
  "task_submissions",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    note: text("note"),
    status: text("status").$type<SubmissionStatus>().notNull().default("submitted"),
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    submittedAt: text("submitted_at").notNull().$defaultFn(now),
    reviewedAt: text("reviewed_at"),
  },
  (t) => [index("submissions_task_idx").on(t.taskId, t.status)],
);

export const taskReviews = sqliteTable(
  "task_reviews",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull().references(() => taskSubmissions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").$type<"accepted" | "revision_requested">().notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("task_reviews_task_idx").on(t.taskId)],
);

/**
 * A simple prerequisite link: `taskId` cannot start until `dependsOnTaskId` is
 * approved. One row per pair, enforced by a unique index, so re-adding the same
 * link cannot create duplicate blockers.
 */
export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("task_dependencies_uq").on(t.taskId, t.dependsOnTaskId),
    index("task_dependencies_prereq_idx").on(t.dependsOnTaskId),
  ],
);

export const deliverables = sqliteTable(
  "deliverables",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").references(() => taskSubmissions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    fileId: text("file_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    url: text("url"),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("deliverables_task_idx").on(t.taskId)],
);

export const workLogEntries = sqliteTable(
  "work_log_entries",
  {
    id: uuid(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<WorkLogKind>().notNull().default("note"),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    fileId: text("file_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    visibility: text("visibility").$type<WorkLogVisibility>().notNull().default("team"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    editHistory: text("edit_history", { mode: "json" }).$type<{ at: string; by: string; summary: string }[]>().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("worklog_task_idx").on(t.taskId, t.createdAt), index("worklog_author_idx").on(t.authorId)],
);

/* ------------------------------- social feed ------------------------------ */

export const posts = sqliteTable(
  "posts",
  {
    id: uuid(),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    resourceId: text("resource_id"),
    kind: text("kind").$type<FeedKind>().notNull().default("general"),
    body: text("body").notNull(),
    imageId: text("image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    /** Drafts belong to their author and never appear in feeds or profiles. */
    status: text("status").$type<"draft" | "published">().notNull().default("published"),
    altText: text("alt_text"),
    hiddenAt: text("hidden_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("posts_created_idx").on(t.createdAt),
    index("posts_author_idx").on(t.authorId),
    index("posts_project_idx").on(t.projectId),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: uuid(),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    targetType: text("target_type").$type<"post" | "project" | "resource" | "task" | "story">().notNull(),
    targetId: text("target_id").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<"visible" | "hidden" | "removed">().notNull().default("visible"),
    createdAt: createdAt(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId, t.createdAt), index("comments_parent_idx").on(t.parentId)],
);

export const reactions = sqliteTable(
  "reactions",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"post" | "comment" | "resource" | "project">().notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").$type<"like" | "celebrate" | "insight">().notNull().default("like"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reactions_uq").on(t.userId, t.targetType, t.targetId, t.kind)],
);

export const follows = sqliteTable(
  "follows",
  {
    id: uuid(),
    followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("follows_uq").on(t.followerId, t.followeeId), index("follows_followee_idx").on(t.followeeId)],
);

export const savedItems = sqliteTable(
  "saved_items",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"post" | "project" | "resource" | "journey" | "task">().notNull(),
    targetId: text("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_items_uq").on(t.userId, t.targetType, t.targetId)],
);

export const savedSearches = sqliteTable(
  "saved_searches",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    query: text("query").notNull(),
    filters: text("filters", { mode: "json" }).$type<Record<string, string>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId)],
);

export const blockedUsers = sqliteTable(
  "blocked_users",
  {
    id: uuid(),
    blockerId: text("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("blocked_users_uq").on(t.blockerId, t.blockedId)],
);

/* ---------------------------------- chat ---------------------------------- */

export const conversations = sqliteTable(
  "conversations",
  {
    id: uuid(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"direct" | "group">().notNull(),
    title: text("title"),
    createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("conversations_project_idx").on(t.projectId)],
);

export const conversationMembers = sqliteTable(
  "conversation_members",
  {
    id: uuid(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"member" | "admin">().notNull().default("member"),
    lastReadAt: text("last_read_at"),
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
    removedAt: text("removed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conversation_members_uq").on(t.conversationId, t.userId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: uuid(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    attachmentId: text("attachment_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    parentId: text("parent_id"),
    taskId: text("task_id"),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt), index("messages_parent_idx").on(t.parentId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    actorId: text("actor_id"),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/* -------------------------------- learning -------------------------------- */

export const learningJourneys = sqliteTable(
  "learning_journeys",
  {
    id: uuid(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").$type<JourneyStatus>().notNull().default("draft"),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    createdAt: createdAt(),
    publishedAt: text("published_at"),
  },
  (t) => [index("journeys_project_idx").on(t.projectId), index("journeys_creator_idx").on(t.creatorId)],
);

export const learningJourneySteps = sqliteTable(
  "learning_journey_steps",
  {
    id: uuid(),
    journeyId: text("journey_id").notNull().references(() => learningJourneys.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("context"),
    sourceType: text("source_type").$type<"work_log" | "task" | "milestone" | "update" | "deliverable" | null>(),
    sourceId: text("source_id"),
    skillId: text("skill_id"),
    createdAt: createdAt(),
  },
  (t) => [index("journey_steps_journey_idx").on(t.journeyId, t.orderIndex)],
);

export const learningResources = sqliteTable(
  "learning_resources",
  {
    id: uuid(),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    journeyId: text("journey_id").references(() => learningJourneys.id, { onDelete: "set null" }),
    storyboardId: text("storyboard_id"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    body: text("body"),
    previewBody: text("preview_body"),
    topic: text("topic"),
    level: text("level").$type<ResourceLevel>().notNull().default("beginner"),
    format: text("format").$type<ResourceFormat>().notNull().default("article"),
    durationMinutes: integer("duration_minutes"),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("GBP"),
    status: text("status").$type<ResourceStatus>().notNull().default("draft"),
    publishedAt: text("published_at"),
    scheduledFor: text("scheduled_for"),
    coverImageId: text("cover_image_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    videoFileId: text("video_file_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    transcript: text("transcript"),
    captions: text("captions"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("resources_slug_uq").on(t.slug),
    index("resources_status_idx").on(t.status, t.publishedAt),
    index("resources_creator_idx").on(t.creatorId),
    index("resources_topic_idx").on(t.topic),
  ],
);

export const courses = sqliteTable(
  "courses",
  {
    id: uuid(),
    resourceId: text("resource_id").notNull().references(() => learningResources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("courses_resource_uq").on(t.resourceId)],
);

export const courseModules = sqliteTable(
  "course_modules",
  {
    id: uuid(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => [index("modules_course_idx").on(t.courseId, t.orderIndex)],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: uuid(),
    moduleId: text("module_id").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    orderIndex: integer("order_index").notNull().default(0),
    isFreePreview: integer("is_free_preview", { mode: "boolean" }).notNull().default(false),
    durationMinutes: integer("duration_minutes"),
    mediaId: text("media_id").references(() => mediaFiles.id, { onDelete: "set null" }),
  },
  (t) => [index("lessons_module_idx").on(t.moduleId, t.orderIndex)],
);

export const exercises = sqliteTable("exercises", {
  id: uuid(),
  lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  hint: text("hint"),
});

export const learningProgress = sqliteTable(
  "learning_progress",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => learningResources.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    progressPct: integer("progress_pct").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("progress_uq").on(t.userId, t.resourceId, t.lessonId)],
);

export const learnerFeedback = sqliteTable(
  "learner_feedback",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => learningResources.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body"),
    status: text("status").$type<"visible" | "hidden">().notNull().default("visible"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("feedback_uq").on(t.userId, t.resourceId)],
);

/* ----------------------------- creator commerce ---------------------------- */

export const creatorProducts = sqliteTable(
  "creator_products",
  {
    id: uuid(),
    creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => learningResources.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    curriculum: text("curriculum", { mode: "json" }).$type<{ title: string; minutes?: number }[]>().default([]),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("GBP"),
    refundPolicy: text("refund_policy"),
    format: text("format").$type<ResourceFormat>().notNull().default("course"),
    status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_creator_idx").on(t.creatorId, t.status)],
);

/**
 * Orders record access grants. Payment processing is intentionally NOT enabled in
 * this build: no card data is collected, no charge is attempted, and `method`
 * documents how access was granted (creator/admin approval or a dev fixture).
 */
export const orders = sqliteTable(
  "orders",
  {
    id: uuid(),
    buyerId: text("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => creatorProducts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("GBP"),
    status: text("status").$type<"pending" | "access_granted" | "cancelled" | "revoked">().notNull().default("pending"),
    method: text("method").$type<"creator_grant" | "admin_grant" | "dev_fixture">().notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_buyer_idx").on(t.buyerId), index("orders_product_idx").on(t.productId)],
);

export const orderItems = sqliteTable("order_items", {
  id: uuid(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => creatorProducts.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
});

export const entitlements = sqliteTable(
  "entitlements",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => creatorProducts.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => learningResources.id, { onDelete: "cascade" }),
    source: text("source").$type<"creator_grant" | "admin_grant" | "dev_fixture">().notNull(),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    grantedBy: text("granted_by"),
    grantedAt: createdAt(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    revokedReason: text("revoked_reason"),
  },
  (t) => [index("entitlements_user_idx").on(t.userId, t.revokedAt), index("entitlements_resource_idx").on(t.resourceId)],
);

/* ------------------------------- attributions ------------------------------ */

export const contributorAttributions = sqliteTable(
  "contributor_attributions",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    submissionId: text("submission_id").references(() => taskSubmissions.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    summary: text("summary"),
    verificationMethod: text("verification_method").$type<VerificationMethod>().notNull().default("owner_confirmed"),
    status: text("status").$type<AttributionStatus>().notNull().default("proposed"),
    evidence: text("evidence"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: text("confirmed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attributions_user_idx").on(t.userId, t.status),
    index("attributions_project_idx").on(t.projectId),
  ],
);

export const reputationEvents = sqliteTable(
  "reputation_events",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dimension: text("dimension").$type<ReputationDimension>().notNull(),
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: createdAt(),
  },
  (t) => [index("reputation_user_idx").on(t.userId, t.dimension)],
);

export const achievements = sqliteTable(
  "achievements",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    earnedAt: createdAt(),
  },
  (t) => [index("achievements_user_idx").on(t.userId)],
);

/* -------------------------------- moderation ------------------------------ */

export const reports = sqliteTable(
  "reports",
  {
    id: uuid(),
    reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"user" | "project" | "post" | "comment" | "resource" | "message" | "story">().notNull(),
    targetId: text("target_id").notNull(),
    reasonCode: text("reason_code").$type<ReportReason>().notNull(),
    details: text("details"),
    status: text("status").$type<ReportStatus>().notNull().default("open"),
    assignedTo: text("assigned_to"),
    resolution: text("resolution"),
    createdAt: createdAt(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt), index("reports_target_idx").on(t.targetType, t.targetId)],
);

export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: uuid(),
    moderatorId: text("moderator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportId: text("report_id").references(() => reports.id, { onDelete: "set null" }),
    action: text("action").$type<ModerationAction>().notNull(),
    reasonCode: text("reason_code").notNull(),
    notes: text("notes"),
    targetUserId: text("target_user_id"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_actions_target_idx").on(t.targetUserId)],
);

export const disputes = sqliteTable(
  "disputes",
  {
    id: uuid(),
    raisedBy: text("raised_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    attributionId: text("attribution_id").references(() => contributorAttributions.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    details: text("details").notNull(),
    status: text("status").$type<DisputeStatus>().notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    createdAt: createdAt(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("disputes_status_idx").on(t.status)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: uuid(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reasonCode: text("reason_code"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_actor_idx").on(t.actorId), index("audit_created_idx").on(t.createdAt)],
);

/* --------------------------------- stories -------------------------------- */

export const storyboards = sqliteTable(
  "storyboards",
  {
    id: uuid(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status").$type<StoryStatus>().notNull().default("draft"),
    version: integer("version").notNull().default(1),
    provider: text("provider").notNull().default("local"),
    visibility: text("visibility").$type<Visibility>().notNull().default("public"),
    transcript: text("transcript"),
    aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(true),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("storyboards_project_idx").on(t.projectId)],
);

export const storyScenes = sqliteTable(
  "story_scenes",
  {
    id: uuid(),
    storyboardId: text("storyboard_id").notNull().references(() => storyboards.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    title: text("title").notNull(),
    narration: text("narration").notNull(),
    visualDescription: text("visual_description"),
    motion: text("motion").notNull().default("fade"),
    durationSeconds: integer("duration_seconds").notNull().default(6),
    sourceType: text("source_type").$type<"work_log" | "milestone" | "update" | "task" | "deliverable" | null>(),
    sourceId: text("source_id"),
    contributors: text("contributors", { mode: "json" }).$type<{ userId: string; name: string }[]>().default([]),
    factStatus: text("fact_status").$type<FactStatus>().notNull().default("documented"),
    aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("scenes_story_idx").on(t.storyboardId, t.orderIndex)],
);

export const generatedMedia = sqliteTable(
  "generated_media",
  {
    id: uuid(),
    storyboardId: text("storyboard_id").notNull().references(() => storyboards.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"video" | "animation" | "narration" | "thumbnail">().notNull(),
    provider: text("provider").notNull(),
    status: text("status").$type<"queued" | "processing" | "ready" | "failed">().notNull().default("queued"),
    fileId: text("file_id").references(() => mediaFiles.id, { onDelete: "set null" }),
    url: text("url"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("generated_media_story_idx").on(t.storyboardId)],
);

export const mediaApprovals = sqliteTable(
  "media_approvals",
  {
    id: uuid(),
    storyboardId: text("storyboard_id").notNull().references(() => storyboards.id, { onDelete: "cascade" }),
    approverId: text("approver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").$type<"approved" | "changes_requested" | "rejected">().notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("media_approvals_story_idx").on(t.storyboardId)],
);

export const consentRecords = sqliteTable(
  "consent_records",
  {
    id: uuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").$type<"public_story" | "voice" | "likeness" | "ai_training">().notNull(),
    projectId: text("project_id"),
    granted: integer("granted", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    grantedAt: createdAt(),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("consent_user_idx").on(t.userId, t.scope)],
);

/* -------------------------------- challenges ------------------------------- */

export const challenges = sqliteTable(
  "challenges",
  {
    id: uuid(),
    hostId: text("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    category: text("category").$type<ProjectCategory>(),
    deadline: text("deadline"),
    status: text("status").$type<"upcoming" | "active" | "closed">().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("challenges_slug_uq").on(t.slug)],
);

/* --------------------------------- analytics ------------------------------ */

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: uuid(),
    kind: text("kind").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    userId: text("user_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, string | number | boolean>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_kind_idx").on(t.kind, t.createdAt), index("analytics_target_idx").on(t.targetType, t.targetId)],
);

/* ----------------------------- exported row types ------------------------- */
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type WorkLogEntry = typeof workLogEntries.$inferSelect;
export type LearningResource = typeof learningResources.$inferSelect;
