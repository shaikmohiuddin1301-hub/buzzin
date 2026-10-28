import Link from "next/link";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/authz";
import { projectsForUser } from "@/services/projects";

export const metadata = { title: "New task" };

export default async function NewTaskPage() {
  const user = await requireUser();
  const { owned, contributed } = projectsForUser(user.id);
  // A task always belongs to a project the person can actually edit; the server
  // checks the same thing again in createTask.
  const editable = [
    ...owned.map((project) => ({ project, relationship: "You lead this project" })),
    ...contributed
      .filter((project) => getProjectAccess(project.id, user)?.canEdit)
      .map((project) => ({ project, relationship: "You help run this project" })),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="New task"
        description="A task is one specific piece of work that helps move a project forward. Pick the project it belongs to."
      />

      {editable.length === 0 ? (
        <EmptyState
          title="You are not on a project team yet"
          description="Tasks live inside projects, so join or start one first."
          action={<ButtonLink href="/explore?tab=projects" size="sm">Find a project</ButtonLink>}
        />
      ) : (
        <ul className="space-y-2">
          {editable.map(({ project, relationship }) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}/tasks`} className="block">
                <Card className="motion-card flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-navy-950">{project.name}</p>
                    <p className="text-[11.5px] text-navy-500">{relationship}</p>
                  </div>
                  <span className="text-[12px] font-medium text-brand-600">Add a task</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[12px] leading-6 text-navy-500">
        You can also create a task from inside a project, from a work area, or from a message in a project chat.
      </p>
    </div>
  );
}
