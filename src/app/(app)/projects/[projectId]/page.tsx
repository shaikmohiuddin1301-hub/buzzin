import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CalendarDays, ClipboardList, ExternalLink, FolderCheck, FolderKanban, Heart, MessageSquare, Pencil, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { consentRecords, deliverables, storyScenes, tasks, users, workLogEntries } from "@/db/schema";
import {
  addMilestoneAction,
  archiveProjectAction,
  createTaskAction,
  publishProjectAction,
  deleteProjectAction,
  expressInterestAction,
  inviteToProjectAction,
  postProjectUpdateAction,
  removeMemberAction,
  respondToInterestAction,
  setMilestoneStatusAction,
  toggleProjectFollowAction,
  updateProjectAction,
  updateProjectCoverAction,
} from "@/app/actions/projects";
import { openProjectChatAction } from "@/app/actions/chat";
import { deleteShareAction, shareProjectUpdateAction } from "@/app/actions/socialSharing";
import { consentAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { CommentThread } from "@/components/comments";
import { MilestoneRow, MiniBarChart, TaskRow } from "@/components/cards";
import { ReportForm } from "@/components/report-form";
import { StoryPlayer } from "@/components/client/story-player";
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  ButtonLink,
  Card,
  Checkbox,
  DefinitionList,
  Divider,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Progress,
  Select,
  SkillTag,
  Stat,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money, relativeTime, truncate } from "@/lib/format";
