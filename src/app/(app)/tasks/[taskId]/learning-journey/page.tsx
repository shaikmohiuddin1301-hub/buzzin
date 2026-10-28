import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { BookOpen, Library } from "lucide-react";
import { getDb } from "@/db/client";
import { learningJourneys, workLogEntries } from "@/db/schema";
import { createJourneyAction, draftJourneyFromTaskAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { label } from "@/lib/types";
import { getTaskAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function TaskJourneyPage({
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
  const access = getTaskAccess(taskId, user);
  if (!access || !access.canViewWorkspace) notFound();

  const db = getDb();
  const entries = db
    .select()
    .from(workLogEntries)
    .where(and(eq(workLogEntries.taskId, taskId), inArray(workLogEntries.visibility, ["public", "public_pending"])))
    .orderBy(asc(workLogEntries.createdAt))
    .all();

  const journeys = db
    .select()
    .from(learningJourneys)
    .where(eq(learningJourneys.taskId, taskId))
    .orderBy(desc(learningJourneys.createdAt))
    .all();

  // Mirrors the rule the draft action applies, so the list cannot promise entries
  // the draft would then refuse to cite.
  const eligible = entries.filter((entry) => entry.visibility === "public" || entry.authorId === user.id);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${access.task.projectId}`} className="hover:underline">
          Project
        </Link>{" "}
        / <Link href={`/tasks/${taskId}`} className="hover:underline">Task</Link> / <span className="text-navy-700">Learning journey</span>
      </nav>

      <PageHeader
        eyebrow="Learning from work"
        title="Turn this task into a learning journey"
        description="A journey is an ordered sequence of steps that each cite the documentation they came from. Drafting is automatic; publishing is deliberate."
        actions={
          <>
            <ButtonLink href={`/tasks/${taskId}/workspace`} variant="secondary" size="sm">
              Workspace
            </ButtonLink>
            <ButtonLink href={`/tasks/${taskId}`} variant="ghost" size="sm">
              Task
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
              <Library size={15} aria-hidden="true" /> Draft from approved documentation
            </h2>
            <p className="mt-1 text-[12.5px] leading-6 text-navy-600">
              The draft cites public entries and your own documentation. Other people&rsquo;s entries that are still awaiting
              approval are skipped, and the draft tells you how many.
            </p>
            <form action={draftJourneyFromTaskAction} className="mt-3">
              <input type="hidden" name="taskId" value={taskId} />
              <SubmitButton pendingLabel="Drafting…">Create draft journey</SubmitButton>
            </form>
          </Card>

          <Card>
            <div className="border-b border-navy-200 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-navy-950">Eligible entries ({eligible.length})</h2>
              <p className="text-[12px] text-navy-500">Public entries, plus your own documentation from this task.</p>
            </div>
            <ul className="divide-y divide-navy-200">
              {eligible.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12.5px] font-medium text-navy-900">{entry.title}</p>
                    <StatusBadge status={entry.visibility} />
                    <Badge tone="neutral">{label(entry.kind)}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-navy-500">{formatDate(entry.createdAt)}</p>
                  {entry.body ? <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{entry.body}</p> : null}
                </li>
              ))}
              {eligible.length === 0 ? (
                <li className="px-5 py-6 text-[13px] text-navy-500">
                  No eligible entries yet. Add documentation in the workspace and mark it for public use.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Start manually</h2>
            <form action={createJourneyAction} className="mt-2 space-y-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="projectId" value={access.task.projectId} />
              <Field label="Journey title" htmlFor="title">
                <Input id="title" name="title" required placeholder="How we delivered…" />
              </Field>
              <Field label="Summary" htmlFor="summary">
                <Textarea id="summary" name="summary" rows={2} maxLength={600} />
              </Field>
              <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                Start empty journey
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Existing journeys</h2>
            <ul className="mt-2 space-y-2">
              {journeys.map((journey) => (
                <li key={journey.id}>
                  <Link href={`/learn/journeys/${journey.id}`} className="text-[11.5px] font-medium text-brand-600 hover:underline">
                    {journey.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StatusBadge status={journey.status} />
                    <span className="text-[10px] text-navy-400">{journey.visibility}</span>
                  </div>
                </li>
              ))}
              {journeys.length === 0 ? <li className="text-[11.5px] text-navy-500">None yet.</li> : null}
            </ul>
          </Card>

          <Alert tone="info" title="What makes a good step">
            One idea per step. Name the constraint, what you tried, what happened, and what you would do differently. Link the
            work-log entry that proves it.
          </Alert>

          <div className="rounded-lg border border-navy-200 bg-surface p-3 text-[11px] leading-5 text-navy-600">
            <p className="flex items-center gap-1.5 font-semibold text-navy-800">
              <BookOpen size={12} aria-hidden="true" /> Publishing rules
            </p>
            <ul className="mt-1 space-y-1">
              <li>At least two steps are required.</li>
              <li>Project-linked journeys need owner approval before public release.</li>
              <li>Public steps cannot cite team-only documentation.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
