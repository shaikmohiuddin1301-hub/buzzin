import Link from "next/link";
import { notFound } from "next/navigation";
import { createTaskAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { TaskRow } from "@/components/cards";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { projectDetail } from "@/services/projects";
import { listTasks } from "@/services/tasks";
import { workAreaDropdown } from "@/services/workAreas";
import { COMPENSATION_TYPES, TASK_PRIORITIES, TASK_STATUSES, VISIBILITIES, label, taskStatusLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The same four steps people use everywhere else: To do → In progress → Needs review → Approved. */
const COLUMNS: { id: string; label: string; statuses: string[] }[] = [
  { id: "draft", label: "Draft", statuses: ["draft"] },
  { id: "open", label: "To do", statuses: ["open", "reviewing_interest"] },
  { id: "active", label: "In progress", statuses: ["assigned", "in_progress", "revision_requested"] },
  { id: "review", label: "Needs review", statuses: ["submitted"] },
  { id: "done", label: "Approved", statuses: ["completed"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

export default async function ProjectTasksPage({
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

  const tasks = listTasks(projectId, user);
  const view = query.view === "board" ? "board" : query.view === "new" ? "new" : "list";

  if (!detail.access.canViewWorkspace) {
    return (
      <div>
        <PageHeader title={`${detail.project.name} · Tasks`} />
        <Alert tone="info" title="Team access required">
          Only accepted project members can see the full task list. Public tasks are listed on the project page.
        </Alert>
        <div className="mt-4">
          <ButtonLink href={`/projects/${projectId}`} variant="secondary">
            Back to project
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={detail.project.name}
        title="Tasks"
        description="Break the work into scoped tasks with acceptance criteria. Contributors cannot be assigned to a task that has no definition of done."
        actions={
          <>
            <ButtonLink href={`/projects/${projectId}?tab=tasks`} variant="ghost" size="sm">
              Project view
            </ButtonLink>
            <ButtonLink href={`/projects/${projectId}`} variant="secondary" size="sm">
              Back to project
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={view}
        items={[
          { id: "list", label: `List (${tasks.length})`, href: `/projects/${projectId}/tasks?view=list` },
          { id: "board", label: "Board", href: `/projects/${projectId}/tasks?view=board` },
          { id: "new", label: "New task", href: `/projects/${projectId}/tasks?view=new` },
        ]}
      />

      {view === "list" ? (
        <Card>
          <ul>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} href={`/tasks/${task.id}`} />
            ))}
          </ul>
          {tasks.length === 0 ? <p className="p-6 text-[13px] text-navy-500">No tasks yet. Create the first one.</p> : null}
        </Card>
      ) : null}

      {view === "board" ? (
        <div className="grid gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((column) => {
            const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));
            return (
              <section key={column.id} className="min-w-[190px] rounded-xl border border-navy-200 bg-navy-50/60 p-2.5">
                <h2 className="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-navy-600">
                  {column.label}
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-navy-500">{columnTasks.length}</span>
                </h2>
                <ul className="mt-2 space-y-2">
                  {columnTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="block rounded-lg border border-navy-200 bg-surface p-2.5 shadow-sm hover:border-brand-300"
                      >
                        <p className="text-[12px] font-medium leading-5 text-navy-900">{task.title}</p>
                        <p className="mt-1 text-[10px] text-navy-500">
                          {task.visibility === "public" ? "Public" : "Team only"}
                          {task.assigneeCount > 0 ? ` · ${task.assigneeCount} assigned` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge tone={task.compensationType === "paid" ? "success" : "neutral"}>{label(task.compensationType)}</Badge>
                          {task.interestCount > 0 ? <Badge tone="warning">{task.interestCount}</Badge> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                  {columnTasks.length === 0 ? <li className="px-1 py-2 text-[11px] text-navy-400">Empty</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === "new" ? (
        detail.access.canEdit ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-navy-950">New task</h2>
            <p className="mt-0.5 text-[12.5px] text-navy-500">
              Leave it as a draft until you are ready. Publishing requires acceptance criteria and, for unpaid work, a
              stated non-monetary benefit.
            </p>
            <form action={createTaskAction} className="mt-4 space-y-4">
              <input type="hidden" name="projectId" value={projectId} />
              <Field label="Title" htmlFor="title" required>
                <Input id="title" name="title" required maxLength={160} placeholder="Build the readings dashboard (alpha)" />
              </Field>
              <Field label="What does done look like?" htmlFor="objective" hint="One sentence: what should be true when this is done?">
                <Textarea id="objective" name="objective" rows={2} maxLength={2000} />
              </Field>
              <Field label="Acceptance criteria" htmlFor="acceptanceCriteria" required hint="How you and the reviewer will know it is done. Required before publishing.">
                <Textarea id="acceptanceCriteria" name="acceptanceCriteria" rows={3} maxLength={4000} />
              </Field>

              <details className="rounded-lg border border-navy-200 bg-navy-50/40 px-3 py-2.5">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-navy-800">More options (optional)</summary>
                <div className="mt-3 space-y-4">
                  <Field label="Deliverables" htmlFor="deliverablesSpec" hint="What exactly will be handed over?">
                    <Textarea id="deliverablesSpec" name="deliverablesSpec" rows={2} maxLength={4000} />
                  </Field>
                  <Field label="Detailed description" htmlFor="description">
                    <Textarea id="description" name="description" rows={3} maxLength={6000} />
                  </Field>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Effort" htmlFor="effort">
                  <Input id="effort" name="effort" placeholder="12 hours" maxLength={80} />
                </Field>
                <Field label="Deadline" htmlFor="deadline">
                  <Input id="deadline" name="deadline" type="date" />
                </Field>
                <Field label="Visibility" htmlFor="visibility">
                  <Select id="visibility" name="visibility" defaultValue="public">
                    {VISIBILITIES.map((visibility) => (
                      <option key={visibility} value={visibility}>
                        {label(visibility)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Skills" htmlFor="skills">
                  <Input id="skills" name="skills" placeholder="React, accessibility" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Priority" htmlFor="priority">
                  <Select id="priority" name="priority" defaultValue="normal">
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {label(priority)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Work area" htmlFor="workAreaId" hint="Its home in the project. You can move it after creating it.">
                  <Select id="workAreaId" name="workAreaId" defaultValue="">
                    <option value="">Project inbox</option>
                    {workAreaDropdown(projectId).map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Arrangement" htmlFor="compensationType">
                  <Select id="compensationType" name="compensationType" defaultValue="unpaid">
                    {COMPENSATION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {label(type)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="What the contributor receives"
                  htmlFor="compensationDetails"
                  hint="Required for unpaid tasks: credit, reference, expenses, learning."
                >
                  <Textarea id="compensationDetails" name="compensationDetails" rows={2} maxLength={2000} />
                </Field>
              </div>
                  <Field label="Confidentiality notes" htmlFor="confidentiality">
                    <Textarea id="confidentiality" name="confidentiality" rows={2} maxLength={2000} placeholder="What must not be published?" />
                  </Field>
                </div>
              </details>

              <Alert tone="warning" title="Before publishing">
                Unpaid collaboration must be genuinely voluntary and lawful in your jurisdiction. Listing a task does not make
                unpaid work lawful, and it does not create an employment relationship.
              </Alert>

              <div className="flex flex-wrap gap-2">
                <SubmitButton name="publish" value="on" pendingLabel="Publishing…">
                  Publish task
                </SubmitButton>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save as draft
                </SubmitButton>
              </div>
            </form>
          </Card>
        ) : (
          <Alert tone="warning">Only project owners and admins can create tasks.</Alert>
        )
      ) : null}

      {tasks.length > 0 ? (
        <p className="mt-3 text-[11px] text-navy-500">
          Statuses: {TASK_STATUSES.map((status) => taskStatusLabel(status)).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