import { label } from "@/lib/types";
import { env } from "@/lib/env";
import {
  projectDetail,
  projectAnalytics,
  recordProjectView,
} from "@/services/projects";
import { listTasks, projectInterests } from "@/services/tasks";
import { listComments, reactionState } from "@/services/social";
import { reactAction } from "@/app/actions/social";
import { projectJourneys, resourcesForProject } from "@/services/learning";
import { storyboardsForProject } from "@/services/stories";
import { createWorkAreaAction, openWorkAreaChatAction } from "@/app/actions/workAreas";
import { listWorkAreas } from "@/services/workAreas";
import { listProjectShares } from "@/services/socialShares";
import { SOCIAL_PLATFORMS, platformLabel } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "progress", label: "Progress" },
  { id: "tasks", label: "Tasks" },
  { id: "team", label: "Team" },
  { id: "discussion", label: "Discussion" },
  { id: "learning", label: "Learning" },
  { id: "results", label: "Results" },
];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const detail = projectDetail(projectId, user);
  if (!detail) notFound();

  const { project, access, owner, members, milestones, updates, skills: projectSkillRows, counts, isFollowing } = detail;
  const likeState = reactionState(user.id, "project", projectId);
  const tab = typeof query.tab === "string" && TABS.some((t) => t.id === query.tab) ? query.tab : "overview";
  const returnTo = `/projects/${projectId}?tab=${tab}`;
  const isTeam = access.isMember;

  recordProjectView(projectId, user.id);

  const db = getDb();
  const projectTasks = listTasks(projectId, user);
  const interests = access.canReview ? projectInterests(projectId, user) : [];
  const workAreaList = listWorkAreas(projectId, user);
  const pendingReview = projectTasks.filter((task) => task.status === "submitted").length;
  const openTaskCount = projectTasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length;

  const comments = listComments("project", projectId, user);
  const journeys = projectJourneys(projectId, user);
  const resources = resourcesForProject(projectId, user);
  const socialReady = Boolean(env.ayrshareApiKey);
  const shares = access.canEdit ? listProjectShares(projectId, user) : [];
  const publicUpdates = updates.filter((update) => update.visibility === "public");
  const storyRows = storyboardsForProject(projectId, user);
  const featuredStory = storyRows.find((row) => row.status === "published") ?? null;
  const featuredScenes = featuredStory
    ? db.select().from(storyScenes).where(eq(storyScenes.storyboardId, featuredStory.id)).orderBy(asc(storyScenes.orderIndex)).all()
    : [];

  const approvedDeliverables = db
    .select({ deliverable: deliverables, taskTitle: tasks.title })
    .from(deliverables)
    .innerJoin(tasks, eq(tasks.id, deliverables.taskId))
    .where(and(eq(tasks.projectId, projectId), eq(deliverables.approved, true)))
    .all();

  const nextStep =
    members.length <= 1
      ? "invite"
      : projectTasks.length === 0
        ? "task"
        : pendingReview > 0
          ? "review"
          : approvedDeliverables.length === 0
            ? "accepted"
            : null;

  const lessons = isTeam
    ? db
        .select({ entry: workLogEntries, taskTitle: tasks.title, authorName: users.displayName })
        .from(workLogEntries)
        .innerJoin(tasks, eq(tasks.id, workLogEntries.taskId))
        .innerJoin(users, eq(users.id, workLogEntries.authorId))
        .where(and(eq(tasks.projectId, projectId), eq(workLogEntries.kind, "lesson"), eq(workLogEntries.visibility, "public")))
        .all()
    : [];

  const completedMilestones = milestones.filter((milestone) => milestone.status === "completed");
  const analytics = access.canEdit ? projectAnalytics(projectId, user) : null;

  const consentRows = isTeam
    ? db.select().from(consentRecords).where(and(eq(consentRecords.projectId, projectId), eq(consentRecords.userId, user.id))).all()
    : [];

  const myConsent = consentRows.find((row) => row.scope === "public_story" && !row.revokedAt);

  const isInviteOnlyLimited = project.visibility === "invite_only" && !isTeam;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href="/explore?tab=projects" className="hover:underline">
          Projects
        </Link>{" "}
        / <span className="text-navy-700">{project.name}</span>
      </nav>

      <div className="overflow-hidden card-surface">
        <div className="relative h-40 ink-surface sm:h-56">
          {project.coverImageId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${project.coverImageId}`} alt="" className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="h-full w-full ink-hero" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white sm:p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="brand">{label(project.category)}</Badge>
              <Badge tone="neutral" className="bg-white/15 text-white">
                {label(project.stage)}
              </Badge>
              <Badge tone="neutral" className="bg-white/15 text-white">
                {label(project.workMode)}
              </Badge>
              <StatusBadge status={project.status} />
              {project.visibility !== "public" ? <Badge tone="warning">{label(project.visibility)}</Badge> : null}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-navy-200">{project.shortDescription}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-200 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-navy-500">
            <span className="flex items-center gap-1.5">
              <Avatar name={owner?.displayName ?? "Unknown"} size={22} src={owner?.avatarFileId ? `/api/files/${owner.avatarFileId}` : null} />
              <Link href={`/u/${owner?.username ?? ""}`} className="font-medium text-navy-700 hover:underline">
                {owner?.displayName}
              </Link>
              <span className="text-navy-400">· project lead</span>
            </span>
            <span className="flex items-center gap-1">
              <Users size={13} aria-hidden="true" /> {members.length} on the team
            </span>
            <span className="flex items-center gap-1">
              <Heart size={13} aria-hidden="true" /> {counts.followers} following · {likeState.count} like
              {likeState.count === 1 ? "" : "s"}
            </span>
            <span>{project.viewCount} views</span>
            {project.deadline ? (
              <span className="flex items-center gap-1">
                <CalendarDays size={13} aria-hidden="true" /> target {formatDate(project.deadline)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form action={toggleProjectFollowAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton variant={isFollowing ? "secondary" : "primary"} size="sm" pendingLabel="…">
                {isFollowing ? "Following" : "Follow project"}
              </SubmitButton>
            </form>
            {/* A project like is the same `reactions` record as a post like, so it
                appears on the account's Liked Posts & Projects page. */}
            <form action={reactAction}>
              <input type="hidden" name="targetType" value="project" />
              <input type="hidden" name="targetId" value={projectId} />
              <input type="hidden" name="kind" value="like" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="…">
                <Heart size={13} aria-hidden="true" /> {likeState.mine ? "Liked" : "Like"}
              </SubmitButton>
            </form>
            {!access.isMember ? (
              <details className="relative">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-navy-200 bg-surface px-3 text-[13px] font-medium text-navy-800 hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
                  Express interest
                </summary>
                <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-navy-200 bg-surface p-4 shadow-raised">
                  <form action={expressInterestAction} className="space-y-3">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Field label="What would you like to do?" htmlFor="intent" required>
                      <Select id="intent" name="intent" defaultValue="contribute">
                        <option value="contribute">I want to contribute</option>
                        <option value="discuss">I want to discuss the idea</option>
                        <option value="join_team">I want to join the team</option>
                        <option value="help_task">I can help with a specific task</option>
                        <option value="feedback">I have feedback or a connection</option>
                      </Select>
                    </Field>
                    <Field label="Message (optional)" htmlFor="message">
                      <Textarea id="message" name="message" rows={3} maxLength={2000} placeholder="Relevant experience, availability, or a question." />
                    </Field>
                    <Field label="Work sample URL (optional)" htmlFor="sampleUrl0">
                      <Input id="sampleUrl0" name="sampleUrl0" type="url" placeholder="https://…" />
                    </Field>
                    <SubmitButton size="sm" className="w-full" pendingLabel="Sending…">
                      Send to the owner
                    </SubmitButton>
                    <p className="text-[10px] leading-4 text-navy-400">
                      The owner sees your profile and this note. This is not an employment application.
                    </p>
                  </form>
                </div>
              </details>
            ) : null}
            <ButtonLink href={`/projects/${projectId}/accepted`} variant="secondary" size="sm">
              <FolderCheck size={13} aria-hidden="true" /> Accepted work
            </ButtonLink>
            {access.canReview ? (
              <form action={openProjectChatAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <SubmitButton variant="secondary" size="sm" pendingLabel="…">
                  <MessageSquare size={13} aria-hidden="true" /> Team chat
                </SubmitButton>
              </form>
            ) : null}
            <ReportForm targetType="project" targetId={projectId} returnTo={returnTo} />
          </div>
        </div>

        {access.canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-200 bg-navy-50/40 px-4 py-2.5 sm:px-6">
            <form action={updateProjectCoverAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <label htmlFor="coverUpload" className="text-[12px] font-medium text-navy-700">
                {project.coverImageId ? "Replace cover" : "Add a cover"}
              </label>
              <input
                id="coverUpload"
                name="cover"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="text-[11px] text-navy-600 file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-navy-100 file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-navy-800"
              />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">
                Save cover
              </SubmitButton>
            </form>
            {project.coverImageId ? (
              <form action={updateProjectCoverAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="removeCover" value="1" />
                <SubmitButton size="sm" variant="ghost" pendingLabel="Removing…">
                  Remove cover
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <Flash error={error} notice={notice} />
      </div>

      {access.canEdit && project.status === "draft" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div>
            <p className="text-[13px] font-semibold text-navy-950">Draft — only you and your team can see this</p>
            <p className="mt-0.5 text-[12px] leading-5 text-navy-600">
              Publish when you are ready and it appears on Explore and your profile. Tasks are optional and can come later.
            </p>
          </div>
          <form action={publishProjectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <SubmitButton size="sm" pendingLabel="Publishing…">
              Publish project
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <Tabs
        current={tab}
        items={[
          ...TABS.map((item) => ({
            id: item.id,
            label: item.label,
            href: `/projects/${projectId}?tab=${item.id}`,
            count: item.id === "tasks" ? projectTasks.length : undefined,
          })),
          ...(access.canEdit ? [{ id: "analytics", label: "Analytics", href: `/projects/${projectId}?tab=analytics` }] : []),
        ]}
      />

      {isInviteOnlyLimited ? (
        <Alert tone="info" title="This project is invite-only">
          You can see the summary and ask to be considered, but the workspace, tasks and documentation are limited to the
          team. If you have a specific skill to offer, use Express interest.
        </Alert>
      ) : null}

      {tab === "overview" && !isInviteOnlyLimited ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {access.canViewWorkspace ? (
              <form action={openProjectChatAction}>
                <button
                  type="submit"
                  className="motion-card flex h-full w-full items-start gap-3 card-surface p-4 text-left shadow-card"
                >
                  <MessageSquare size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
                  <span>
                    <span className="block text-[13px] font-semibold text-navy-950">Chats</span>
                    <span className="block text-[11.5px] leading-5 text-navy-500">Talk and decide, together.</span>
                  </span>
                </button>
              </form>
            ) : (
              <Link href={`/projects/${projectId}?tab=tasks`} className="motion-card flex h-full items-start gap-3 card-surface p-4 shadow-card">
                <MessageSquare size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
                <span>
                  <span className="block text-[13px] font-semibold text-navy-950">Chats</span>
                  <span className="block text-[11.5px] leading-5 text-navy-500">Team only.</span>
                </span>
              </Link>
            )}

            <Link href={`/projects/${projectId}?tab=tasks`} className="motion-card flex h-full items-start gap-3 card-surface p-4 shadow-card">
              <ClipboardList size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                <span className="block text-[13px] font-semibold text-navy-950">Tasks</span>
                <span className="block text-[11.5px] leading-5 text-navy-500">
                  {openTaskCount} open{pendingReview > 0 ? ` · ${pendingReview} to review` : ""}
                </span>
              </span>
            </Link>

            <Link href={`/projects/${projectId}?tab=team`} className="motion-card flex h-full items-start gap-3 card-surface p-4 shadow-card">
              <Users size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                <span className="block text-[13px] font-semibold text-navy-950">Team</span>
                <span className="block text-[11.5px] leading-5 text-navy-500">
                  {members.length} {members.length === 1 ? "person" : "people"}
                  {project.openToCollaborators ? " · open to collaborators" : ""}
                </span>
              </span>
            </Link>

            <Link href={`/projects/${projectId}/accepted`} className="motion-card flex h-full items-start gap-3 card-surface p-4 shadow-card">
              <FolderCheck size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                <span className="block text-[13px] font-semibold text-navy-950">Accepted work</span>
                <span className="block text-[11.5px] leading-5 text-navy-500">
                  {approvedDeliverables.length} {approvedDeliverables.length === 1 ? "deliverable" : "deliverables"}
                </span>
              </span>
            </Link>
          </div>

          {access.canEdit ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-semibold text-navy-950">Next steps</h2>
                  <p className="mt-0.5 text-[12px] text-navy-500">
                    Guidance only — you can work in any order. Nothing here blocks the project.
                  </p>
                </div>
                {nextStep ? (
                  <ButtonLink
                    href={
                      nextStep === "invite"
                        ? `/projects/${projectId}?tab=team`
                        : nextStep === "task"
                          ? `/projects/${projectId}/tasks`
                          : nextStep === "review"
                            ? `/projects/${projectId}/tasks`
                            : `/projects/${projectId}/accepted`
                    }
                    size="sm"
                    variant="secondary"
                  >
                    {nextStep === "invite"
                      ? "Invite a collaborator"
                      : nextStep === "task"
                        ? "Create the first task"
                        : nextStep === "review"
                          ? "Review submitted work"
                          : "See what was built"}
                  </ButtonLink>
                ) : null}
              </div>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { key: "created", label: "Create your project", href: `/projects/${projectId}`, done: true },
                  { key: "team", label: "Find collaborators", href: `/projects/${projectId}?tab=team`, done: members.length > 1 },
                  { key: "tasks", label: "Organise the work", href: `/projects/${projectId}/tasks`, done: projectTasks.length > 0 },
                  {
                    key: "review",
                    label: "Review and accept work",
                    href: `/projects/${projectId}?tab=tasks`,
                    done: approvedDeliverables.length > 0,
                  },
                  { key: "show", label: "Show what you built", href: `/projects/${projectId}/accepted`, done: approvedDeliverables.length > 0 },
                ].map((step) => (
                  <li key={step.key}>
                    <Link
                      href={step.href}
                      className="flex items-start gap-2 rounded-lg border border-navy-200 bg-navy-50/50 px-3 py-2 text-[12px] hover:border-navy-200 hover:bg-surface"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                          step.done ? "bg-emerald-600 text-on-teal" : "border border-navy-300 bg-surface text-navy-400",
                        )}
                      >
                        {step.done ? "✓" : ""}
                      </span>
                      <span className={cn("leading-5", step.done ? "text-navy-500" : "font-medium text-navy-800")}>
                        {step.label}
                        {step.done ? <span className="sr-only"> (done)</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">What this is</h2>
              <div className="prose-bt mt-2 whitespace-pre-line text-[13.5px]">{project.overview ?? project.shortDescription}</div>

              {project.problem ? (
                <div className="mt-5 rounded-lg border border-navy-200 bg-navy-50/60 p-4">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">The problem</h3>
                  <p className="mt-1 text-[13px] leading-6 text-navy-700">{project.problem}</p>
                </div>
              ) : null}

              {project.audience ? (
                <p className="mt-4 text-[12.5px] text-navy-600">
                  <span className="font-semibold text-navy-800">Who it serves:</span> {project.audience}
                </p>
              ) : null}

              {project.links && project.links.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {project.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 rounded-md border border-navy-200 px-2.5 py-1 text-[11.5px] font-medium text-navy-700 hover:bg-navy-50"
                    >
                      {link.label} <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Progress</h2>
              <div className="mt-3">
                <Progress
                  value={milestones.length ? (completedMilestones.length / milestones.length) * 100 : 0}
                  label={`${completedMilestones.length} of ${milestones.length} milestones complete`}
                />
              </div>
              <ul className="mt-3 divide-y divide-navy-200">
                {milestones.slice(0, 4).map((milestone) => (
                  <MilestoneRow key={milestone.id} milestone={milestone} />
                ))}
                {milestones.length === 0 ? <li className="py-3 text-[13px] text-navy-500">No milestones yet.</li> : null}
              </ul>
              <ButtonLink href={`/projects/${projectId}?tab=progress`} variant="ghost" size="sm" className="mt-2 px-0">
                Full timeline →
              </ButtonLink>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-navy-950">Updates</h2>
                <span className="text-[11px] text-navy-500">{updates.length} published</span>
              </div>
              <div className="mt-3 space-y-4">
                {updates.slice(0, 3).map((update) => (
                  <article key={update.id} className="rounded-lg border border-navy-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-navy-900">{update.title}</h3>
                      <Badge tone={update.visibility === "public" ? "success" : "neutral"}>{label(update.visibility)}</Badge>
                      <time className="text-[11px] text-navy-400" dateTime={update.createdAt}>
                        {relativeTime(update.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{truncate(update.body, 400)}</p>
                    <p className="mt-2 text-[11px] text-navy-500">by {update.authorName}</p>
                  </article>
                ))}
                {updates.length === 0 ? <p className="text-[13px] text-navy-500">No updates yet.</p> : null}
              </div>
            </Card>

            {featuredStory && featuredScenes.length > 0 ? (
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-navy-950">Project story</h2>
                  <ButtonLink href={`/projects/${projectId}/story`} variant="ghost" size="sm">
                    Story editor →
                  </ButtonLink>
                </div>
                <div className="mt-3">
                  <StoryPlayer
                    title={featuredStory.title}
                    scenes={featuredScenes.map((scene) => ({
                      id: scene.id,
                      title: scene.title,
                      narration: scene.narration,
                      visualDescription: scene.visualDescription,
                      durationSeconds: scene.durationSeconds,
                      sourceLabel: scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : null,
                      contributors: (scene.contributors ?? []).map((person) => person.name),
                      factStatus: scene.factStatus,
                      aiGenerated: scene.aiGenerated,
                    }))}
                  />
                </div>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Skills needed</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {projectSkillRows.map((skill) => (
                  <SkillTag key={skill.id} name={skill.name} href={`/explore?tab=projects&skill=${skill.slug}`} />
                ))}
                {projectSkillRows.length === 0 ? <p className="text-[12px] text-navy-500">None listed.</p> : null}
              </div>
              <Divider className="my-4" />
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Arrangement</h2>
              <p className="mt-1.5 text-[12.5px] text-navy-700">{label(project.compensationType)}</p>
              {project.compensationDetails ? (
                <p className="mt-1 text-[11.5px] leading-5 text-navy-600">{project.compensationDetails}</p>
              ) : null}
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] leading-4 text-amber-700">
                A listing does not make unpaid work lawful and creates no employment relationship.
              </p>
            </Card>

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">The team</h2>
              <div className="mt-2">
                <AvatarGroup people={members.map((member) => ({ displayName: member.displayName, avatarFileId: member.avatarFileId }))} />
              </div>
              <ul className="mt-3 space-y-2">
                {members.slice(0, 5).map((member) => (
                  <li key={member.id} className="flex items-center gap-2">
                    <Avatar name={member.displayName} size={24} src={member.avatarFileId ? `/api/files/${member.avatarFileId}` : null} />
                    <div className="min-w-0">
                      <Link href={`/u/${member.username}`} className="block truncate text-[12px] font-medium text-navy-800 hover:underline">
                        {member.displayName}
                      </Link>
                      <p className="truncate text-[10.5px] text-navy-500">{member.title ?? label(member.role)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <ButtonLink href={`/projects/${projectId}?tab=team`} variant="ghost" size="sm" className="mt-2 px-0">
                Team and access →
              </ButtonLink>
            </Card>

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Open tasks</h2>
              <ul className="mt-2 space-y-2">
                {projectTasks
                  .filter((task) => task.status === "open")
                  .slice(0, 4)
                  .map((task) => (
                    <li key={task.id}>
                      <Link href={`/tasks/${task.id}`} className="text-[12px] font-medium text-navy-800 hover:underline">
                        {task.title}
                      </Link>
                      <p className="text-[10.5px] text-navy-500">
                        {task.interestCount} interested · {task.effort ?? "effort not stated"}
                      </p>
                    </li>
                  ))}
                {projectTasks.filter((task) => task.status === "open").length === 0 ? (
                  <li className="text-[12px] text-navy-500">No open tasks right now.</li>
                ) : null}
              </ul>
            </Card>

            {access.canEdit ? (
              <Card className="p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Owner tools</h2>
                <div className="mt-2 space-y-2">
                  <ButtonLink href={`/projects/${projectId}/tasks`} variant="secondary" size="sm" className="w-full">
                    <FolderKanban size={13} aria-hidden="true" /> Manage tasks
                  </ButtonLink>
                  <ButtonLink href={`/projects/${projectId}/story`} variant="secondary" size="sm" className="w-full">
                    Story editor
                  </ButtonLink>
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-navy-700 hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
                      <Pencil size={13} aria-hidden="true" /> Edit project details
                    </summary>
                    <form action={updateProjectAction} className="mt-2 space-y-2 border-t border-navy-200 pt-2">
                      <input type="hidden" name="projectId" value={projectId} />
                      <Field label="Name" htmlFor="edit-name">
                        <Input id="edit-name" name="name" defaultValue={project.name} required />
                      </Field>
                      <Field label="Short description" htmlFor="edit-short">
                        <Textarea id="edit-short" name="shortDescription" defaultValue={project.shortDescription} rows={2} required />
                      </Field>
                      <Field label="Overview" htmlFor="edit-overview">
                        <Textarea id="edit-overview" name="overview" defaultValue={project.overview ?? ""} rows={4} />
                      </Field>
                      <Field label="Stage" htmlFor="edit-stage">
                        <Select id="edit-stage" name="stage" defaultValue={project.stage}>
                          {["idea", "research", "prototype", "building", "testing", "launched", "completed"].map((stage) => (
                            <option key={stage} value={stage}>
                              {label(stage)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Visibility" htmlFor="edit-visibility">
                        <Select id="edit-visibility" name="visibility" defaultValue={project.visibility}>
                          <option value="public">Public</option>
                          <option value="invite_only">Invite only</option>
                          <option value="private">Private</option>
                        </Select>
                      </Field>
                      <Checkbox name="allowPublicDocs" label="Allow public documentation" defaultChecked={project.allowPublicDocs} />
                      <SubmitButton size="sm" className="w-full" pendingLabel="Saving…">
                        Save changes
                      </SubmitButton>
                    </form>
                  </details>
                  <form action={archiveProjectAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <SubmitButton
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      confirmMessage="Archive this project? It will leave public discovery."
                    >
                      Archive project
                    </SubmitButton>
                  </form>
                  <details className="rounded-lg border border-red-200">
                    <summary className="cursor-pointer list-none px-2 py-1.5 text-[12px] font-medium text-red-600 [&::-webkit-details-marker]:hidden">
                      Delete project
                    </summary>
                    <form action={deleteProjectAction} className="space-y-2 border-t border-red-100 p-2">
                      <input type="hidden" name="projectId" value={projectId} />
                      <p className="text-[11px] leading-5 text-red-600">
                        This permanently deletes the project, tasks, documentation and linked stories. Type{" "}
                        <strong>{project.name}</strong> to confirm.
                      </p>
                      <Input name="confirmation" required placeholder={project.name} aria-label="Type the project name to confirm" />
                      <SubmitButton variant="danger" size="sm" className="w-full" pendingLabel="Deleting…">
                        Delete permanently
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
        </div>
      ) : null}

      {tab === "progress" && !isInviteOnlyLimited ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Card>
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Milestones</h2>
                <p className="text-[12px] text-navy-500">Status is set by the project team. Completion is recorded with a timestamp.</p>
              </div>
              <ul className="divide-y divide-navy-200 px-5">
                {milestones.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    action={
                      access.canEdit ? (
                        <form action={setMilestoneStatusAction} className="shrink-0">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="milestoneId" value={milestone.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={milestone.status === "completed" ? "in_progress" : milestone.status === "in_progress" ? "completed" : "in_progress"}
                          />
                          <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                            {milestone.status === "completed" ? "Reopen" : milestone.status === "in_progress" ? "Mark complete" : "Start"}
                          </SubmitButton>
                        </form>
                      ) : null
                    }
                  />
                ))}
                {milestones.length === 0 ? <li className="py-6 text-center text-[13px] text-navy-500">No milestones yet.</li> : null}
              </ul>
              {access.canEdit ? (
                <form action={addMilestoneAction} className="border-t border-navy-200 p-5">
                  <input type="hidden" name="projectId" value={projectId} />
                  <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_150px_auto]">
                    <Field label="New milestone" htmlFor="ms-title">
                      <Input id="ms-title" name="title" required placeholder="Field guide published" />
                    </Field>
                    <Field label="Description" htmlFor="ms-desc">
                      <Input id="ms-desc" name="description" placeholder="What done looks like" />
                    </Field>
                    <Field label="Due" htmlFor="ms-due">
                      <Input id="ms-due" name="dueDate" type="date" />
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton size="sm" pendingLabel="…">
                        Add
                      </SubmitButton>
                    </div>
                  </div>
                </form>
              ) : null}
            </Card>

            <Card>
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Project updates</h2>
                <p className="text-[12px] text-navy-500">Dated narrative from the team. Public updates also appear in the feed.</p>
              </div>
              <div className="space-y-4 p-5">
                {updates.map((update) => (
                  <article key={update.id} className="rounded-lg border border-navy-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-navy-900">{update.title}</h3>
                      <Badge tone={update.visibility === "public" ? "success" : "neutral"}>{label(update.visibility)}</Badge>
                      <time className="text-[11px] text-navy-400" dateTime={update.createdAt}>
                        {formatDate(update.createdAt)}
                      </time>
                    </div>
                    <div className="prose-bt mt-1.5 whitespace-pre-line text-[13px]">{update.body}</div>
                    <p className="mt-2 text-[11px] text-navy-500">by {update.authorName}</p>
                  </article>
                ))}
                {updates.length === 0 ? <p className="text-[13px] text-navy-500">No updates yet.</p> : null}
              </div>
              {access.canEdit ? (
                <form action={postProjectUpdateAction} className="space-y-2 border-t border-navy-200 p-5">
                  <input type="hidden" name="projectId" value={projectId} />
                  <Field label="Update title" htmlFor="update-title" required>
                    <Input id="update-title" name="title" required maxLength={140} />
                  </Field>
                  <Field label="What changed?" htmlFor="update-body" required>
                    <Textarea id="update-body" name="body" rows={4} required maxLength={6000} />
                  </Field>
                  <div className="flex items-end gap-3">
                    <Field label="Visibility" htmlFor="update-visibility">
                      <Select id="update-visibility" name="visibility" defaultValue="public">
                        <option value="public">Public (also posts to the feed)</option>
                        <option value="private">Team only</option>
                      </Select>
                    </Field>
                    <SubmitButton size="sm" pendingLabel="Publishing…">
                      Publish update
                    </SubmitButton>
                  </div>
                </form>
              ) : null}
            </Card>

            {access.canEdit ? (
              <Card>
                <div className="border-b border-navy-200 px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-navy-950">Share to social</h2>
                  <p className="text-[12px] text-navy-500">
                    Publishes through Ayrshare to the networks linked in your Ayrshare dashboard. Only public updates can
                    be shared, and a link back to this project is always included.
                  </p>
                </div>

                {!socialReady ? (
                  <p className="p-5 text-[13px] text-navy-500">
                    Social publishing is not configured on this deployment. Set <code>AYRSHARE_API_KEY</code> and link the
                    networks in the Ayrshare dashboard to enable it.
                  </p>
                ) : publicUpdates.length === 0 ? (
                  <p className="p-5 text-[13px] text-navy-500">
                    Publish a public update first — team-only updates never leave the platform.
                  </p>
                ) : (
                  <form action={shareProjectUpdateAction} className="space-y-3 p-5">
                    <input type="hidden" name="projectId" value={projectId} />
                    <Field label="Public update" htmlFor="share-update" required>
                      <Select id="share-update" name="updateId" required>
                        {publicUpdates.map((update) => (
                          <option key={update.id} value={update.id}>
                            {update.title}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <fieldset>
                      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                        Networks
                      </legend>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {SOCIAL_PLATFORMS.map((platform) => (
                          <Checkbox key={platform} name="platforms" value={platform} label={platformLabel(platform)} />
                        ))}
                      </div>
                    </fieldset>
                    <Field label="Message (optional)" htmlFor="share-message" hint="Leave blank to use the update text.">
                      <Textarea id="share-message" name="message" rows={3} maxLength={1000} />
                    </Field>
                    <SubmitButton size="sm" pendingLabel="Publishing…">
                      Share
                    </SubmitButton>
                  </form>
                )}

                <ul className="divide-y divide-navy-200 border-t border-navy-200">
                  {shares.length === 0 ? (
                    <li className="px-5 py-4 text-[12px] text-navy-500">Nothing shared from this project yet.</li>
                  ) : (
                    shares.map((share) => (
                      <li key={share.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-navy-800">
                            <Badge tone={share.status === "posted" ? "success" : share.status === "failed" ? "danger" : "neutral"}>
                              {share.status}
                            </Badge>
                            <span>{share.platforms.map(platformLabel).join(", ")}</span>
                            <time className="text-[11px] font-normal text-navy-400" dateTime={share.createdAt}>
                              {relativeTime(share.createdAt)}
                            </time>
                          </p>
                          <p className="mt-1 line-clamp-2 text-[12px] text-navy-600">{share.body}</p>
                          {share.error ? <p className="mt-0.5 text-[11px] text-red-600">{share.error}</p> : null}
                        </div>
                        {share.status === "deleted" ? null : (
                          <form action={deleteShareAction}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="shareId" value={share.id} />
                            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                              Delete post
                            </SubmitButton>
                          </form>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Where it stands</h2>
              <p className="mt-2 text-[13px] font-medium text-navy-900">{label(project.stage)}</p>
              <Progress
                value={milestones.length ? (completedMilestones.length / milestones.length) * 100 : 0}
                label={`${completedMilestones.length} of ${milestones.length} milestones`}
              />
              <p className="mt-3 text-[11px] leading-5 text-navy-500">
                Blocked or delayed? Record it in a public update rather than leaving people guessing. Honest progress is more
                useful than a polished timeline.
              </p>
            </Card>
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Story from this record</h2>
              <p className="mt-1.5 text-[12px] leading-5 text-navy-600">
                Approved documentation, milestones and updates can be composed into an animated story.
              </p>
              <ButtonLink href={`/projects/${projectId}/story`} size="sm" variant="secondary" className="mt-3">
                Open story editor
              </ButtonLink>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "tasks" && !isInviteOnlyLimited ? (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-200 px-5 py-4">
              <div>
                <h2 className="text-[14px] font-semibold text-navy-950">Tasks</h2>
                <p className="text-[12px] text-navy-500">
                  {isTeam ? "Team view — includes private tasks." : "Public tasks only. Join the team to see private work."}
                </p>
              </div>
              {access.canEdit ? (
                <ButtonLink href={`/projects/${projectId}/tasks`} size="sm" variant="secondary">
                  Task board and new task
                </ButtonLink>
              ) : null}
            </div>
            <ul>
              {projectTasks.map((task) => (
                <TaskRow key={task.id} task={task} href={`/tasks/${task.id}`} />
              ))}
            </ul>
            {projectTasks.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No tasks yet"
                  description={access.canEdit ? "Break the work into tasks with clear acceptance criteria." : "The owner has not published tasks yet. Express interest to start a conversation."}
                  action={access.canEdit ? <ButtonLink href={`/projects/${projectId}/tasks`} size="sm">Create a task</ButtonLink> : undefined}
                />
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "team" && !isInviteOnlyLimited ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Card>
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Team</h2>
                <p className="text-[12px] text-navy-500">Active members. Removal revokes workspace and chat access immediately.</p>
              </div>
              <ul className="divide-y divide-navy-200">
                {members.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Avatar name={member.displayName} size={32} src={member.avatarFileId ? `/api/files/${member.avatarFileId}` : null} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/u/${member.username}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                        {member.displayName}
                      </Link>
                      <p className="text-[11px] text-navy-500">
                        {member.title ?? "Contributor"} · {label(member.role)} · joined {formatDate(member.joinedAt)}
                      </p>
                    </div>
                    {access.canManageTeam && member.userId !== project.ownerId ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <SubmitButton
                          size="sm"
                          variant="ghost"
                          confirmMessage={`Remove ${member.displayName} from the team? They will lose access to private tasks, documentation and chat.`}
                        >
                          Remove
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Work areas</h2>
                <p className="text-[12px] text-navy-500">
                  Where work belongs: each area keeps its own tasks, chat and Accepted Work. Create one only when it earns its place.
                </p>
              </div>
              {workAreaList.length === 0 ? (
                <p className="px-5 py-4 text-[12.5px] text-navy-500">
                  No work areas yet. Tasks stay in the project inbox until you add one.
                </p>
              ) : (
                <ul className="divide-y divide-navy-200">
                  {workAreaList.map((area) => (
                    <li key={area.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/projects/${projectId}/areas/${area.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                          {area.name}
                        </Link>
                        <p className="text-[11px] text-navy-500">
                          {area.openDrops} open {area.openDrops === 1 ? "task" : "tasks"} · {area.accepted} accepted
                          {area.description ? ` · ${truncate(area.description, 80)}` : ""}
                        </p>
                      </div>
                      {access.canViewWorkspace ? (
                        <form action={openWorkAreaChatAction}>
                          <input type="hidden" name="areaId" value={area.id} />
                          <input type="hidden" name="projectId" value={projectId} />
                          <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                            <MessageSquare size={12} aria-hidden="true" /> Chat
                          </SubmitButton>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {access.canEdit ? (
                <form action={createWorkAreaAction} className="grid gap-2 border-t border-navy-200 bg-navy-50/40 px-5 py-4 sm:grid-cols-[1fr_1.4fr_auto]">
                  <input type="hidden" name="projectId" value={projectId} />
                  <Field label="New work area" htmlFor="areaName">
                    <Input id="areaName" name="name" required maxLength={40} placeholder="Design" />
                  </Field>
                  <Field label="What belongs here" htmlFor="areaDescription">
                    <Input id="areaDescription" name="description" maxLength={500} placeholder="Interface, brand and user research" />
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="Creating…">
                      Create
                    </SubmitButton>
                  </div>
                </form>
              ) : null}
            </Card>

            {access.canReview ? (
              <Card>
                <div className="border-b border-navy-200 px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-navy-950">Expressions of interest</h2>
                  <p className="text-[12px] text-navy-500">Review profiles, ask a question, or accept with a clear message.</p>
                </div>
                <ul className="divide-y divide-navy-200">
                  {interests.map((row) => (
                    <li key={row.eoi.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <Avatar name={row.userName} size={32} src={row.avatarFileId ? `/api/files/${row.avatarFileId}` : null} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/u/${row.username}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                              {row.userName}
                            </Link>
                            <StatusBadge status={row.eoi.status} />
                            <Badge tone="brand">{label(row.eoi.intent)}</Badge>
                            {row.taskTitle ? <Badge tone="neutral">{row.taskTitle}</Badge> : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-navy-500">{relativeTime(row.eoi.createdAt)}</p>
                          {row.eoi.message ? (
                            <p className="mt-1.5 text-[12.5px] leading-6 text-navy-700">{row.eoi.message}</p>
                          ) : null}
                          {(row.eoi.workSamples ?? []).length > 0 ? (
                            <ul className="mt-1.5 flex flex-wrap gap-2">
                              {(row.eoi.workSamples ?? []).map((sample) => (
                                <li key={sample.url}>
                                  <a
                                    href={sample.url}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="text-[11px] font-medium text-brand-600 underline"
                                  >
                                    {sample.label}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {row.eoi.responseMessage ? (
                            <p className="mt-2 rounded-md bg-navy-50 px-2 py-1.5 text-[11.5px] text-navy-600">
                              Your reply: {row.eoi.responseMessage}
                            </p>
                          ) : null}
                          {row.eoi.status === "new" || row.eoi.status === "reviewing" ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <form action={respondToInterestAction} className="flex items-end gap-2">
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="eoiId" value={row.eoi.id} />
                                <input type="hidden" name="decision" value="accepted" />
                                <input type="hidden" name="responseMessage" value="Accepted. Welcome aboard — start with the task scope and confirm it before beginning." />
                                <SubmitButton size="sm" pendingLabel="…">
                                  Accept
                                </SubmitButton>
                              </form>
                              <form action={respondToInterestAction} className="flex items-end gap-2">
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="eoiId" value={row.eoi.id} />
                                <input type="hidden" name="decision" value="declined" />
                                <input type="hidden" name="responseMessage" value="Thanks for offering. We are not taking this forward right now." />
                                <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                                  Decline
                                </SubmitButton>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                  {interests.length === 0 ? (
                    <li className="px-5 py-6 text-[13px] text-navy-500">No expressions of interest yet.</li>
                  ) : null}
                </ul>
              </Card>
            ) : null}

            {access.canManageTeam ? (
              <Card>
                <div className="border-b border-navy-200 px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-navy-950">Invite someone</h2>
                  <p className="text-[12px] text-navy-500">Invite by username. Invitations are visible in their notifications.</p>
                </div>
                <form action={inviteToProjectAction} className="grid gap-3 p-5 sm:grid-cols-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <Field label="Username" htmlFor="invite-user" hint="They must already have an account.">
                    <Input id="invite-user" name="email" placeholder="Username or email" />
                  </Field>
                  <Field label="Role" htmlFor="invite-role">
                    <Select id="invite-role" name="role" defaultValue="collaborator">
                      <option value="collaborator">Collaborator</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="observer">Observer</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </Field>
                  <Field label="Message" htmlFor="invite-message" className="sm:col-span-2">
                    <Textarea id="invite-message" name="message" rows={2} maxLength={600} />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton size="sm" pendingLabel="Sending…">
                      Send invitation
                    </SubmitButton>
                    <p className="mt-1 text-[10.5px] text-navy-400">
                      Usernames only in this build: email invitations require an email provider.
                    </p>
                  </div>
                </form>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Your documentation consent</h2>
              <p className="mt-1.5 text-[11.5px] leading-5 text-navy-600">
                Public stories and learning material can only use your documentation if you consent. Withdrawing consent
                immediately pulls public entries back to team-only.
              </p>
              <form action={consentAction} className="mt-3 space-y-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="scope" value="public_story" />
                <input type="hidden" name="grant" value={myConsent ? "false" : "true"} />
                <p className="text-[11px] font-medium text-navy-800">
                  Public story use: {myConsent ? <span className="text-emerald-600">granted</span> : <span className="text-amber-700">not granted</span>}
                </p>
                <SubmitButton size="sm" variant={myConsent ? "secondary" : "primary"} pendingLabel="…">
                  {myConsent ? "Withdraw consent" : "Grant consent"}
                </SubmitButton>
              </form>
            </Card>
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Access rules in force</h2>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-navy-600">
                <li>Workspace access: {access.canViewWorkspace ? "team members only (you have access)" : "team members only"}</li>
                <li>Review rights: {access.canReview ? "you can review submissions" : "owner and reviewers"}</li>
                <li>Public documentation: {project.allowPublicDocs ? "enabled" : "disabled"}</li>
                <li>Visibility: {label(project.visibility)}</li>
              </ul>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "discussion" && !isInviteOnlyLimited ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Public discussion</h2>
            <p className="mb-4 mt-0.5 text-[12px] text-navy-500">
              Visible to anyone who can see the project. Use team chat for private coordination.
            </p>
            <CommentThread
              comments={comments}
              targetType="project"
              targetId={projectId}
              returnTo={returnTo}
              canComment={!!user}
              emptyLabel="No questions yet. Ask what the project needs, or offer something specific."
            />
          </Card>
          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Public vs private</h2>
              <dl className="mt-2 space-y-2 text-[11.5px] leading-5 text-navy-600">
                <div>
                  <dt className="font-semibold text-navy-800">Public</dt>
                  <dd>This discussion, published updates, public work-log entries, published stories.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-navy-800">Team only</dt>
                  <dd>Private tasks, team work logs, chat, client-restricted notes, private deliverables.</dd>
                </div>
              </dl>
            </Card>
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Attribution concern?</h2>
              <p className="mt-1.5 text-[11.5px] leading-5 text-navy-600">
                If credit is wrong or missing, report it. Misattribution reports go to moderation with a required explanation.
              </p>
              <div className="mt-2">
                <ReportForm targetType="project" targetId={projectId} returnTo={returnTo} />
              </div>
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "learning" && !isInviteOnlyLimited ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between border-b border-navy-200 px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-navy-950">Learning journeys</h2>
                  <p className="text-[12px] text-navy-500">Built from approved documentation.</p>
                </div>
                {isTeam ? (
                  <ButtonLink href={`/projects/${projectId}/tasks`} size="sm" variant="ghost">
                    From a task →
                  </ButtonLink>
                ) : null}
              </div>
              <ul className="divide-y divide-navy-200">
                {journeys.map((row) => (
                  <li key={row.journey.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/learn/journeys/${row.journey.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                        {row.journey.title}
                      </Link>
                      <StatusBadge status={row.journey.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-navy-500">
                      by {row.creatorName} · {row.journey.visibility === "public" ? "public" : "private"}
                    </p>
                  </li>
                ))}
                {journeys.length === 0 ? <li className="px-5 py-5 text-[12.5px] text-navy-500">No journeys yet.</li> : null}
              </ul>
            </Card>

            <Card>
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Learning resources</h2>
                <p className="text-[12px] text-navy-500">Free and premium material linked to this project.</p>
              </div>
              <ul className="divide-y divide-navy-200">
                {resources.map((row) => (
                  <li key={row.resource.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/learn/${row.resource.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                        {row.resource.title}
                      </Link>
                      <p className="text-[11px] text-navy-500">
                        {label(row.resource.format)} · {row.creatorName}
                      </p>
                    </div>
                    <Badge tone={row.resource.priceCents > 0 ? "warning" : "success"}>
                      {row.resource.priceCents > 0 ? money(row.resource.priceCents) : "Free"}
                    </Badge>
                  </li>
                ))}
                {resources.length === 0 ? (
                  <li className="px-5 py-5 text-[12.5px] text-navy-500">
                    No resources yet. Contributors can turn accepted work into a learning journey, then publish it here.
                  </li>
                ) : null}
              </ul>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Project stories</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {storyRows.map((board) => (
                <div key={board.id} className="rounded-lg border border-navy-200 p-4">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={board.status} />
                    <span className="text-[11px] text-navy-400">v{board.version}</span>
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-navy-900">{board.title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-navy-500">{board.summary}</p>
                  <ButtonLink href={`/projects/${projectId}/story?board=${board.id}`} size="sm" variant="ghost" className="mt-2 px-0">
                    Open →
                  </ButtonLink>
                </div>
              ))}
              {storyRows.length === 0 ? (
                <p className="text-[12.5px] text-navy-500">
                  No stories generated yet. The story editor collects approved documentation and flags anything unsupported.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "results" && !isInviteOnlyLimited ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Completed milestones</h2>
            <ul className="mt-2 divide-y divide-navy-200">
              {completedMilestones.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} />
              ))}
              {completedMilestones.length === 0 ? <li className="py-3 text-[13px] text-navy-500">None completed yet.</li> : null}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-navy-950">Approved deliverables</h2>
              <Link href={`/projects/${projectId}/accepted`} className="text-[11.5px] font-medium text-brand-600 hover:underline">
                Accepted work
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-navy-200">
              {approvedDeliverables.map((row) => (
                <li key={row.deliverable.id} className="py-2.5">
                  <p className="text-[13px] font-medium text-navy-900">{row.deliverable.title}</p>
                  <p className="text-[11px] text-navy-500">{row.taskTitle}</p>
                  {row.deliverable.url ? (
                    <a href={row.deliverable.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] text-brand-600 underline">
                      Open deliverable
                    </a>
                  ) : null}
                </li>
              ))}
              {approvedDeliverables.length === 0 ? <li className="py-3 text-[13px] text-navy-500">No approved deliverables yet.</li> : null}
            </ul>
            <p className="mt-3 border-t border-navy-200 pt-2 text-[10.5px] text-navy-400">
              Metrics shown are supplied by the project team and are not independently audited.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Lessons learned</h2>
            <ul className="mt-2 space-y-3">
              {lessons.map((row) => (
                <li key={row.entry.id} className="rounded-lg bg-navy-50 p-3">
                  <p className="text-[12.5px] font-semibold text-navy-900">{row.entry.title}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-navy-600">{truncate(row.entry.body, 260)}</p>
                  <p className="mt-1 text-[10.5px] text-navy-400">
                    {row.authorName} · {row.taskTitle}
                  </p>
                </li>
              ))}
              {lessons.length === 0 ? <li className="text-[13px] text-navy-500">No published lessons yet.</li> : null}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Final story</h2>
            {featuredStory ? (
              <>
                <p className="mt-1 text-[13px] text-navy-700">{featuredStory.title}</p>
                <p className="text-[11px] text-navy-500">{featuredScenes.length} scenes · approved by the project owner</p>
                <ButtonLink href={`/projects/${projectId}/story`} size="sm" className="mt-3">
                  Watch the story
                </ButtonLink>
              </>
            ) : (
              <p className="mt-2 text-[12.5px] text-navy-500">
                No published story yet. Stories require approved source material, a render and an approval record.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "analytics" && analytics ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Views" value={analytics.views} hint="Recorded page views, best-effort" />
            <Stat label="Followers" value={analytics.follows} />
            <Stat label="Expressions of interest" value={analytics.interests} />
            <Stat label="Open tasks" value={projectTasks.filter((task) => task.status === "open").length} />
          </div>
          <Card className="p-5">
            <MiniBarChart data={analytics.viewsByDay} label="Views (last 14 recorded days)" />
          </Card>
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Milestone status</h2>
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th>Count</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.milestones.map((row) => (
                  <tr key={row.status}>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td>{row.count}</Td>
                  </tr>
                ))}
                {analytics.milestones.length === 0 ? (
                  <tr>
                    <Td>No milestones.</Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
            <p className="mt-3 text-[10.5px] text-navy-400">
              These are platform analytics, not audited business outcomes. Estimates and confirmed outcomes are not mixed.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === "analytics" && !analytics ? (
        <Alert tone="warning">Only project owners and admins can view analytics.</Alert>
      ) : null}
    </div>
  );
}
