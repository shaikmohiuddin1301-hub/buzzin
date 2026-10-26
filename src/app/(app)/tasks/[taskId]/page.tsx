import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ClipboardList, FileUp, Link2, MessageSquare, NotebookPen } from "lucide-react";
import { getDb } from "@/db/client";
import { mediaFiles, projectMembers, users } from "@/db/schema";
import {
  addDependencyAction,
  assignContributorAction,
  confirmScopeAction,
  disputeAttributionAction,
  expressInterestAction,
  removeAssigneeAction,
  removeDependencyAction,
  reviewSubmissionAction,
  setTaskStatusAction,
  submitWorkAction,
} from "@/app/actions/projects";
import { commentAction } from "@/app/actions/social";
import { AcceptedWorkCelebration } from "@/components/client/accepted-work";
import { SubmitButton } from "@/components/client/submit-button";
import { CommentThread } from "@/components/comments";
import { ReportForm } from "@/components/report-form";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  SkillTag,
  StatusBadge,
  TaskStatusBadge,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { label, TASK_STATUSES, taskStatusLabel } from "@/lib/types";
import { assignTaskAreaAction } from "@/app/actions/workAreas";
import { listTaskDependencies } from "@/services/dependencies";
import { workAreaDropdown } from "@/services/workAreas";
import { listTasks, taskDetail } from "@/services/tasks";
import { listComments } from "@/services/social";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { taskId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const detail = taskDetail(taskId, user);
  if (!detail) notFound();

  const { task, projectAccess, assignees, submissions, files, reviews, interests, skills, canEdit, canReview, canSubmit, isAssignee, canViewWorkspace } = detail;
  const project = projectAccess.project;
  const returnTo = `/tasks/${taskId}`;
  const comments = listComments("task", taskId, user);
  // Set by reviewSubmissionAction only after the approval was written.
  const justApproved = query.approved === "1";
  const dependencies = listTaskDependencies(taskId, user);
  const areaOptions = workAreaDropdown(project.id);
  const currentArea = areaOptions.find((area) => area.id === task.workAreaId) ?? null;
  const prerequisiteCandidates = canEdit
    ? listTasks(project.id, user).filter((candidate) => candidate.id !== taskId)
    : [];
  // One list, one record per file: uploads from the task chat and the workspace are
  // filed against this task, so they can be found here rather than copied around.
  const taskFiles = canViewWorkspace
    ? getDb().select().from(mediaFiles).where(eq(mediaFiles.taskId, taskId)).orderBy(desc(mediaFiles.createdAt)).all()
    : [];

  const candidateMembers = canReview
    ? getDb()
        .select({ userId: users.id, username: users.username, displayName: users.displayName })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.status, "active")))
        .all()
        .filter((member) => !assignees.some((assignee) => assignee.userId === member.userId))
    : [];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>{" "}
        / <Link href={`/projects/${project.id}/tasks`} className="hover:underline">Tasks</Link> /{" "}
        <span className="text-navy-700">{task.title}</span>
      </nav>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            {currentArea ? (
              <Link href={`/projects/${project.id}/areas/${currentArea.id}`}>
                <Badge tone="brand">{currentArea.name}</Badge>
              </Link>
            ) : (
              <Badge tone="neutral">Project inbox</Badge>
            )}
            <Badge tone={task.visibility === "public" ? "success" : "neutral"}>{label(task.visibility)}</Badge>
            {task.priority !== "normal" ? (
              <Badge tone={task.priority === "high" ? "danger" : "neutral"}>{label(task.priority)} priority</Badge>
            ) : null}
            <Badge tone={task.compensationType === "paid" ? "success" : "neutral"}>{label(task.compensationType)}</Badge>
            {task.status === "draft" ? <Badge tone="warning">Not visible to contributors</Badge> : null}
          </span>
        }
        title={task.title}
        description={task.objective ?? task.description?.slice(0, 240)}
        meta={
          <>
            <span>Created {formatDate(task.createdAt)}</span>
            {task.deadline ? <span>Deadline {formatDate(task.deadline)}</span> : null}
            {task.effort ? <span>Effort {task.effort}</span> : null}
          </>
        }
        actions={
          <>
            {canViewWorkspace ? (
              <>
                <ButtonLink href={`/tasks/${taskId}/chat`} variant="secondary" size="sm">
                  <MessageSquare size={13} aria-hidden="true" /> Task chat
                </ButtonLink>
                <ButtonLink href={`/tasks/${taskId}/workspace`} variant="secondary" size="sm">
                  <NotebookPen size={13} aria-hidden="true" /> Workspace
                </ButtonLink>
              </>
            ) : null}
            {canReview ? (
              <ButtonLink href={`/tasks/${taskId}/learning-journey`} variant="ghost" size="sm">
                Learning journey
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Flash error={error} notice={notice} />
      <AcceptedWorkCelebration show={justApproved} title={task.title} />

      {dependencies.blocked ? (
        <div className="mb-5">
          <Alert tone="warning" title="Waiting on a prerequisite">
            <ul className="space-y-1">
              {dependencies.items
                .filter((item) => !item.satisfied)
                .map((item) => (
                  <li key={item.id}>
                    <Link href={`/tasks/${item.prerequisite.id}`} className="font-medium underline">
                      {item.prerequisite.title}
                    </Link>{" "}
                    <span className="text-[12px]">
                      is {label(item.prerequisite.status).toLowerCase()}
                      {item.reason ? ` — ${item.reason}` : "."}
                    </span>
                  </li>
                ))}
            </ul>
            {dependencies.restricted > 0 ? (
              <p className="mt-1">
                {dependencies.restricted} further {dependencies.restricted === 1 ? "prerequisite is" : "prerequisites are"} not
                visible to you.
              </p>
            ) : null}
          </Alert>
        </div>
      ) : dependencies.ready ? (
        <div className="mb-5">
          <Alert tone="success" title="Prerequisites approved">
            Every task this work depends on has been accepted, so it can start. The people responsible were notified.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">The work</h2>
            <div className="prose-bt mt-2 whitespace-pre-line text-[13.5px]">{task.description ?? "No detailed description was provided."}</div>

            {task.deliverablesSpec ? (
              <div className="mt-4 rounded-lg border border-navy-100 bg-navy-50/60 p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Deliverables</h3>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-navy-700">{task.deliverablesSpec}</p>
              </div>
            ) : null}

            {task.acceptanceCriteria ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Acceptance criteria</h3>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-emerald-900">{task.acceptanceCriteria}</p>
              </div>
            ) : (
              <Alert tone="warning" title="No acceptance criteria">
                This task cannot be published without acceptance criteria. If you are a contributor, ask the owner to define
                what done looks like before starting.
              </Alert>
            )}

            {task.compensationDetails ? (
              <div className="mt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">What the contributor receives</h3>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-700">{task.compensationDetails}</p>
              </div>
            ) : null}

            {task.confidentiality && canViewWorkspace ? (
              <div className="mt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Confidentiality</h3>
                <p className="mt-1 text-[12.5px] leading-6 text-navy-700">{task.confidentiality}</p>
              </div>
            ) : null}
          </Card>

          {canSubmit ? (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
                <FileUp size={15} aria-hidden="true" /> Submit your work
              </h2>
              <p className="mt-0.5 text-[12px] text-navy-500">
                Submitting moves the task to review. Uploading a file alone does not create a contribution record — the owner
                must accept it.
              </p>
              <form action={submitWorkAction} className="mt-3 space-y-3">
                <input type="hidden" name="taskId" value={taskId} />
                <Field label="What are you handing over?" htmlFor="note" required hint="Summarise what changed, what you tested, and any known limitations.">
                  <Textarea id="note" name="note" rows={4} required maxLength={4000} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Deliverable link" htmlFor="deliverableUrl" hint="Repository, document or deployment URL.">
                    <Input id="deliverableUrl" name="deliverableUrl" type="url" placeholder="https://…" />
                  </Field>
                  <Field label="Link title" htmlFor="deliverableTitle">
                    <Input id="deliverableTitle" name="deliverableTitle" placeholder="Pull request #12" />
                  </Field>
                </div>
                <Field label="Or upload a file" htmlFor="file" hint="Max 10MB. Files are private to the project team.">
                  <Input id="file" name="file" type="file" />
                </Field>
                <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
              </form>
            </Card>
          ) : null}

          {submissions.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Submissions</h2>
                <p className="text-[12px] text-navy-500">Every submission keeps its review record.</p>
              </div>
              <ul className="divide-y divide-navy-100">
                {submissions.map((row) => (
                  <li key={row.submission.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.submission.status} />
                      <span className="text-[12px] font-medium text-navy-800">{row.authorName}</span>
                      <time className="text-[11px] text-navy-400" dateTime={row.submission.submittedAt}>
                        {relativeTime(row.submission.submittedAt)}
                      </time>
                    </div>
                    {row.submission.note ? (
                      <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-navy-700">{row.submission.note}</p>
                    ) : null}
                    {row.submission.reviewNote ? (
                      <p className="mt-2 rounded-md bg-navy-50 px-2.5 py-1.5 text-[12px] text-navy-600">
                        <span className="font-semibold">Review:</span> {row.submission.reviewNote}
                      </p>
                    ) : null}

                    <ul className="mt-2 space-y-1">
                      {files
                        .filter((file) => file.submissionId === row.submission.id)
                        .map((file) => (
                          <li key={file.id} className="text-[12px]">
                            {file.url ? (
                              <a href={file.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">
                                {file.title}
                              </a>
                            ) : (
                              <Link href={file.fileId ? `/api/files/${file.fileId}` : "#"} className="text-brand-700 underline">
                                {file.title}
                              </Link>
                            )}
                            {file.approved ? <Badge tone="success" className="ml-2">approved</Badge> : null}
                          </li>
                        ))}
                    </ul>

                    {canReview && row.submission.status === "submitted" ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <form action={reviewSubmissionAction} className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                          <input type="hidden" name="taskId" value={taskId} />
                          <input type="hidden" name="submissionId" value={row.submission.id} />
                          <input type="hidden" name="decision" value="accepted" />
                          <Field label="Approve with a note (optional)" htmlFor={`accept-${row.submission.id}`}>
                            <Textarea
                              id={`accept-${row.submission.id}`}
                              name="reason"
                              rows={2}
                              maxLength={2000}
                              placeholder="Meets the acceptance criteria because…"
                            />
                          </Field>
                          <SubmitButton size="sm" pendingLabel="…">
                            Approve work
                          </SubmitButton>
                          <p className="text-[10.5px] leading-4 text-navy-500">
                            Approved work moves to Accepted Work on the project. This cannot be undone.
                          </p>
                        </form>
                        <form action={reviewSubmissionAction} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                          <input type="hidden" name="taskId" value={taskId} />
                          <input type="hidden" name="submissionId" value={row.submission.id} />
                          <input type="hidden" name="decision" value="revision_requested" />
                          <Field label="Request changes (reason required)" htmlFor={`revise-${row.submission.id}`}>
                            <Textarea
                              id={`revise-${row.submission.id}`}
                              name="reason"
                              rows={2}
                              required
                              maxLength={2000}
                              placeholder="What needs to change, specifically?"
                            />
                          </Field>
                          <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                            Request changes
                          </SubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {taskFiles.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Files on this task</h2>
              <p className="mt-0.5 text-[12px] text-navy-500">
                Shared in the task chat or the workspace. Each file is one record — this list points at it.
              </p>
              <ul className="mt-3 space-y-1.5">
                {taskFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-navy-50/60 px-2.5 py-1.5 text-[12px]"
                  >
                    <a href={`/api/files/${file.id}`} className="font-medium text-brand-700 underline">
                      {file.filename}
                    </a>
                    <span className="text-[10.5px] text-navy-500">
                      {Math.max(1, Math.round(file.sizeBytes / 1024))} KB · {relativeTime(file.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {reviews.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Review history</h2>
              <ul className="mt-2 space-y-2">
                {reviews.map((row) => (
                  <li key={row.review.id} className="rounded-md bg-navy-50 p-2.5 text-[12px] text-navy-700">
                    <span className="font-semibold">{row.reviewerName}</span> — {label(row.review.decision)} on{" "}
                    {formatDate(row.review.createdAt)}
                    {row.review.reason ? <p className="mt-0.5 text-navy-600">{row.review.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
              <MessageSquare size={15} aria-hidden="true" /> Task discussion
            </h2>
            <div className="mt-3">
              <CommentThread
                comments={comments}
                targetType="task"
                targetId={taskId}
                returnTo={returnTo}
                canComment={canViewWorkspace || task.visibility === "public"}
              />
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Assigned to</h2>
            {assignees.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {assignees.map((assignee) => (
                  <li key={assignee.id} className="flex items-center gap-2">
                    <Avatar name={assignee.displayName} size={26} src={assignee.avatarFileId ? `/api/files/${assignee.avatarFileId}` : null} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/u/${assignee.username}`} className="block truncate text-[12px] font-medium text-navy-900 hover:underline">
                        {assignee.displayName}
                      </Link>
                      <p className="text-[10.5px] text-navy-500">
                        {assignee.scopeConfirmedAt ? "Scope confirmed" : "Scope not yet confirmed"}
                      </p>
                    </div>
                    {canReview ? (
                      <form action={removeAssigneeAction}>
                        <input type="hidden" name="taskId" value={taskId} />
                        <input type="hidden" name="userId" value={assignee.userId} />
                        <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                          Remove
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-navy-500">Nobody assigned yet.</p>
            )}

            {isAssignee && !assignees.find((a) => a.userId === user.id)?.scopeConfirmedAt ? (
              <form action={confirmScopeAction} className="mt-3">
                <input type="hidden" name="taskId" value={taskId} />
                <SubmitButton size="sm" className="w-full" pendingLabel="…">
                  Confirm scope
                </SubmitButton>
                <p className="mt-1 text-[10.5px] text-navy-500">
                  Confirming records that you agree the deliverables, deadline and arrangement.
                </p>
              </form>
            ) : null}
          </Card>

          {dependencies.items.length > 0 || canEdit ? (
            <Card className="p-4">
              <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
                <Link2 size={12} aria-hidden="true" /> Prerequisites
              </h2>
              {dependencies.items.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {dependencies.items.map((item) => (
                    <li key={item.id} className="text-[12px]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/tasks/${item.prerequisite.id}`} className="block font-medium text-navy-900 hover:underline">
                            {item.prerequisite.title}
                          </Link>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-navy-500">
                            <TaskStatusBadge status={item.prerequisite.status} />
                            {item.satisfied ? "Prerequisite met" : "Not approved yet"}
                          </p>
                          {item.reason ? <p className="mt-0.5 text-[11px] text-navy-500">{item.reason}</p> : null}
                        </div>
                        {canEdit ? (
                          <form action={removeDependencyAction}>
                            <input type="hidden" name="taskId" value={taskId} />
                            <input type="hidden" name="dependencyId" value={item.id} />
                            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                              Remove
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-navy-500">
                  No prerequisites. This work is ready whenever someone starts it.
                </p>
              )}

              {canEdit && prerequisiteCandidates.length > 0 ? (
                <form action={addDependencyAction} className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                  <input type="hidden" name="taskId" value={taskId} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <Field label="Requires" htmlFor="dependsOnTaskId" hint="The prerequisite is satisfied when that task is approved.">
                    <Select id="dependsOnTaskId" name="dependsOnTaskId" required defaultValue="">
                      <option value="">Choose a task…</option>
                      {prerequisiteCandidates
                        .filter((candidate) => !dependencies.items.some((item) => item.prerequisite.id === candidate.id))
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title} ({label(candidate.status)})
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Why" htmlFor="reason">
                    <Input id="reason" name="reason" maxLength={500} placeholder="Builds on this research" />
                  </Field>
                  <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                    Add prerequisite
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}

          {skills.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Skills</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <SkillTag key={skill.id} name={skill.name} href={`/explore?tab=projects&skill=${skill.slug}`} />
                ))}
              </div>
            </Card>
          ) : null}

          {canEdit ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Owner controls</h2>
              <form action={setTaskStatusAction} className="mt-2 space-y-2">
                <input type="hidden" name="taskId" value={taskId} />
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={task.status}>
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                  Update status
                </SubmitButton>
              </form>

              <form action={assignTaskAreaAction} className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                <input type="hidden" name="taskId" value={taskId} />
                <Field label="Work area" htmlFor="workAreaId" hint="Its canonical home, used by the Accepted Work collection.">
                  <Select id="workAreaId" name="workAreaId" defaultValue={task.workAreaId ?? ""}>
                    <option value="">Project inbox</option>
                    {areaOptions.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                  Move task
                </SubmitButton>
              </form>

              {candidateMembers.length > 0 ? (
                <form action={assignContributorAction} className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                  <input type="hidden" name="taskId" value={taskId} />
                  <Field label="Assign a team member" htmlFor="userId">
                    <Select id="userId" name="userId" required>
                      <option value="">Choose…</option>
                      {candidateMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName} (@{member.username})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Responsibilities" htmlFor="responsibilities">
                    <Input id="responsibilities" name="responsibilities" placeholder="Design, build, document" />
                  </Field>
                  <SubmitButton size="sm" className="w-full" pendingLabel="…">
                    Assign
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}

          {!isAssignee && task.status === "open" && task.visibility === "public" ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Interested?</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-navy-600">
                Tell the owner what you can do. This is a conversation, not a job application.
              </p>
              <form action={expressInterestAction} className="mt-2 space-y-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="intent" value="help_task" />
                <Field label="Message" htmlFor="eoi-message">
                  <Textarea id="eoi-message" name="message" rows={3} maxLength={2000} placeholder="Relevant experience and availability" />
                </Field>
                <Field label="Work sample" htmlFor="sampleUrl0">
                  <Input id="sampleUrl0" name="sampleUrl0" type="url" placeholder="https://…" />
                </Field>
                <SubmitButton size="sm" className="w-full" pendingLabel="…">
                  Express interest
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          {canReview && interests.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Interest ({interests.length})</h2>
              <ul className="mt-2 space-y-2">
                {interests.map((row) => (
                  <li key={row.eoi.id} className="rounded-md border border-navy-100 p-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.userName} size={22} src={row.avatarFileId ? `/api/files/${row.avatarFileId}` : null} />
                      <Link href={`/u/${row.username}`} className="text-[12px] font-medium text-navy-900 hover:underline">
                        {row.userName}
                      </Link>
                      <StatusBadge status={row.eoi.status} />
                    </div>
                    {row.eoi.message ? <p className="mt-1 text-[11px] leading-4 text-navy-600">{row.eoi.message}</p> : null}
                  </li>
                ))}
              </ul>
              <ButtonLink href={`/projects/${project.id}?tab=team`} size="sm" variant="ghost" className="mt-2 px-0">
                Review in project team page →
              </ButtonLink>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Task facts</h2>
            <div className="mt-2">
              <DefinitionList
                items={[
                  { term: "Project", value: <Link href={`/projects/${project.id}`} className="underline">{project.name}</Link> },
                  { term: "Visibility", value: label(task.visibility) },
                  { term: "Arrangement", value: label(task.compensationType) },
                  { term: "Published", value: task.publishedAt ? formatDate(task.publishedAt) : "Not published" },
                ]}
              />
            </div>
          </Card>

          <div className="flex items-center justify-between rounded-lg border border-navy-200 bg-surface px-3 py-2">
            <span className="text-[11px] text-navy-500">Wrong credit or content?</span>
            <ReportForm targetType="project" targetId={task.projectId} returnTo={returnTo} />
          </div>

          {!canViewWorkspace ? (
            <div className="rounded-lg border border-navy-200 bg-surface p-3">
              <p className="text-[11px] leading-5 text-navy-600">
                The contributor workspace is private to assigned contributors and the project team.
              </p>
              <ButtonLink href={`/projects/${project.id}`} size="sm" variant="secondary" className="mt-2">
                View project
              </ButtonLink>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
