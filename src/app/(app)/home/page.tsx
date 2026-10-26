import Link from "next/link";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { CalendarClock, Compass, Sparkles, Users } from "lucide-react";
import { getDb } from "@/db/client";
import { projectInvitations, projects, tasks, users } from "@/db/schema";
import { createPostAction } from "@/app/actions/social";
import { respondToInvitationAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { PostCard } from "@/components/post-card";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { feed } from "@/services/social";
import { listProjects, followedProjects } from "@/services/projects";
import { upcomingDeadlines } from "@/services/tasks";
import { searchPeople } from "@/services/users";
import { getPreferences } from "@/services/users";
import { formatDate } from "@/lib/format";
import { label } from "@/lib/types";
import type { FeedFilter } from "@/lib/types";

export const metadata = { title: "Home" };

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "for_you", label: "For you" },
  { id: "following", label: "Following" },
  { id: "projects", label: "Projects" },
  { id: "learning", label: "Learning" },
  { id: "updates", label: "Updates" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);
  const user = await requireUser();
  const filter = (typeof params.filter === "string" && FILTERS.some((f) => f.id === params.filter) ? params.filter : "for_you") as FeedFilter;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const pageSize = 12;

  const items = feed(user, filter, { limit: pageSize + 1, offset: (page - 1) * pageSize });
  const hasMore = items.length > pageSize;
  const posts = items.slice(0, pageSize);

  const prefs = getPreferences(user.id);
  const invitations = getDb()
    .select({
      invitation: projectInvitations,
      projectName: projects.name,
      inviterName: users.displayName,
    })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .innerJoin(users, eq(users.id, projectInvitations.inviterId))
    .where(and(eq(projectInvitations.inviteeId, user.id), eq(projectInvitations.status, "pending")))
    .all();

  const deadlines = upcomingDeadlines(user.id);
  const suggestedProjects = listProjects({ limit: 3, sort: "active" }, user);
  const suggestedPeople = searchPeople("", 3).filter((person) => person.id !== user.id);
  const following = followedProjects(user.id);
  const openTasks = getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      projectName: projects.name,
      deadline: tasks.deadline,
      projectId: projects.id,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.status, "open"), eq(tasks.visibility, "public"), eq(projects.status, "published")))
    .orderBy(desc(tasks.publishedAt))
    .limit(4)
    .all();

  return (
    <div>
      <PageHeader
        eyebrow={`${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`}
        title={`Welcome back, ${user.displayName.split(" ")[0]}`}
        description={
          user.goals.length > 0
            ? `Your feed prioritises ${user.goals.map((goal) => label(goal).toLowerCase()).join(", ")}. Change this any time in settings.`
            : "Your feed mixes projects, updates and learning from people you follow and topics you care about."
        }
        actions={
          <>
            <ButtonLink href="/explore" variant="secondary" size="sm">
              <Compass size={14} aria-hidden="true" /> Explore
            </ButtonLink>
            <ButtonLink href="/projects/new" size="sm">
              Start a project
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can browse, comment and contribute now. Publishing projects, updates and learning content requires a
            verified address.{" "}
            <Link href="/settings?tab=security" className="font-medium underline">
              Resend the verification email
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Tabs
            current={filter}
            items={FILTERS.map((item) => ({
              id: item.id,
              label: item.label,
              href: item.id === "for_you" ? "/home" : `/home?filter=${item.id}`,
            }))}
          />

          <Card className="mb-4">
            <form action={createPostAction} className="p-4">
              <input type="hidden" name="returnTo" value="/home" />
              {/* This composer publishes directly; drafts live in Create → New post. */}
              <input type="hidden" name="publish" value="on" />
              <div className="flex items-start gap-3">
                <Avatar name={user.displayName} size={36} src={user.avatarFileId ? `/api/files/${user.avatarFileId}` : null} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="new-post" className="sr-only">
                    Write a post
                  </label>
                  <Textarea
                    id="new-post"
                    name="body"
                    required
                    rows={2}
                    maxLength={5000}
                    placeholder="Share an update, a question, something you learned, or something that failed…"
                    className="min-h-[64px]"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label htmlFor="post-kind" className="sr-only">
                      Post type
                    </label>
                    <Select id="post-kind" name="kind" defaultValue="general" className="h-9 w-auto text-[12px]">
                      <option value="general">General</option>
                      <option value="question">Question</option>
                      <option value="lesson">Lesson</option>
                      <option value="milestone">Milestone</option>
                    </Select>
                    <p className="text-[11px] text-navy-500">
                      Public. Project-specific updates should be posted from the project page.
                    </p>
                    <SubmitButton size="sm" className="ml-auto" pendingLabel="Posting…">
                      Post
                    </SubmitButton>
                  </div>
                </div>
              </div>
            </form>
          </Card>

          {posts.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} aria-hidden="true" />}
              title={filter === "following" ? "Nothing from people you follow yet" : "Your feed is quiet"}
              description={
                filter === "following"
                  ? "Follow a few people or projects and their updates will appear here."
                  : "Try another filter, or follow some projects to shape your feed."
              }
              action={
                <ButtonLink href="/explore" size="sm">
                  Explore projects
                </ButtonLink>
              }
            />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} returnTo={filter === "for_you" ? "/home" : `/home?filter=${filter}`} />
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            {page > 1 ? (
              <ButtonLink
                href={filter === "for_you" ? `/home?page=${page - 1}` : `/home?filter=${filter}&page=${page - 1}`}
                variant="secondary"
                size="sm"
              >
                Newer posts
              </ButtonLink>
            ) : (
              <span />
            )}
            {hasMore ? (
              <ButtonLink
                href={filter === "for_you" ? `/home?page=${page + 1}` : `/home?filter=${filter}&page=${page + 1}`}
                variant="secondary"
                size="sm"
              >
                Older posts
              </ButtonLink>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          {invitations.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-4 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Project invitations</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {invitations.map((row) => (
                  <li key={row.invitation.id} className="px-4 py-3">
                    <p className="text-[12.5px] font-medium text-navy-900">{row.projectName}</p>
                    <p className="mt-0.5 text-[11px] text-navy-500">
                      {row.inviterName} invited you as {label(row.invitation.role)}
                    </p>
                    {row.invitation.message ? (
                      <p className="mt-1 text-[11.5px] leading-5 text-navy-600">“{row.invitation.message}”</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <form action={respondToInvitationAction}>
                        <input type="hidden" name="invitationId" value={row.invitation.id} />
                        <input type="hidden" name="accept" value="on" />
                        <SubmitButton size="sm" pendingLabel="…">
                          Accept
                        </SubmitButton>
                      </form>
                      <form action={respondToInvitationAction}>
                        <input type="hidden" name="invitationId" value={row.invitation.id} />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          Decline
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {deadlines.length > 0 ? (
            <Card>
              <div className="flex items-center gap-2 border-b border-navy-100 px-4 py-3">
                <CalendarClock size={14} aria-hidden="true" className="text-brand-600" />
                <h2 className="text-[13px] font-semibold text-navy-950">Your active tasks</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {deadlines.map((row) => (
                  <li key={row.task.id} className="px-4 py-3">
                    <Link href={`/tasks/${row.task.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                      {row.task.title}
                    </Link>
                    <p className="text-[11px] text-navy-500">
                      {row.projectName}
                      {row.task.deadline ? ` · due ${formatDate(row.task.deadline)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {openTasks.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-4 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Open tasks</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {openTasks.map((task) => (
                  <li key={task.id} className="px-4 py-3">
                    <Link href={`/tasks/${task.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                      {task.title}
                    </Link>
                    <p className="text-[11px] text-navy-500">
                      {task.projectName}
                      {task.deadline ? ` · due ${formatDate(task.deadline)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-navy-100 px-4 py-2">
                <ButtonLink href="/explore?tab=projects&sort=active" variant="ghost" size="sm">
                  Find more →
                </ButtonLink>
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="border-b border-navy-100 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-navy-950">Projects to look at</h2>
            </div>
            <ul className="divide-y divide-navy-100">
              {suggestedProjects.map((project) => (
                <li key={project.id} className="px-4 py-3">
                  <Link href={`/projects/${project.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                    {project.name}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-navy-500">{project.shortDescription}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge tone="neutral">{label(project.category)}</Badge>
                    <Badge tone="neutral">{label(project.stage)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-navy-100 px-4 py-3">
              <Users size={14} aria-hidden="true" className="text-brand-600" />
              <h2 className="text-[13px] font-semibold text-navy-950">People to follow</h2>
            </div>
            <ul className="divide-y divide-navy-100">
              {suggestedPeople.map((person) => (
                <li key={person.id} className="flex items-center gap-2 px-4 py-2.5">
                  <Avatar name={person.displayName} size={26} src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${person.username}`} className="block truncate text-[12px] font-medium text-navy-900 hover:underline">
                      {person.displayName}
                    </Link>
                    <p className="truncate text-[10.5px] text-navy-500">{person.skills.map((skill) => skill.name).join(" · ") || person.username}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {following.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Following</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {following.slice(0, 6).map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="rounded-md bg-navy-50 px-2 py-1 text-[11px] font-medium text-navy-700 hover:bg-navy-100"
                  >
                    {project.name}
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {prefs ? (
            <p className="px-1 text-[10.5px] leading-4 text-navy-400">
              Feed ranking blends freshness, follows and your stated interests. Engagement alone cannot buy placement.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
