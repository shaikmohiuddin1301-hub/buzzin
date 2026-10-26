import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FolderCheck, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/authz";
import { projectAcceptedWork } from "@/services/accepted";
import { projectDetail } from "@/services/projects";
import { formatDate } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AcceptedWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const detail = projectDetail(projectId, user);
  if (!detail) notFound();
  const access = getProjectAccess(projectId, user);
  if (!access?.canView) notFound();

  const { items, areas, canViewFiles } = projectAcceptedWork(projectId, user);
  const requested = typeof query.area === "string" ? query.area : null;
  const activeArea = requested && areas.some((area) => area.key === requested) ? requested : null;
  const visible = activeArea ? items.filter((item) => item.areaKey === activeArea) : items;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${projectId}`} className="hover:underline">
          {detail.project.name}
        </Link>{" "}
        / <span className="text-navy-700">Accepted work</span>
      </nav>

      <PageHeader
        eyebrow="What we&rsquo;ve built"
        title="Accepted work"
        description="Every deliverable a reviewer approved, filed under the work area it belongs to. These are the original task records, not copies."
        meta={
          <>
            <span>{items.length} accepted {items.length === 1 ? "deliverable" : "deliverables"}</span>
            <span>{areas.length} work {areas.length === 1 ? "area" : "areas"}</span>
            <span className="inline-flex items-center gap-1 text-navy-500">
              <ShieldCheck size={13} aria-hidden="true" /> Owner-confirmed, not independently verified
            </span>
          </>
        }
        actions={<ButtonLink href={`/projects/${projectId}`} variant="secondary" size="sm">Back to project</ButtonLink>}
      />

      {areas.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2" role="navigation" aria-label="Filter by work area">
          <Link
            href={`/projects/${projectId}/accepted`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              activeArea === null
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-navy-200 bg-surface text-navy-600 hover:border-navy-300",
            )}
            aria-current={activeArea === null ? "page" : undefined}
          >
            All work · {items.length}
          </Link>
          {areas.map((area) => (
            <Link
              key={area.key}
              href={`/projects/${projectId}/accepted?area=${area.key}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                activeArea === area.key
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-navy-200 bg-surface text-navy-600 hover:border-navy-300",
              )}
              aria-current={activeArea === area.key ? "page" : undefined}
            >
              {area.label} · {area.count}
            </Link>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<FolderCheck size={22} aria-hidden="true" />}
          title={items.length === 0 ? "Nothing accepted yet" : "No accepted work in this area"}
          description={
            items.length === 0
              ? "When a reviewer approves a submission, the deliverable is filed here automatically. Nothing needs to be moved by hand."
              : "Try another work area, or view everything the team has delivered."
          }
          action={
            items.length === 0 ? (
              <ButtonLink href={`/projects/${projectId}/tasks`} size="sm">See open tasks</ButtonLink>
            ) : (
              <ButtonLink href={`/projects/${projectId}/accepted`} variant="secondary" size="sm">Show all accepted work</ButtonLink>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((item) => (
            <li key={item.id}>
              <Card className="motion-card h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{item.areaLabel}</p>
                    <h2 className="mt-1 text-[14px] font-semibold text-navy-950">{item.title}</h2>
                    <Link href={`/tasks/${item.taskId}`} className="mt-0.5 block text-[12px] text-navy-500 hover:text-brand-700 hover:underline">
                      {item.taskTitle}
                    </Link>
                  </div>
                  <Badge tone="success" className="shrink-0">
                    <CheckCircle2 size={11} aria-hidden="true" /> Accepted
                  </Badge>
                </div>

                {item.description ? (
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-6 text-navy-600">{item.description}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-navy-500">
                  {item.contributor ? (
                    <Link href={`/u/${item.contributor.username}`} className="font-medium text-navy-700 hover:underline">
                      {item.contributor.name}
                    </Link>
                  ) : (
                    <span>Contributor not recorded</span>
                  )}
                  {item.reviewerName ? <span>accepted by {item.reviewerName}</span> : null}
                  {item.reviewedAt ? <time dateTime={item.reviewedAt}>{formatDate(item.reviewedAt)}</time> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-3 text-[12px]">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">
                      Open deliverable
                    </a>
                  ) : null}
                  {item.fileId && canViewFiles ? (
                    <Link href={`/api/files/${item.fileId}`} className="text-brand-700 underline">
                      Download file
                    </Link>
                  ) : null}
                  <Link href={`/tasks/${item.taskId}`} className="text-navy-500 hover:text-brand-700 hover:underline">
                    View the task
                  </Link>
                  {item.attributionStatus === "confirmed" ? (
                    <span className="ml-auto text-[10.5px] text-navy-400">Contribution recorded</span>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
