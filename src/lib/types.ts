/**
 * Shared domain vocabulary.
 *
 * These string unions are the single source of truth for status values. They are
 * enforced in the database through Drizzle's `$type<>()`, in the server layer
 * through Zod enums, and in the UI through the label maps at the bottom.
 */

/* ------------------------------- identity -------------------------------- */

export const USER_ROLES = ["creator", "contributor", "learner", "educator", "business"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_GOALS = [
  "build_projects",
  "contribute",
  "learn",
  "teach",
  "grow_audience",
  "grow_business",
] as const;
export type UserGoal = (typeof USER_GOALS)[number];

export const PROJECT_CATEGORIES = [
  "software",
  "design",
  "hardware",
  "research",
  "media",
  "business",
  "education",
  "community",
  "sustainability",
  "health",
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const BUSINESS_ROLES = ["owner", "admin", "member"] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

/* -------------------------------- projects -------------------------------- */

export const PROJECT_STAGES = [
  "idea",
  "research",
  "prototype",
  "building",
  "testing",
  "launched",
  "completed",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const VISIBILITIES = ["public", "private", "invite_only"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const WORK_MODES = ["remote", "local", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const COMPENSATION_TYPES = ["unpaid", "paid", "equity", "revenue_share", "negotiable"] as const;
export type CompensationType = (typeof COMPENSATION_TYPES)[number];

export const PROJECT_STATUSES = ["draft", "published", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_ROLES = ["owner", "admin", "collaborator", "reviewer", "observer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const MEMBER_STATUSES = ["active", "removed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MILESTONE_STATUSES = ["pending", "in_progress", "completed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/* ---------------------------------- tasks --------------------------------- */

export const TASK_STATUSES = [
  "draft",
  "open",
  "reviewing_interest",
  "assigned",
  "in_progress",
  "submitted",
  "revision_requested",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const SUBMISSION_STATUSES = ["submitted", "accepted", "revision_requested"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const EOI_INTENTS = ["contribute", "discuss", "join_team", "help_task", "feedback"] as const;
export type EoiIntent = (typeof EOI_INTENTS)[number];

export const EOI_STATUSES = ["new", "reviewing", "accepted", "declined", "withdrawn"] as const;
export type EoiStatus = (typeof EOI_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["active", "removed"] as const;

export const WORK_LOG_KINDS = [
  "note",
  "image",
  "link",
  "decision",
  "experiment",
  "challenge",
  "revision",
  "deliverable",
  "lesson",
] as const;
export type WorkLogKind = (typeof WORK_LOG_KINDS)[number];

export const WORK_LOG_VISIBILITIES = ["private", "team", "public_pending", "public"] as const;
export type WorkLogVisibility = (typeof WORK_LOG_VISIBILITIES)[number];

/* --------------------------------- content -------------------------------- */

export const FEED_KINDS = [
  "project_update",
  "milestone",
  "lesson",
  "story",
  "question",
  "launch",
  "challenge",
  "general",
] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export const FEED_FILTERS = ["for_you", "following", "projects", "learning", "updates"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

export const RESOURCE_FORMATS = ["video", "story", "article", "course", "workshop", "resource_pack"] as const;
export type ResourceFormat = (typeof RESOURCE_FORMATS)[number];

export const RESOURCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ResourceLevel = (typeof RESOURCE_LEVELS)[number];

export const RESOURCE_STATUSES = ["draft", "published", "scheduled", "archived"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const JOURNEY_STATUSES = ["draft", "review", "approved", "published"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const JOURNEY_STEP_KINDS = ["context", "decision", "experiment", "challenge", "outcome", "lesson"] as const;
export type JourneyStepKind = (typeof JOURNEY_STEP_KINDS)[number];

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;

/* --------------------------------- stories -------------------------------- */

export const STORY_STATUSES = ["draft", "in_review", "approved", "published", "rejected"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const FACT_STATUSES = ["documented", "needs_review", "unsupported"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const MEDIA_STATUSES = ["queued", "processing", "ready", "failed"] as const;

/* -------------------------------- moderation ------------------------------ */

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "impersonation",
  "misattribution",
  "unsafe_content",
  "ip_violation",
  "misleading_claims",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "triaging", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MODERATION_ACTIONS = [
  "dismiss",
  "warn",
  "hide_content",
  "restrict_account",
  "suspend_account",
  "reinstate",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const DISPUTE_STATUSES = ["open", "under_review", "resolved", "rejected"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const ATTRIBUTION_STATUSES = ["proposed", "confirmed", "disputed", "corrected"] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export const VERIFICATION_METHODS = ["owner_confirmed", "self_reported", "platform_reviewed"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/* -------------------------------- reputation ------------------------------ */

export const REPUTATION_DIMENSIONS = ["contribution", "expertise", "teaching", "influence"] as const;
export type ReputationDimension = (typeof REPUTATION_DIMENSIONS)[number];

/* ------------------------------- notifications ---------------------------- */

export const NOTIFICATION_KINDS = [
  "message",
  "interest_received",
  "interest_answered",
  "invitation",
  "task_assigned",
  "task_deadline",
  "submission_received",
  "submission_reviewed",
  "contribution_confirmed",
  "comment",
  "mention",
  "new_follower",
  "learning_sale",
  "learning_feedback",
  "story_approval",
  "moderation",
  "security",
  "system",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/* --------------------------------- labels --------------------------------- */

export const LABELS: Record<string, string> = {
  // stages
  idea: "Idea",
  research: "Research",
  prototype: "Prototype",
  building: "Building",
  testing: "Testing",
  launched: "Launched",
  completed: "Completed",
  // statuses
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  open: "Open",
  reviewing_interest: "Reviewing interest",
  assigned: "Assigned",
  in_progress: "In progress",
  submitted: "Submitted",
  revision_requested: "Revision requested",
  cancelled: "Cancelled",
  pending: "Pending",
  reviewed: "Reviewed",
  new: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  active: "Active",
  removed: "Removed",
  proposed: "Proposed",
  confirmed: "Confirmed",
  disputed: "Disputed",
  corrected: "Corrected",
  private: "Private",
  public: "Public",
  public_pending: "Awaiting approval",
  team: "Team only",
  invite_only: "Invite only",
  remote: "Remote",
  local: "On site",
  hybrid: "Hybrid",
  unpaid: "Unpaid",
  paid: "Paid",
  equity: "Equity",
  revenue_share: "Revenue share",
  negotiable: "Negotiable",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  review: "Review",
  triaging: "Triaging",
  resolved: "Resolved",
  dismissed: "Dismissed",
  under_review: "Under review",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  video: "Video",
  story: "Animated story",
  article: "Article",
  course: "Course",
  workshop: "Workshop",
  resource_pack: "Resource pack",
  documented: "Documented",
  needs_review: "Needs review",
  unsupported: "Unsupported",
  // intents
  contribute: "I want to contribute",
  discuss: "I want to discuss the idea",
  join_team: "I want to join the team",
  help_task: "I can help with a specific task",
  feedback: "Feedback or a useful connection",
  // dimensions
  contribution: "Contribution",
  expertise: "Expertise",
  teaching: "Teaching quality",
  influence: "Influence",
  // goals
  build_projects: "Build projects",
  learn: "Learn",
  teach: "Teach",
  grow_audience: "Grow an audience",
  grow_business: "Grow a business",
  // categories
  software: "Software",
  design: "Design",
  hardware: "Hardware",
  business: "Business",
  education: "Education",
  community: "Community",
  sustainability: "Sustainability",
  health: "Health",
  media: "Media",
  // report reasons
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  misattribution: "Misattribution",
  unsafe_content: "Unsafe content",
  ip_violation: "Intellectual property",
  misleading_claims: "Misleading claims",
  other: "Other",
};

export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
