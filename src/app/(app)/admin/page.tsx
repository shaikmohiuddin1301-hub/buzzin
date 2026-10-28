import Link from "next/link";
import { Alert, Badge, Card, PageHeader, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { auditTrail, platformMetrics, reportCountsByReason } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const metrics = platformMetrics();
  const reasons = reportCountsByReason();
  const audit = auditTrail(8);

  return (
    <div>
      <PageHeader title="Platform overview" description="Aggregate health metrics. No private user content is shown here." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Accounts" value={metrics.users} hint={`${metrics.activeUsers} active · ${metrics.suspendedUsers} suspended`} />
        <Stat label="Projects" value={metrics.projects} hint={`${metrics.publishedProjects} published`} />
        <Stat label="Completed tasks" value={metrics.completedTasks} hint={`${metrics.attributions} contribution records`} />
        <Stat label="Published learning" value={metrics.resources} hint="Published resources" />
        <Stat label="Storyboards" value={metrics.stories} hint="Generated storyboards" />
        <Stat label="Story renders" value={metrics.storySuccess} hint={`${metrics.storyFailures} failed`} />
        <Stat label="Open reports" value={metrics.openReports} hint="Awaiting moderation" />
        <Stat label="Open disputes" value={metrics.openDisputes} hint="Attribution disputes" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="border-b border-navy-200 px-5 py-3.5">
            <h2 className="text-[13px] font-semibold text-navy-900">Reports by reason</h2>
          </div>
          <ul className="divide-y divide-navy-200">
            {reasons.map((row) => (
              <li key={row.reason} className="flex items-center justify-between px-5 py-2.5 text-[12px]">
                <span className="capitalize text-navy-700">{row.reason.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-navy-500">{Number(row.total)}</span>
              </li>
            ))}
            {reasons.length === 0 ? <li className="px-5 py-4 text-[12px] text-navy-500">No reports recorded.</li> : null}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-navy-200 px-5 py-3.5">
            <h2 className="text-[13px] font-semibold text-navy-900">Recent administrative activity</h2>
            <Link href="/admin/audit" className="text-[11px] text-brand-600 underline">
              Full log
            </Link>
          </div>
          <ul className="divide-y divide-navy-200">
            {audit.map((entry) => (
              <li key={entry.log.id} className="px-5 py-2.5">
                <p className="text-[12px] text-navy-800">{entry.log.action.replace(/\./g, " · ").replace(/_/g, " ")}</p>
                <p className="text-[10.5px] text-navy-500">
                  {entry.actorName ?? "system"} · {relativeTime(entry.log.createdAt)}
                  {entry.log.reasonCode ? ` · reason: ${entry.log.reasonCode}` : ""}
                </p>
              </li>
            ))}
            {audit.length === 0 ? <li className="px-5 py-4 text-[12px] text-navy-500">No activity yet.</li> : null}
          </ul>
        </Card>
      </div>

      <div className="mt-5">
        <Alert tone="warning" title="Minimum necessary access">
          Moderators can see the reported item and its context. They cannot browse private project workspaces, private messages or
          files outside an active report. Every decision requires a reason code and is written to the audit log.
        </Alert>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/reports" className="btn-primary inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium">
          Moderation queue ({metrics.openReports})
        </Link>
        <Link href="/admin/disputes" className="btn-secondary inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium">
          Disputes ({metrics.openDisputes})
        </Link>
        <Link href="/admin/stories" className="btn-secondary inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium">
          Story approvals
        </Link>
        <Badge tone="neutral">Story render failures: {metrics.storyFailures}</Badge>
      </div>
    </div>
  );
}
