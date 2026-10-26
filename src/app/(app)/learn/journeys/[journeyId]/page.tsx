import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { learningResources, workLogEntries } from "@/db/schema";
import {
  addJourneyStepAction,
  approveJourneyAction,
  createResourceAction,
  publishJourneyAction,
} from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
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
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { label, JOURNEY_STEP_KINDS } from "@/lib/types";
import { journeyDetail } from "@/services/learning";
import { getProjectAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function JourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ journeyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { journeyId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const detail = journeyDetail(journeyId, user);
  if (!detail) notFound();

  const journey = detail.journey;
  const isCreator = journey.creatorId === user.id;
  const access = journey.projectId ? getProjectAccess(journey.projectId, user) : null;
  const canApprove = !!access?.canEdit;
  const canEdit = isCreator;

  const db = getDb();
  const sourceEntries = canEdit
    ? db.select().from(workLogEntries).where(eq(workLogEntries.taskId, journey.taskId ?? "")).orderBy(asc(workLogEntries.createdAt)).all()
    : [];

  const linkedResources = db.select().from(learningResources).where(eq(learningResources.journeyId, journeyId)).all();

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href="/learn" className="hover:underline">Learn</Link> /{" "}
        {detail.project ? (
          <>
            <Link href={`/projects/${detail.project.id}`} className="hover:underline">{detail.project.name}</Link> /{" "}
          </>
        ) : null}
        <span className="text-navy-700">{journey.title}</span>
      </nav>

      <PageHeader
        eyebrow="Learning journey"
        title={journey.title}
        description={journey.summary ?? undefined}
        meta={
          <>
            <StatusBadge status={journey.status} />
            <Badge tone={journey.visibility === "public" ? "success" : "neutral"}>{label(journey.visibility)}</Badge>
            <span>by {detail.creatorName}</span>
            <span>{detail.steps.length} steps</span>
            {journey.publishedAt ? <span>Published {formatDate(journey.publishedAt)}</span> : null}
          </>
        }
        actions={
          isCreator ? (
            <>
              {journey.status !== "published" ? (
                <form action={publishJourneyAction}>
                  <input type="hidden" name="journeyId" value={journeyId} />
                  <SubmitButton size="sm" pendingLabel="Publishing…" disabled={journey.status === "draft" && detail.steps.length < 2}>
                    Publish journey
                  </SubmitButton>
                </form>
              ) : null}
              {canApprove && journey.status !== "published" ? (
                <form action={approveJourneyAction}>
                  <input type="hidden" name="journeyId" value={journeyId} />
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                    Approve as project owner
                  </SubmitButton>
                </form>
              ) : null}
            </>
          ) : canApprove && journey.status !== "published" ? (
            <form action={approveJourneyAction}>
              <input type="hidden" name="journeyId" value={journeyId} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                Approve journey
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <Flash error={error} notice={notice} />

      {journey.status !== "published" && journey.visibility !== "public" ? (
        <div className="mb-4">
          <Alert tone="info" title="Private draft">
            Only you{canApprove ? " and the project owner" : ""} can see this journey. Publishing requires at least two steps
            {detail.project ? " and owner approval" : ""}.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {detail.steps.length === 0 ? (
            <Card className="p-6 text-[13px] text-navy-500">No steps yet. Add the first one below.</Card>
          ) : (
            <ol className="space-y-3">
              {detail.steps.map((step, index) => (
                <li key={step.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full ink-surface text-[11px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <h2 className="text-[14px] font-semibold text-navy-950">{step.title}</h2>
                      <Badge tone="brand">{label(step.kind)}</Badge>
                      {step.sourceType ? <Badge tone="neutral">source: {step.sourceType.replace("_", " ")}</Badge> : null}
                    </div>
                    <div className="prose-bt mt-2 whitespace-pre-line text-[13.5px]">{step.body}</div>
                    {step.sourceId ? (
                      <p className="mt-2 text-[10.5px] text-navy-400">
                        Linked source record: <code className="font-mono">{step.sourceId.slice(0, 8)}…</code>
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ol>
          )}

          {canEdit ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Add a step</h2>
              <form action={addJourneyStepAction} className="mt-3 space-y-3">
                <input type="hidden" name="journeyId" value={journeyId} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Step title" htmlFor="step-title" required>
                    <Input id="step-title" name="title" required maxLength={160} />
                  </Field>
                  <Field label="Step type" htmlFor="step-kind">
                    <Select id="step-kind" name="kind" defaultValue="context">
                      {JOURNEY_STEP_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {label(kind)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="What happened / what did you learn?" htmlFor="step-body" required>
                  <Textarea id="step-body" name="body" rows={5} required maxLength={8000} />
                </Field>
                {sourceEntries.length > 0 ? (
                  <Field label="Cite a source entry (optional)" htmlFor="sourceId" hint="Only entries you are allowed to use are listed.">
                    <Select id="sourceId" name="sourceId" defaultValue="">
                      <option value="">No linked source</option>
                      {sourceEntries
                        .filter((entry) => entry.visibility === "public" || entry.authorId === user.id)
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.title} ({entry.visibility})
                          </option>
                        ))}
                    </Select>
                  </Field>
                ) : null}
                <SubmitButton pendingLabel="Adding…">Add step</SubmitButton>
              </form>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          {detail.project ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Source project</h2>
              <p className="mt-1.5 text-[12.5px] font-medium text-navy-900">{detail.project.name}</p>
              <p className="mt-0.5 text-[11px] text-navy-500">{label(detail.project.stage)} · {label(detail.project.category)}</p>
              <ButtonLink href={`/projects/${detail.project.id}`} size="sm" variant="secondary" className="mt-2">
                Open project
              </ButtonLink>
            </Card>
          ) : null}

          {linkedResources.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Linked learning</h2>
              <ul className="mt-2 space-y-1.5">
                {linkedResources.map((resource) => (
                  <li key={resource.id}>
                    <Link href={`/learn/${resource.id}`} className="text-[11.5px] font-medium text-brand-700 hover:underline">
                      {resource.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {isCreator ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Publish as a resource</h2>
              <p className="mt-1 text-[11px] leading-5 text-navy-600">
                Create a learning resource from this journey so it appears in the learning centre.
              </p>
              <form action={createResourceAction} className="mt-2 space-y-2">
                <input type="hidden" name="journeyId" value={journeyId} />
                <input type="hidden" name="projectId" value={journey.projectId ?? ""} />
                <input type="hidden" name="taskId" value={journey.taskId ?? ""} />
                <input type="hidden" name="format" value="article" />
                <input type="hidden" name="level" value="intermediate" />
                <Field label="Resource title" htmlFor="resource-title">
                  <Input id="resource-title" name="title" defaultValue={journey.title} required />
                </Field>
                <Field label="Summary" htmlFor="resource-summary">
                  <Textarea id="resource-summary" name="summary" defaultValue={journey.summary ?? ""} rows={2} />
                </Field>
                <Field label="Body" htmlFor="resource-body">
                  <Textarea
                    id="resource-body"
                    name="body"
                    rows={4}
                    defaultValue={detail.steps.map((step) => `## ${step.title}\n\n${step.body}`).join("\n\n")}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[11px] text-navy-700">
                  <input type="checkbox" name="publish" defaultChecked className="h-3.5 w-3.5 rounded border-navy-300" />
                  Publish to the learning centre
                </label>
                <SubmitButton size="sm" className="w-full" pendingLabel="Creating…">
                  Create resource
                </SubmitButton>
              </form>
            </Card>
          ) : null}

          <div className="rounded-lg border border-navy-200 bg-surface p-3 text-[10.5px] leading-4 text-navy-500">
            Journeys cite their sources. If a step has no source, it is the author's account and should say so. CC-style
            attribution must be agreed with contributors before publication.
          </div>
        </aside>
      </div>
    </div>
  );
}
