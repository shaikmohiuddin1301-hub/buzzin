import Link from "next/link";
import { Card, EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { projectsForUser } from "@/services/projects";

export const metadata = { title: "New Drop" };

export default async function NewDropPage() {
  const user = await requireUser();
  const { owned, contributed } = projectsForUser(user.id);
  const editable = [
    ...owned.map((project) => ({ project, relationship: "You lead this project" })),
    ...contributed.map((project) => ({ project, relationship: "You contribute to this project" })),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="New Drop"
        description="A Drop is a task, request or deliverable with one home, a responsible person and a review. Pick the project it belongs to."
      />

      {editable.length === 0 ? (
        <EmptyState
          title="You are not on a project team yet"
          description="Drops live inside projects, so join or start one first. Standalone Drops are deliberately not supported."
          action={<ButtonLink href="/explore" size="sm">Find a project</ButtonLink>}
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
                  <span className="text-[12px] font-medium text-brand-700">Open Drops</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
