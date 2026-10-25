import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { BarChart3, BookOpen, Layers, Sparkles } from "lucide-react";
import { getDb } from "@/db/client";
import { learnerFeedback, learningResources, storyboards } from "@/db/schema";
import { createResourceAction } from "@/app/actions/learning";
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
  Select,
  Stat,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { label, RESOURCE_FORMATS, RESOURCE_LEVELS } from "@/lib/types";
import { journeysFor, resourcesForCreator } from "@/services/learning";
import { productsForCreator, salesSummary } from "@/services/commerce";
import { projectsForUser } from "@/services/projects";
import { reputationSummary } from "@/lib/reputation";

export const metadata = { title: "Creator studio" };

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();

  const resources = resourcesForCreator(user.id);
  const journeys = journeysFor(user.id);
  const products = productsForCreator(user.id);
  const sales = salesSummary(user.id);
  const projects = projectsForUser(user.id);
  const reputation = reputationSummary(user.id);
  const db = getDb();

  const feedbackCount = Number(
    db
      .select({ count: sql<number>`count(*)` })
      .from(learnerFeedback)
      .innerJoin(learningResources, eq(learningResources.id, learnerFeedback.resourceId))
      .where(eq(learningResources.creatorId, user.id))
      .get()?.count ?? 0,
  );

  const stories = db.select().from(storyboards).where(eq(storyboards.createdBy, user.id)).all();

  return (
    <div>
      <PageHeader
        eyebrow="Creator studio"
        title="Publish what you actually learned"
        description="Draft posts, journeys, resources and products. Nothing is public until you publish, and paid content requires a free preview."
        actions={
          <>
            <ButtonLink href="/studio/products" variant="secondary" size="sm">
              Products
            </ButtonLink>
            <ButtonLink href="/studio/sales" variant="ghost" size="sm">
              Sales & access
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Resources" value={resources.length} hint={`${resources.filter((r) => r.status === "published").length} published`} />
        <Stat label="Journeys" value={journeys.length} hint={`${journeys.filter((j) => j.status === "published").length} public`} />
        <Stat label="Products" value={products.length} hint="Premium access, payments disabled" />
        <Stat label="Teaching reputation" value={reputation.totals.teaching} hint={`${feedbackCount} learner feedback`} />
      </div>

      <Tabs
        current="overview"
        items={[
          { id: "overview", label: "Overview", href: "/studio" },
          { id: "products", label: "Products", href: "/studio/products" },
          { id: "sales", label: "Sales & access", href: "/studio/sales" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <div className="border-b border-navy-100 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-navy-950">Your content</h2>
              <p className="text-[12px] text-navy-500">Resources, journeys and stories you created.</p>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Price</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr key={resource.id}>
                    <Td>
                      <Link href={`/learn/${resource.id}`} className="font-medium text-navy-900 hover:underline">
                        {resource.title}
                      </Link>
                    </Td>
                    <Td>{label(resource.format)}</Td>
                    <Td>
                      <StatusBadge status={resource.status} />
                    </Td>
                    <Td>{resource.priceCents > 0 ? money(resource.priceCents, resource.currency) : "Free"}</Td>
                    <Td>{formatDate(resource.updatedAt)}</Td>
                  </tr>
                ))}
                {resources.length === 0 ? (
                  <tr>
                    <Td colSpan={5}>Nothing published yet. Use the form on the right to start.</Td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </Card>

          <Card>
            <div className="border-b border-navy-100 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-navy-950">Learning journeys</h2>
            </div>
            <ul className="divide-y divide-navy-100">
              {journeys.map((journey) => (
                <li key={journey.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <Link href={`/learn/journeys/${journey.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                      {journey.title}
                    </Link>
                    <p className="text-[11px] text-navy-500">{journey.visibility} · {formatDate(journey.createdAt)}</p>
                  </div>
                  <StatusBadge status={journey.status} />
                </li>
              ))}
              {journeys.length === 0 ? (
                <li className="px-5 py-5 text-[12.5px] text-navy-500">
                  Journeys are built from a task's approved documentation. Open a task workspace to start one.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-navy-100 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-navy-950">Content performance</h2>
              <p className="text-[12px] text-navy-500">Platform analytics only — not audited commercial results.</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <Stat label="Total views" value={resources.reduce((sum, resource) => sum + resource.viewCount, 0)} />
              <Stat label="Stories" value={stories.length} />
              <Stat label="Access grants" value={sales.grantedCount} hint="No payments processed" />
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-navy-950">
              <BookOpen size={15} aria-hidden="true" /> New learning resource
            </h2>
            <form action={createResourceAction} className="mt-3 space-y-3">
              <Field label="Title" htmlFor="title" required>
                <Input id="title" name="title" required maxLength={160} placeholder="What we learned building…" />
              </Field>
              <Field label="Summary" htmlFor="summary">
                <Textarea id="summary" name="summary" rows={2} maxLength={600} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Format" htmlFor="format">
                  <Select id="format" name="format" defaultValue="article">
                    {RESOURCE_FORMATS.map((format) => (
                      <option key={format} value={format}>{label(format)}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Level" htmlFor="level">
                  <Select id="level" name="level" defaultValue="intermediate">
                    {RESOURCE_LEVELS.map((level) => (
                      <option key={level} value={level}>{label(level)}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Price (£)" htmlFor="price" hint="0 = free">
                  <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue="0" />
                </Field>
                <Field label="Minutes" htmlFor="durationMinutes">
                  <Input id="durationMinutes" name="durationMinutes" type="number" min={1} defaultValue={15} />
                </Field>
              </div>
              <Field label="Topic" htmlFor="topic">
                <Input id="topic" name="topic" placeholder="accessibility" />
              </Field>
              <Field label="Preview (required for paid)" htmlFor="previewBody">
                <Textarea id="previewBody" name="previewBody" rows={2} maxLength={4000} />
              </Field>
              <Field label="Body" htmlFor="body">
                <Textarea id="body" name="body" rows={6} maxLength={20000} />
              </Field>
              <Field label="Transcript (for media)" htmlFor="transcript">
                <Textarea id="transcript" name="transcript" rows={2} />
              </Field>
              <Field label="Link to a project (optional)" htmlFor="projectId">
                <Select id="projectId" name="projectId" defaultValue="">
                  <option value="">No project</option>
                  {[...projects.owned, ...projects.contributed].map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="publish" name="publish" className="h-4 w-4 rounded border-navy-300 text-brand-600" />
                <label htmlFor="publish" className="text-[12px] text-navy-700">
                  Publish immediately
                </label>
              </div>
              <SubmitButton className="w-full" pendingLabel="Saving…">
                Create resource
              </SubmitButton>
              <p className="text-[10.5px] leading-4 text-navy-500">
                Publishing requires a verified email. Paid resources need a free preview — the server rejects them otherwise.
              </p>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
              <Layers size={12} aria-hidden="true" /> Modules and exercises
            </h2>
            <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
              Curriculum modules and free-preview lessons are supported on creation, and free previews are enforced on read.
            </p>
            <Alert tone="info" title="Course builder scope">
              This build creates curriculum via the resource form. A drag-and-drop lesson editor with version history is on
              the roadmap.
            </Alert>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
              <Sparkles size={12} aria-hidden="true" /> Stories
            </h2>
            <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
              Stories are generated from a project's approved documentation. {stories.length} created so far.
            </p>
            {projects.owned.slice(0, 3).map((project) => (
              <ButtonLink key={project.id} href={`/projects/${project.id}/story`} size="sm" variant="ghost" className="mt-1 w-full justify-start px-0">
                {project.name} →
              </ButtonLink>
            ))}
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
              <BarChart3 size={12} aria-hidden="true" /> What sells is not what is clicked
            </h2>
            <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
              Track completion and feedback, not just views. {feedbackCount} learner feedback records exist across your
              material.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
