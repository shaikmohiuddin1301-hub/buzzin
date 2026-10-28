import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { BookLock, Eye, Lock, NotebookPen, ShieldCheck } from "lucide-react";
import { getDb } from "@/db/client";
import { consentRecords, learningJourneys } from "@/db/schema";
import {
  addWorkLogAction,
  approveWorkLogAction,
  updateWorkLogAction,
  withdrawConsentAction,
} from "@/app/actions/projects";
import { createJourneyAction, draftJourneyFromTaskAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { AttachmentLink } from "@/components/media";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime, truncate } from "@/lib/format";
import { label, WORK_LOG_KINDS, WORK_LOG_VISIBILITIES } from "@/lib/types";
import { workspaceFor } from "@/services/worklog";
import { signedMediaUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const KIND_HINTS: Record<string, string> = {
  note: "Something you observed or did",
  image: "A screenshot or photo with context",
  link: "A reference, source or prior art",
  decision: "A choice and the reasoning behind it",
  experiment: "Something you tried and what happened",
  challenge: "Something that blocked you",
  revision: "What changed after feedback",
  deliverable: "A work product ready for review",
  lesson: "What you would tell the next person",
};

export default async function WorkspacePage({
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
  const workspace = workspaceFor(taskId, user);
  const { access } = workspace;

  if (!access.canViewWorkspace) {
    return (
      <div>
        <PageHeader title="Contributor workspace" />
        <Alert tone="warning" title="This workspace is private">
          Only the assigned contributor and the project team can open the workspace. If you are working on this task, ask the
          owner to assign it to you first.
        </Alert>
        <div className="mt-4">
          <ButtonLink href={`/tasks/${taskId}`} variant="secondary">
            Back to task
          </ButtonLink>
        </div>
      </div>
    );
  }

  const project = access.projectAccess.project;
  const db = getDb();
  const consentRows = db
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, user.id), eq(consentRecords.projectId, project.id)))
    .all();
  const consentGranted = consentRows.some((row) => row.scope === "public_story" && row.granted && !row.revokedAt);

  const journeys = db
    .select()
    .from(learningJourneys)
    .where(and(eq(learningJourneys.taskId, taskId), eq(learningJourneys.creatorId, user.id)))
    .orderBy(asc(learningJourneys.createdAt))
    .all();

  const publicCount = workspace.entries.filter((entry) => entry.entry.visibility === "public").length;
  const pendingCount = workspace.entries.filter((entry) => entry.entry.visibility === "public_pending").length;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link> /{" "}
        <Link href={`/tasks/${taskId}`} className="hover:underline">{truncate(access.task.title, 40)}</Link> /{" "}
        <span className="text-navy-700">Workspace</span>
      </nav>

      <PageHeader
        eyebrow="Contributor workspace"
        title={access.task.title}
        description="Document the process as it happens. You choose the visibility of every entry, and you can change it later."
        meta={
          <>
            <span>{workspace.entries.length} entries</span>
            <span>{publicCount} public</span>
            <span>{pendingCount} awaiting approval</span>
            <span>
              Public documentation is <strong>{project.allowPublicDocs ? "enabled" : "disabled"}</strong> on this project
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink href={`/tasks/${taskId}`} variant="secondary" size="sm">
              Task page
            </ButtonLink>
            <ButtonLink href={`/tasks/${taskId}/learning-journey`} variant="ghost" size="sm">
              Build a journey
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
              <NotebookPen size={15} aria-hidden="true" /> Add an entry
            </h2>
            <form action={addWorkLogAction} encType="multipart/form-data" className="mt-3 space-y-3">
              <input type="hidden" name="taskId" value={taskId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type of entry" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue="note">
                    {WORK_LOG_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {label(kind)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Title" htmlFor="title" required>
                  <Input id="title" name="title" required maxLength={160} placeholder="First ingress test failed" />
                </Field>
              </div>
              <Field label="What happened, and what did you learn?" htmlFor="body" hint="Write for the person doing this next. Include the boring details.">
                <Textarea id="body" name="body" rows={5} maxLength={12000} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Reference link (optional)" htmlFor="linkUrl">
                  <Input id="linkUrl" name="linkUrl" type="url" placeholder="https://…" />
                </Field>
                <Field label="Attach a file (optional)" htmlFor="file">
                  <Input id="file" name="file" type="file" />
                </Field>
              </div>
              <Field
                label="Who can see this entry?"
                htmlFor="visibility"
                hint="Public requires the project to allow public documentation, and your consent. Withdrawing consent later hides it again."
              >
                <Select id="visibility" name="visibility" defaultValue="team">
                  <option value="private">Private to me</option>
                  <option value="team">Project team only</option>
                  {project.allowPublicDocs ? (
                    <>
                      <option value="public_pending">Team now, request public approval</option>
                      <option value="public">Public immediately (consent recorded)</option>
                    </>
                  ) : null}
                </Select>
              </Field>
              <SubmitButton pendingLabel="Saving entry…">Save entry</SubmitButton>
            </form>
          </Card>

          {workspace.entries.length === 0 ? (
            <EmptyState
              title="No entries yet"
              description="Start with the first thing you tried, even if it did not work. That is usually the most useful entry."
            />
          ) : (
            <div className="space-y-3">
              {workspace.entries.map((row) => {
                const entry = row.entry;
                const isAuthor = entry.authorId === user.id;
                return (
                  <Card key={entry.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.authorName} size={26} src={row.authorAvatar ? `/api/files/${row.authorAvatar}` : null} />
                        <div>
                          <p className="text-[12.5px] font-medium text-navy-900">{row.authorName}</p>
                          <p className="text-[10.5px] text-navy-400">
                            {relativeTime(entry.createdAt)} · {label(entry.kind)}
                            {entry.updatedAt !== entry.createdAt ? " · edited" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={
                            entry.visibility === "public"
                              ? "success"
                              : entry.visibility === "public_pending"
                                ? "warning"
                                : entry.visibility === "private"
                                  ? "neutral"
                                  : "info"
                          }
                        >
                          {entry.visibility === "public" ? <Eye size={10} aria-hidden="true" /> : null}
                          {entry.visibility === "private" ? <Lock size={10} aria-hidden="true" /> : null}
                          {entry.visibility === "team" ? <BookLock size={10} aria-hidden="true" /> : null}
                          {label(entry.visibility)}
                        </Badge>
                        {entry.approvedAt ? <Badge tone="success">approved</Badge> : null}
                      </div>
                    </div>

                    <h3 className="mt-2 text-[13.5px] font-semibold text-navy-950">{entry.title}</h3>
                    {entry.body ? <p className="mt-1 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{entry.body}</p> : null}

                    {entry.linkUrl ? (
                      <a href={entry.linkUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-[11.5px] font-medium text-brand-600 underline">
                        {entry.linkUrl}
                      </a>
                    ) : null}

                    {row.file ? (
                      <div className="mt-2">
                        <AttachmentLink
                          fileId={row.file.id}
                          filename={row.file.filename}
                          mimeType={row.file.mimeType}
                          sizeBytes={row.file.sizeBytes}
                          signed={signedMediaUrl(row.file.id)}
                        />
                      </div>
                    ) : null}

                    {entry.editHistory && entry.editHistory.length > 0 ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10.5px] text-navy-400">Edit history ({entry.editHistory.length})</summary>
                        <ul className="mt-1 space-y-0.5 text-[10.5px] text-navy-500">
                          {entry.editHistory.map((edit, index) => (
                            <li key={index}>
                              {formatDate(edit.at, { time: true })} — {edit.summary}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-navy-200 pt-2">
                      {access.canReview && entry.visibility === "public_pending" ? (
                        <form action={approveWorkLogAction}>
                          <input type="hidden" name="taskId" value={taskId} />
                          <input type="hidden" name="entryId" value={entry.id} />
                          <SubmitButton size="sm" pendingLabel="…">
                            <ShieldCheck size={12} aria-hidden="true" /> Approve for public
                          </SubmitButton>
                        </form>
                      ) : null}

                      {isAuthor ? (
                        <details className="w-full">
                          <summary className="cursor-pointer text-[11px] font-medium text-navy-600 hover:text-navy-900">
                            Edit entry
                          </summary>
                          <form action={updateWorkLogAction} className="mt-2 space-y-2">
                            <input type="hidden" name="taskId" value={taskId} />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <Field label="Title" htmlFor={`title-${entry.id}`}>
                              <Input id={`title-${entry.id}`} name="title" defaultValue={entry.title} />
                            </Field>
                            <Field label="Body" htmlFor={`body-${entry.id}`}>
                              <Textarea id={`body-${entry.id}`} name="body" defaultValue={entry.body ?? ""} rows={4} />
                            </Field>
                            <Field label="Visibility" htmlFor={`vis-${entry.id}`}>
                              <Select id={`vis-${entry.id}`} name="visibility" defaultValue={entry.visibility}>
                                <option value="private">Private to me</option>
                                <option value="team">Project team only</option>
                                {project.allowPublicDocs ? (
                                  <>
                                    <option value="public_pending">Request public approval</option>
                                    <option value="public">Public immediately</option>
                                  </>
                                ) : null}
                              </Select>
                            </Field>
                            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                              Save changes
                            </SubmitButton>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Consent</h2>
            <p className="mt-1.5 text-[11.5px] leading-5 text-navy-600">
              Public story generation only uses entries from contributors who have consented. This is separate from making an
              individual entry public.
            </p>
            <p className="mt-2 text-[11.5px] font-medium text-navy-800">
              Status: {consentGranted ? <span className="text-emerald-600">granted</span> : <span className="text-amber-700">not granted</span>}
            </p>
            <form action={withdrawConsentAction} className="mt-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitButton size="sm" variant="secondary" confirmMessage="Withdraw consent and pull your public entries back to team-only?">
                Withdraw consent
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Turn this into learning</h2>
            <p className="mt-1.5 text-[11.5px] leading-5 text-navy-600">
              A journey is a sequence of steps that cite your approved entries. You can draft one now and edit it before
              publishing.
            </p>
            <form action={draftJourneyFromTaskAction} className="mt-2">
              <input type="hidden" name="taskId" value={taskId} />
              <SubmitButton size="sm" pendingLabel="Drafting…">
                Draft from approved entries
              </SubmitButton>
            </form>
            <form action={createJourneyAction} className="mt-3 space-y-2 border-t border-navy-200 pt-3">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="projectId" value={project.id} />
              <Field label="Or start manually" htmlFor="journey-title">
                <Input id="journey-title" name="title" placeholder="How we delivered…" />
              </Field>
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                Start empty journey
              </SubmitButton>
            </form>
            {journeys.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-navy-200 pt-2">
                {journeys.map((journey) => (
                  <li key={journey.id} className="flex items-center justify-between gap-2">
                    <Link href={`/learn/journeys/${journey.id}`} className="truncate text-[11.5px] font-medium text-brand-600 hover:underline">
                      {journey.title}
                    </Link>
                    <StatusBadge status={journey.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Visibility explained</h2>
            <dl className="mt-2 space-y-2 text-[11px] leading-5 text-navy-600">
              {WORK_LOG_VISIBILITIES.map((visibility) => (
                <div key={visibility} className={cn("rounded-md px-2 py-1.5", visibility === "public" ? "bg-emerald-50" : "bg-navy-50")}>
                  <dt className="font-semibold text-navy-800">{label(visibility)}</dt>
                  <dd>
                    {visibility === "private"
                      ? "Only you can read this, including the project owner."
                      : visibility === "team"
                        ? "Active project members only, including reviewers."
                        : visibility === "public_pending"
                          ? "Team now; the owner must approve before it becomes public."
                          : "Anyone, and it can be used in public stories once approved."}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
            <p className="font-semibold">Never put client-confidential material in a public entry.</p>
            <p className="mt-1">
              If you are unsure whether something is confidential, keep it team-only until the owner confirms. AI story
              generation never reads team-only entries.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
