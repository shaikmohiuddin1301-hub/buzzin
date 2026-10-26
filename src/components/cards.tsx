import Link from "next/link";
import { ArrowUpRight, Clock, Sparkles, Users } from "lucide-react";
import { Avatar, Badge, Progress, SkillTag, StatusBadge, TaskStatusBadge, cn } from "@/components/ui";
import { money, truncate } from "@/lib/format";
import { label } from "@/lib/types";

function ReasonChips({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="inline-flex items-center gap-1 rounded-full bg-coral-50 px-2 py-0.5 text-[10.5px] font-medium text-coral-800"
        >
          <Sparkles size={10} aria-hidden="true" />
          {reason}
        </span>
      ))}
    </div>
  );
}

export type ProjectCardData = {
  id: string;
  name: string;
  shortDescription: string;
  category: string;
  stage: string;
  visibility: string;
  workMode: string;
  compensationType: string;
  coverImageId?: string | null;
  followerCount?: number;
  openTaskCount?: number;
  memberCount?: number;
  owner: { username: string; displayName: string; avatarFileId?: string | null };
  skills?: { id: string; name: string; slug: string }[];
};

export function ProjectCard({
  project,
  compact = false,
  reasons,
}: {
  project: ProjectCardData;
  compact?: boolean;
  reasons?: string[];
}) {
  return (
    <article className="motion-card group flex flex-col overflow-hidden rounded-2xl border border-navy-200/60 bg-surface shadow-card">
      <Link href={`/projects/${project.id}`} className="relative block aspect-[16/9] overflow-hidden bg-navy-900">
        {project.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${project.coverImageId}`}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-800 via-navy-900 to-navy-950">
            <span className="text-3xl font-semibold text-white/75">
              {project.name
                .split(" ")
                .slice(0, 2)
                .map((word) => word[0])
                .join("")}
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="brand">{label(project.category)}</Badge>
          <Badge tone="neutral" className="bg-white/90">
            {label(project.stage)}
          </Badge>
          {project.visibility !== "public" ? <Badge tone="warning">{label(project.visibility)}</Badge> : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[15px] font-semibold leading-snug text-navy-950">
          <Link href={`/projects/${project.id}`} className="hover:text-brand-700">
            {project.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-6 text-navy-600">{truncate(project.shortDescription, compact ? 120 : 180)}</p>
        <ReasonChips reasons={reasons} />

        {project.skills && project.skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.skills.slice(0, 3).map((skill) => (
              <SkillTag key={skill.id} name={skill.name} href={`/explore?tab=projects&skill=${skill.slug}`} />
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-navy-500">
          <span className="flex items-center gap-1.5">
            <Avatar name={project.owner.displayName} size={22} src={project.owner.avatarFileId ? `/api/files/${project.owner.avatarFileId}` : null} />
            {project.owner.displayName}
          </span>
          <span className="flex items-center gap-3">
            {typeof project.openTaskCount === "number" && project.openTaskCount > 0 ? (
              <span className="flex items-center gap-1">
                <Clock size={12} aria-hidden="true" /> {project.openTaskCount} open
              </span>
            ) : null}
            {typeof project.memberCount === "number" ? (
              <span className="flex items-center gap-1">
                <Users size={12} aria-hidden="true" /> {project.memberCount}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </article>
  );
}

export type ResourceCardData = {
  id: string;
  title: string;
  summary: string | null;
  format: string;
  level: string;
  priceCents: number;
  currency?: string;
  durationMinutes?: number | null;
  creatorName?: string;
  creatorUsername?: string;
  coverImageId?: string | null;
  storyboardId?: string | null;
};

export function ResourceCard({
  resource,
  href,
  reasons,
}: {
  resource: ResourceCardData;
  href?: string;
  reasons?: string[];
}) {
  const target = href ?? `/learn/${resource.id}`;
  return (
    <article className="motion-card flex gap-4 rounded-2xl border border-navy-200/60 bg-surface p-4 shadow-card">
      <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-navy-900 sm:block">
        {resource.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${resource.coverImageId}`} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wider text-white/60">
            {label(resource.format)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={resource.format === "story" ? "brand" : "neutral"}>{label(resource.format)}</Badge>
          <Badge tone="neutral">{label(resource.level)}</Badge>
          {resource.priceCents > 0 ? (
            <Badge tone="warning">Premium · {money(resource.priceCents, resource.currency ?? "GBP")}</Badge>
          ) : (
            <Badge tone="success">Free</Badge>
          )}
        </div>
        <h3 className="mt-2 text-[14px] font-semibold leading-snug text-navy-950">
          <Link href={target} className="hover:text-brand-700">
            {resource.title}
          </Link>
        </h3>
        {resource.summary ? <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{resource.summary}</p> : null}
        <ReasonChips reasons={reasons} />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-navy-500">
          {resource.creatorUsername ? (
            <Link href={`/u/${resource.creatorUsername}`} className="hover:underline">
              {resource.creatorName}
            </Link>
          ) : null}
          {resource.durationMinutes ? <span>{resource.durationMinutes} min</span> : null}
        </div>
      </div>
    </article>
  );
}

export function PersonCard({
  person,
  action,
  reasons,
}: {
  person: {
    id: string;
    username: string;
    displayName: string;
    bio: string | null;
    avatarFileId?: string | null;
    location?: string | null;
    skills?: { id: string; name: string }[];
  };
  action?: React.ReactNode;
  reasons?: string[];
}) {
  return (
    <article className="motion-card flex items-start gap-3 rounded-2xl border border-navy-200/60 bg-surface p-4 shadow-card">
      <Avatar name={person.displayName} size={44} src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold text-navy-950">
          <Link href={`/u/${person.username}`} className="hover:text-brand-700">
            {person.displayName}
          </Link>
        </h3>
        <p className="text-[11px] text-navy-500">
          @{person.username}
          {person.location ? ` · ${person.location}` : ""}
        </p>
        {person.bio ? <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-navy-600">{person.bio}</p> : null}
        <ReasonChips reasons={reasons} />
        {person.skills && person.skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {person.skills.slice(0, 3).map((skill) => (
              <SkillTag key={skill.id} name={skill.name} />
            ))}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </article>
  );
}

export function StoryCard({
  board,
  projectName,
}: {
  board: { id: string; title: string; summary: string | null; status: string; projectId?: string | null };
  projectName?: string | null;
}) {
  return (
    <article className="ink-card flex flex-col justify-between rounded-2xl border border-white/10 p-5 text-white shadow-card">
      <div>
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand" className="bg-white/15 text-white">
            Animated story
          </Badge>
          <StatusBadge status={board.status} className="bg-white/10 text-white" />
        </div>
        <h3 className="mt-3 text-[15px] font-semibold leading-snug">{board.title}</h3>
        {board.summary ? <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-white/70">{board.summary}</p> : null}
      </div>
      <Link
        href={board.projectId ? `/projects/${board.projectId}/story?board=${board.id}` : `/learn/${board.id}`}
        className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-white/80 hover:text-white"
      >
        {projectName ? `From ${projectName}` : "Open story"}
        <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </article>
  );
}

export function MilestoneRow({
  milestone,
  action,
}: {
  milestone: { id: string; title: string; description: string | null; status: string; dueDate: string | null; completedAt: string | null };
  action?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          milestone.status === "completed"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : milestone.status === "in_progress"
              ? "border-brand-500 bg-surface text-brand-600"
              : "border-navy-300 bg-surface",
        )}
        aria-hidden="true"
      >
        {milestone.status === "completed" ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-[13px] font-semibold", milestone.status === "completed" ? "text-navy-500 line-through" : "text-navy-900")}>
            {milestone.title}
          </p>
          <StatusBadge status={milestone.status} />
        </div>
        {milestone.description ? <p className="mt-0.5 text-[12px] leading-5 text-navy-600">{milestone.description}</p> : null}
        <p className="mt-0.5 text-[11px] text-navy-400">
          {milestone.completedAt
            ? `Completed ${new Date(milestone.completedAt).toLocaleDateString("en-GB")}`
            : milestone.dueDate
              ? `Due ${new Date(milestone.dueDate).toLocaleDateString("en-GB")}`
              : "No due date"}
        </p>
      </div>
      {action}
    </li>
  );
}

export function TaskRow({
  task,
  href,
}: {
  task: { id: string; title: string; status: string; visibility: string; effort: string | null; deadline: string | null; assigneeCount?: number; interestCount?: number };
  href: string;
}) {
  return (
    <li className="border-b border-navy-100 last:border-0">
      <Link href={href} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-navy-50/60">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-navy-900">{task.title}</p>
          <p className="mt-0.5 text-[11px] text-navy-500">
            {task.effort ?? "Effort not stated"}
            {task.deadline ? ` · due ${new Date(task.deadline).toLocaleDateString("en-GB")}` : ""}
            {task.visibility !== "public" ? ` · ${label(task.visibility)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {typeof task.interestCount === "number" && task.interestCount > 0 ? (
            <Badge tone="warning">{task.interestCount} interested</Badge>
          ) : null}
          {typeof task.assigneeCount === "number" && task.assigneeCount > 0 ? (
            <Badge tone="brand">{task.assigneeCount} assigned</Badge>
          ) : null}
          <TaskStatusBadge status={task.status} />
        </div>
      </Link>
    </li>
  );
}

export function MiniBarChart({ data, label }: { data: { day: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <figure>
      <figcaption className="mb-2 text-[11px] font-medium uppercase tracking-wide text-navy-500">{label}</figcaption>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`${label}: ${data.map((d) => `${d.day} ${d.count}`).join(", ")}`}>
        {data.length === 0 ? <p className="text-[12px] text-navy-400">No data yet.</p> : null}
        {data.map((item) => (
          <div key={item.day} className="group relative flex-1" title={`${item.day}: ${item.count}`}>
            <div
              className="w-full rounded-t bg-brand-500/80 transition group-hover:bg-brand-600"
              style={{ height: `${Math.max(4, (item.count / max) * 96)}px` }}
            />
          </div>
        ))}
      </div>
    </figure>
  );
}

export function ProgressSummary({ completed, total }: { completed: number; total: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-navy-500">
        <span>Milestones</span>
        <span>
          {completed} of {total}
        </span>
      </div>
      <Progress value={total ? (completed / total) * 100 : 0} label={undefined} />
    </div>
  );
}
