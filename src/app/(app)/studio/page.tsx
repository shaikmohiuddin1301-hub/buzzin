import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Flash,
  PageHeader,
  Progress,
  Stat,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import {
  courseAnalytics,
  journeysFor,
  myLearning,
  recentCourseEnrollments,
  resourcesForCreator,
} from "@/services/learning";
import { productsForCreator, salesSummary } from "@/services/commerce";
import { reputationSummary } from "@/lib/reputation";

export const metadata = { title: "Creator studio" };

const TABS = ["overview", "teachings", "courses", "learnings", "drafts", "analytics"] as const;
type Tab = (typeof TABS)[number];

function CourseTile({
  row,
}: {
  row: {
    resource: { id: string; title: string; summary: string | null; status: string; coverImageId: string | null; updatedAt: string };
    course: { visibility: string; category: string | null; estimatedMinutes: number | null };
    lessonCount: number;
    moduleCount: number;
    stats: { learners: number; completions: number; averagePct: number };
  };
}) {
  return (
    <article className="motion-card flex flex-col overflow-hidden rounded-2xl border border-navy-200/60 bg-surface shadow-card">
      <div className="relative aspect-[16/8] overflow-hidden ink-card">
        {row.resource.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${row.resource.coverImageId}`} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            {label(row.course.category ?? "course")}
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <StatusBadge status={row.resource.status} />
          <Badge tone={row.course.visibility === "public" ? "success" : row.course.visibility === "private" ? "warning" : "neutral"}>
            {row.course.visibility === "invite_only" ? "Link only" : label(row.course.visibility)}
          </Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[14px] font-semibold leading-snug text-navy-950">
          <Link href={`/studio/courses/${row.resource.id}`} className="hover:text-brand-700">
            {row.resource.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{row.resource.summary ?? "No description yet."}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-navy-200 pt-3 text-[10.5px]">
          <div>
            <dt className="text-navy-400">Lessons</dt>
            <dd className="font-semibold text-navy-800">{row.lessonCount}</dd>
          </div>
          <div>
            <dt className="text-navy-400">Learners</dt>
            <dd className="font-semibold text-navy-800">{row.stats.learners}</dd>
          </div>
          <div>
            <dt className="text-navy-400">Completed</dt>
            <dd className="font-semibold text-navy-800">{row.stats.completions}</dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <ButtonLink href={`/studio/courses/${row.resource.id}`} size="sm" variant="secondary">
            <Pencil size={12} aria-hidden="true" /> Manage
          </ButtonLink>
          <ButtonLink href={`/learn/${row.resource.id}`} size="sm" variant="ghost">
            Preview <ArrowRight size={12} aria-hidden="true" />
          </ButtonLink>
          <span className="ml-auto text-[10px] text-navy-400">{formatDate(row.resource.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ResourceRow({
  resource,
}: {
  resource: {
    id: string;
    title: string;
    summary: string | null;
    format: string;
    level: string;
    status: string;
    priceCents: number;
    updatedAt: string;
    courseVisibility?: string;
  };
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/learn/${resource.id}`} className="text-[13px] font-semibold text-navy-950 hover:underline">
            {resource.title}
          </Link>
          <StatusBadge status={resource.status} />
          <Badge tone="neutral">{label(resource.format)}</Badge>
          <Badge tone="neutral">{label(resource.level)}</Badge>
          {resource.priceCents > 0 ? <Badge tone="warning">Premium</Badge> : null}
          {resource.courseVisibility && resource.courseVisibility !== "public" ? (
            <Badge tone="warning">{resource.courseVisibility === "invite_only" ? "Link only" : label(resource.courseVisibility)}</Badge>
          ) : null}
        </div>
        {resource.summary ? <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-500">{resource.summary}</p> : null}
        <p className="mt-1 text-[10.5px] text-navy-400">Updated {formatDate(resource.updatedAt)}</p>
      </div>
      <ButtonLink href={`/learn/${resource.id}`} size="sm" variant="ghost">
        Open
      </ButtonLink>
    </li>
  );
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const requested = typeof query.tab === "string" ? query.tab : "overview";
  const tab: Tab = (TABS as readonly string[]).includes(requested) ? (requested as Tab) : "overview";
  const user = await requireUser();

  const resources = resourcesForCreator(user.id);
  const analytics = courseAnalytics(user.id);
  const courses = analytics.courses;
  const courseIds = new Set(courses.map((row) => row.resource.id));
  const teachings = resources.filter((resource) => !courseIds.has(resource.id));
  const journeys = journeysFor(user.id);
  const learning = myLearning(user.id);
  const recentEnrollments = recentCourseEnrollments(user.id, 6);
  const products = productsForCreator(user.id);
  const sales = salesSummary(user.id);
  const reputation = reputationSummary(user.id);

  const published = resources.filter((resource) => resource.status === "published");
  const draftResources = resources.filter(
    (resource) => !courseIds.has(resource.id) && ["draft", "unpublished", "scheduled"].includes(resource.status),
  );
  const draftJourneys = journeys.filter((journey) => journey.status !== "published");
  const courseDrafts = courses.filter((row) => row.resource.status !== "published");
  const recent = [
    ...resources.slice(0, 5).map((resource) => ({
      id: resource.id,
      title: resource.title,
      kind: courseIds.has(resource.id) ? "Course" : label(resource.format),
      status: resource.status,
      updatedAt: resource.updatedAt,
      href: courseIds.has(resource.id) ? `/studio/courses/${resource.id}` : `/learn/${resource.id}`,
    })),
    ...journeys.slice(0, 3).map((journey) => ({
      id: journey.id,
      title: journey.title,
      kind: "Learning journey",
      status: journey.status,
      updatedAt: journey.createdAt,
      href: `/learn/journeys/${journey.id}`,
    })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const tabs = [
    { id: "overview", label: "Overview", href: "/studio" },
    { id: "teachings", label: "My teachings", href: "/studio?tab=teachings", count: teachings.length },
    { id: "courses", label: "My courses", href: "/studio?tab=courses", count: courses.length },
    { id: "learnings", label: "My learnings", href: "/studio?tab=learnings", count: learning.inProgress.length },
    { id: "drafts", label: "Drafts", href: "/studio?tab=drafts", count: draftResources.length + draftJourneys.length + courseDrafts.length },
    { id: "analytics", label: "Analytics", href: "/studio?tab=analytics" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Creator studio"
        title="Teach what you know. Build the path."
        description="Your professional workspace for individual teachings and structured courses. Draft privately, preview exactly what learners see, then publish when it is ready."
        actions={
          <>
            <ButtonLink href="/create/teaching" variant="secondary" size="sm">
              New teaching
            </ButtonLink>
            <ButtonLink href="/studio/courses/new" size="sm">
              <Plus size={14} aria-hidden="true" /> Create course
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs current={tab} items={tabs} />

      {tab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Published" value={published.length + journeys.filter((journey) => journey.status === "published").length} hint={`${courses.filter((row) => row.resource.status === "published").length} published courses`} />
            <Stat label="Drafts" value={draftResources.length + draftJourneys.length + courseDrafts.length} hint="Private until you publish" />
            <Stat label="Courses" value={courses.length} hint={`${courses.reduce((sum, row) => sum + row.lessonCount, 0)} lessons in total`} />
            <Stat label="Learners" value={analytics.totals.learners} hint={`${analytics.totals.completions} completed courses`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Recent updates"
                  description="Your latest teachings, courses and journeys."
                  action={
                    <ButtonLink href="/studio?tab=drafts" size="sm" variant="ghost">
                      View drafts
                    </ButtonLink>
                  }
                />
                {recent.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<Sparkles size={22} aria-hidden="true" />}
                      title="Your workspace is empty"
                      description="Start with a single teaching or build a structured course. Nothing is public until you publish."
                      action={<ButtonLink href="/studio/courses/new" size="sm">Create your first course</ButtonLink>}
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-navy-200">
                    {recent.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <div className="min-w-0">
                          <Link href={item.href} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                            {item.title}
                          </Link>
                          <p className="text-[10.5px] text-navy-400">
                            {item.kind} · {relativeTime(item.updatedAt)}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Courses"
                  description="Structured learning with modules, lessons and persisted progress."
                  action={
                    <ButtonLink href="/studio?tab=courses" size="sm" variant="secondary">
                      All courses
                    </ButtonLink>
                  }
                />
                {courses.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<GraduationCap size={22} aria-hidden="true" />}
                      title="Build a course"
                      description="Combine your own lessons with credited YouTube videos, downloadable resources and practical project work."
                      action={<ButtonLink href="/studio/courses/new" size="sm">Create a course</ButtonLink>}
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    {courses.slice(0, 4).map((row) => (
                      <CourseTile key={row.resource.id} row={row} />
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <aside className="space-y-4">
              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
                  <Users size={14} aria-hidden="true" /> Recent learner activity
                </h2>
                {recentEnrollments.length === 0 ? (
                  <p className="mt-1.5 text-[11.5px] leading-5 text-navy-500">
                    Enrolments appear here when someone starts one of your published courses.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {recentEnrollments.map((row) => (
                      <li key={row.enrollment.id} className="rounded-lg bg-navy-50 px-3 py-2">
                        <p className="text-[11.5px] font-medium text-navy-900">{row.learnerName}</p>
                        <p className="truncate text-[10.5px] text-navy-500">
                          {row.resource.title} · {relativeTime(row.enrollment.enrolledAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
                  <BarChart3 size={14} aria-hidden="true" /> Teaching reputation
                </h2>
                <p className="mt-1 text-2xl font-semibold text-navy-950">{reputation.totals.teaching}</p>
                <p className="text-[11px] text-navy-500">Points from published teaching and learner feedback, each tied to a record.</p>
                <ButtonLink href="/studio?tab=analytics" size="sm" variant="ghost" className="mt-2 px-0">
                  See real analytics <ArrowRight size={12} aria-hidden="true" />
                </ButtonLink>
              </Card>

              <Card className="p-5">
                <h2 className="text-[13px] font-semibold text-navy-950">Studio tools</h2>
                <div className="mt-2 space-y-1">
                  <ButtonLink href="/studio/products" size="sm" variant="ghost" className="w-full justify-start px-0">
                    Products ({products.length})
                  </ButtonLink>
                  <ButtonLink href="/studio/sales" size="sm" variant="ghost" className="w-full justify-start px-0">
                    Sales &amp; access ({sales.grantedCount})
                  </ButtonLink>
                </div>
                <p className="mt-2 text-[10.5px] leading-4 text-navy-500">Payments are disabled in this build. No prices or charges are presented.</p>
              </Card>
            </aside>
          </div>
        </div>
      ) : null}

      {tab === "teachings" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-navy-950">Individual teachings</h2>
              <p className="mt-1 text-[13px] text-navy-600">Tutorials, guides, videos and resource packs — the building blocks of a course.</p>
            </div>
            <ButtonLink href="/create/teaching" size="sm">
              <Plus size={14} aria-hidden="true" /> New teaching
            </ButtonLink>
          </div>
          <Card>
            {teachings.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<BookOpen size={22} aria-hidden="true" />}
                  title="No individual teachings yet"
                  description="A teaching is one focused piece of knowledge. Courses combine several of them into a guided path."
                  action={<ButtonLink href="/create/teaching" size="sm">Create a teaching</ButtonLink>}
                />
              </div>
            ) : (
              <ul className="divide-y divide-navy-200">
                {teachings.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-semibold text-navy-950">Learning journeys</h3>
                <p className="text-[11.5px] text-navy-500">Narrative write-ups built from approved project documentation.</p>
              </div>
              <Badge tone="neutral">{journeys.length} journeys</Badge>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "courses" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-navy-950">My courses</h2>
              <p className="mt-1 text-[13px] text-navy-600">Modules, lessons, resources and real learner progress.</p>
            </div>
            <ButtonLink href="/studio/courses/new" size="sm">
              <Plus size={14} aria-hidden="true" /> Create course
            </ButtonLink>
          </div>
          {courses.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={22} aria-hidden="true" />}
              title="No courses yet"
              description="Create a course draft, add modules and lessons, then preview and publish when it is ready."
              action={<ButtonLink href="/studio/courses/new" size="sm">Create your first course</ButtonLink>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((row) => (
                <CourseTile key={row.resource.id} row={row} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "learnings" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-navy-950">My learnings</h2>
              <p className="mt-1 text-[13px] text-navy-600">What you are learning, separate from what you teach. Progress is recorded only when you mark a lesson complete.</p>
            </div>
            <ButtonLink href="/learn" size="sm" variant="secondary">
              Explore Learning <ArrowRight size={13} aria-hidden="true" />
            </ButtonLink>
          </div>
          {learning.inProgress.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={22} aria-hidden="true" />}
              title="Nothing started yet"
              description="Enrol in a course or open a teaching. Your progress stays private unless you choose to share completed learning on your profile."
              action={<ButtonLink href="/learn" size="sm">Browse Learning</ButtonLink>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {learning.inProgress.map((item) => (
                <Card key={item.resource.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-navy-950">
                      <Link href={`/learn/${item.resource.id}`} className="hover:underline">
                        {item.resource.title}
                      </Link>
                    </h3>
                    {item.pct >= 100 ? <Badge tone="success">Completed</Badge> : <Badge tone="brand">{item.pct}%</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-navy-500">
                    {item.resource.summary ?? `${label(item.resource.format)} · ${label(item.resource.level)}`}
                  </p>
                  <div className="mt-auto pt-3">
                    <Progress tone="teal" value={item.pct} label={`${item.pct}% · updated ${relativeTime(item.updatedAt)}`} />
                  </div>
                </Card>
              ))}
            </div>
          )}
          {learning.completed.length > 0 ? (
            <p className="text-[11px] text-navy-500">{learning.completed.length} completed. Course completion is a learning record; it is not an accepted contribution or a claim of professional competence.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "drafts" ? (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-navy-950">Drafts</h2>
            <p className="mt-1 text-[13px] text-navy-600">Unpublished work is private. Courses can be saved with only a title and built up later.</p>
          </div>
          <Card>
            <CardHeader title="Course drafts" description={`${courseDrafts.length} unpublished or archived`} action={<ButtonLink href="/studio/courses/new" size="sm" variant="secondary">New course</ButtonLink>} />
            {courseDrafts.length === 0 ? (
              <p className="px-5 py-5 text-[12px] text-navy-500">No course drafts. Published courses are in My courses.</p>
            ) : (
              <ul className="divide-y divide-navy-200">
                {courseDrafts.map((row) => (
                  <li key={row.resource.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/studio/courses/${row.resource.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                        {row.resource.title}
                      </Link>
                      <p className="text-[10.5px] text-navy-400">
                        {row.lessonCount} lessons · {row.moduleCount} modules · updated {relativeTime(row.resource.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={row.resource.status} />
                      <ButtonLink href={`/studio/courses/${row.resource.id}`} size="sm" variant="secondary">
                        Continue
                      </ButtonLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Teaching and resource drafts" description={`${draftResources.length} items`} action={<ButtonLink href="/create/teaching" size="sm" variant="secondary">New teaching</ButtonLink>} />
            {draftResources.length === 0 ? (
              <p className="px-5 py-5 text-[12px] text-navy-500">No unpublished teachings.</p>
            ) : (
              <ul className="divide-y divide-navy-200">
                {draftResources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Learning journey drafts" description={`${draftJourneys.length} journeys`} />
            {draftJourneys.length === 0 ? (
              <p className="px-5 py-5 text-[12px] text-navy-500">No journey drafts. Journeys start from an approved task record.</p>
            ) : (
              <ul className="divide-y divide-navy-200">
                {draftJourneys.map((journey) => (
                  <li key={journey.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link href={`/learn/journeys/${journey.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                      {journey.title}
                    </Link>
                    <StatusBadge status={journey.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-navy-950">Analytics</h2>
            <p className="mt-1 text-[13px] text-navy-600">
              Only metrics backed by persisted records: enrolments, lesson completions and progress. No impressions, revenue or estimates.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Enrolments" value={analytics.totals.enrollments} hint="One per learner per course" />
            <Stat label="Learners" value={analytics.totals.learners} hint="Across all your courses" />
            <Stat label="Completed" value={analytics.totals.completions} hint="All lessons marked complete" />
            <Stat label="Average progress" value={`${analytics.averagePct}%`} hint="Across your course averages" />
          </div>
          <Card>
            <CardHeader title="Course performance" description="Completion is based on saved lesson records, not page views." />
            {courses.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<BarChart3 size={22} aria-hidden="true" />}
                  title="No course analytics yet"
                  description="Publish a course and invite learners. Enrolments and progress will appear here, and nowhere before they actually happen."
                  action={<ButtonLink href="/studio/courses/new" size="sm">Create a course</ButtonLink>}
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Course</Th>
                    <Th>Status</Th>
                    <Th>Lessons</Th>
                    <Th>Learners</Th>
                    <Th>Completed</Th>
                    <Th>Avg. progress</Th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((row) => (
                    <tr key={row.resource.id}>
                      <Td>
                        <Link href={`/studio/courses/${row.resource.id}`} className="font-medium text-navy-900 hover:underline">
                          {row.resource.title}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge status={row.resource.status} />
                      </Td>
                      <Td>{row.lessonCount}</Td>
                      <Td>{row.stats.learners}</Td>
                      <Td>{row.stats.completions}</Td>
                      <Td>
                        <div className={cn("min-w-[110px]", row.stats.learners === 0 && "text-navy-400")}>
                          {row.stats.learners === 0 ? "No learners yet" : <Progress tone="teal" value={row.stats.averagePct} label={`${row.stats.averagePct}%`} />}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
              <Layers size={14} aria-hidden="true" /> What this does not measure
            </h3>
            <p className="mt-1 text-[11.5px] leading-5 text-navy-600">
              Course completion records learning activity only. It does not create an accepted contribution, certify professional
              competence or grant permission to publish a learner's work. Project work and accepted contributions are counted
              separately, after the project owner reviews the actual submission.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
