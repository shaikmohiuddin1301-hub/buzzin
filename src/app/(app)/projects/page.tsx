import Link from "next/link";
import { CalendarDays, FolderKanban, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, StatusBadge, TaskStatusBadge } from "@/components/ui";
import { Reveal } from "@/components/client/reveal";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { label, type ProjectStage } from "@/lib/types";
import { projectsForUser } from "@/services/projects";
import { upcomingDeadlines } from "@/services/tasks";

export const metadata = { title: "Your projects" };
export const dynamic = "force-dynamic";

/**
 * The Projects destination: everything the signed-in person owns or contributes to, plus the
 * Tasks assigned to them. It links into each project's workspace rather than duplicating it.
 */
export default async function ProjectsPage() {
  const user = await requireUser();
  const { owned, contributed } = projectsForUser(user.id);
  const assigned = upcomingDeadlines(user.id);

  return (
    <div>
      <PageHeader
        eyebrow="Projects"
        title="Your projects"
        description="Projects you lead and projects you contribute to. Assigned work appears here and in each project's tasks."
        actions={
          <ButtonLink href="/projects/new" size="sm">
            <Plus size={15} aria-hidden="true" /> New project
          </ButtonLink>
        }
      />

      {assigned.length > 0 ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-navy-500">
            My work
            <span className="rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] text-navy-600">{assigned.length}</span>
          </h2>
          <Card className="mt-2 divide-y divide-navy-200">
            {assigned.map(({ task, projectName }) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-navy-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-navy-900">{task.title}</span>
                  <span className="block text-[11px] text-navy-500">{projectName}</span>
                </span>
                <span className="flex items-center gap-2">
                  {task.deadline ? (
                    <span className="flex items-center gap-1 text-[11px] text-navy-500">
                      <CalendarDays size={12} aria-hidden="true" /> {formatDate(task.deadline)}
                    </span>
                  ) : null}
                  <TaskStatusBadge status={task.status} />
                </span>
              </Link>
            ))}
          </Card>
        </section>
      ) : null}

      <ProjectGroup
        title="Projects you lead"
        empty={
          <EmptyState
            title="No projects yet"
            description="Start with a name, an outcome and a short description. The workspace, a project-wide chat and a work inbox are created for you."
            icon={<FolderKanban size={22} aria-hidden="true" />}
            action={<ButtonLink href="/projects/new" size="sm">Start a project</ButtonLink>}
          />
        }
        projects={owned.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.shortDescription,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
          canEdit: true,
        }))}
      />

      <ProjectGroup
        title="Projects you contribute to"
        empty={
          <EmptyState
            title="No contributions yet"
            description="Follow a project or apply to an open task and it will appear here once you join the team."
            action={<ButtonLink href="/explore" variant="secondary" size="sm">Explore projects</ButtonLink>}
          />
        }
        projects={contributed.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.shortDescription,
          status: project.status,
          stage: project.stage,
          updatedAt: project.updatedAt,
          canEdit: false,
        }))}
      />
    </div>
  );
}

function ProjectGroup({
  title,
  empty,
  projects,
}: {
  title: string;
  empty: React.ReactNode;
  projects: {
    id: string;
    name: string;
    description: string;
    status: string;
    stage: ProjectStage;
    updatedAt: string;
    canEdit: boolean;
  }[];
}) {
  return (
    <section className="mt-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-navy-500">{title}</h2>
      {projects.length === 0 ? (
        <div className="mt-2">{empty}</div>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {projects.map((project, index) => (
            <Reveal key={project.id} delay={Math.min(index * 45, 180)}>
            <Link
              href={`/projects/${project.id}`}
              className="motion-card block card-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-navy-950">{project.name}</h3>
                <StatusBadge status={project.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{project.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{label(project.stage)}</Badge>
                {project.canEdit ? <Badge tone="brand">You lead this</Badge> : <Badge tone="info">Contributor</Badge>}
                <span className="ml-auto text-[11px] text-navy-400">updated {relativeTime(project.updatedAt)}</span>
              </div>
            </Link>
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
}
