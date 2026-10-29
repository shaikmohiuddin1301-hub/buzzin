import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FolderCheck, MessageSquare } from "lucide-react";
import { openWorkAreaChatAction } from "@/app/actions/workAreas";
import { SubmitButton } from "@/components/client/submit-button";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, TaskStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getWorkArea } from "@/services/workAreas";
import { projectAcceptedWork } from "@/services/accepted";
import { listTasks } from "@/services/tasks";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WorkAreaPage({
  params,
}: {
  params: Promise<{ projectId: string; areaId: string }>;
}) {
  const { projectId, areaId } = await params;
  const user = await requireUser();

  let area;
  try {
    area = getWorkArea(areaId, user);
  } catch {
    notFound();
  }
  if (area.area.projectId !== projectId) notFound();
  if (!area.access.canView) notFound();

  const drops = listTasks(projectId, user).filter((task) => task.workAreaId === areaId);
  const accepted = projectAcceptedWork(projectId, user).items.filter((item) => item.workAreaId === areaId);
  const open = drops.filter((task) => !["completed", "cancelled"].includes(task.status));

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${projectId}`} className="hover:underline">
          {area.access.project.name}
        </Link>{" "}
        / <span className="text-navy-700">{area.area.name}</span>
      </nav>

      <PageHeader
        eyebrow="Work area"
        title={area.area.name}
        description={area.area.description ?? "The tasks filed here, the conversation about them, and the work that was accepted."}
        meta={
          <>
            <span>{open.length} open {open.length === 1 ? "task" : "tasks"}</span>
            <span>{accepted.length} accepted</span>
          </>
        }
        actions={
          <>
            {area.access.canViewWorkspace ? (
              <form action={openWorkAreaChatAction}>
                <input type="hidden" name="areaId" value={areaId} />
                <input type="hidden" name="projectId" value={projectId} />
                <SubmitButton variant="secondary" size="sm" pendingLabel="Opening…">
                  <MessageSquare size={13} aria-hidden="true" /> Open area chat
                </SubmitButton>
              </form>
            ) : null}
            {area.access.canEdit ? (
              <ButtonLink href={`/projects/${projectId}/tasks`} variant="creative" size="sm">
                New task
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">Tasks in this area</h2>
          <p className="mt-0.5 text-[12px] text-navy-500">Each task has exactly one home. Moving it updates this list.</p>
          {drops.length === 0 ? (
            <p className="mt-3 text-[13px] text-navy-500">No tasks filed here yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-navy-200">
              {drops.map((task) => (
                <li key={task.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/tasks/${task.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                      {task.title}
                    </Link>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-navy-500">
                    Updated {relativeTime(task.updatedAt)}
                    {task.assigneeCount > 0 ? ` · ${task.assigneeCount} assigned` : " · unassigned"}
                    {task.visibility !== "public" ? " · private" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-navy-950">
            <FolderCheck size={15} aria-hidden="true" /> Accepted work
          </h2>
          <p className="mt-0.5 text-[12px] text-navy-500">Approved deliverables filed here, from the original task records.</p>
          {accepted.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={20} aria-hidden="true" />}
              title="Nothing accepted here yet"
              description="When a reviewer approves a submission in this area, the deliverable appears here automatically."
            />
          ) : (
            <ul className="mt-3 divide-y divide-navy-200">
              {accepted.map((item) => (
                <li key={item.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/tasks/${item.taskId}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                      {item.title}
                    </Link>
                    <Badge tone="success">Accepted</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-navy-500">
                    {item.contributor?.name ?? "Contributor not recorded"}
                    {item.reviewerName ? ` · accepted by ${item.reviewerName}` : ""}
                    {item.reviewedAt ? ` · ${relativeTime(item.reviewedAt)}` : ""}
                  </p>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[11.5px] text-blue-600 underline">
                      Open deliverable
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
