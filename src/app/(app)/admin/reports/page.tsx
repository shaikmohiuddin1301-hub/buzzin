import Link from "next/link";
import { moderateAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { MODERATION_ACTIONS, REPORT_REASONS, label } from "@/lib/types";
import { listReports, reportDetail } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moderation queue" };

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  await requireAdmin();

  const status = typeof query.status === "string" ? query.status : "open";
  const reports = listReports(status);

  return (
    <div>
      <PageHeader
        title="Moderation queue"
        description="Every decision needs a reason code and internal notes. The reporter is notified of the outcome; the reported person is notified only when action is taken against them."
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={status}
        items={[
          { id: "open", label: "Open", href: "/admin/reports?status=open" },
          { id: "triaging", label: "Triaging", href: "/admin/reports?status=triaging" },
          { id: "resolved", label: "Resolved", href: "/admin/reports?status=resolved" },
          { id: "dismissed", label: "Dismissed", href: "/admin/reports?status=dismissed" },
        ]}
      />

      <div className="space-y-4">
        {reports.map((row) => {
          const detail = reportDetail(row.report.id);
          const closed = row.report.status === "resolved" || row.report.status === "dismissed";
          return (
            <Card key={row.report.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{label(row.report.reasonCode)}</Badge>
                    <Badge tone="neutral">{row.report.targetType}</Badge>
                    <Badge tone={closed ? "success" : "warning"}>{row.report.status}</Badge>
                    <span className="text-[11px] text-navy-400">{relativeTime(row.report.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-navy-600">
                    Reported by{" "}
                    <Link href={`/u/${row.reporterUsername}`} className="underline">
                      {row.reporterName}
                    </Link>
                  </p>
                </div>
                <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] text-navy-500">
                  {row.report.targetType}/{row.report.targetId.slice(0, 8)}
                </code>
              </div>

              <p className="mt-2 whitespace-pre-line text-[12.5px] leading-6 text-navy-800">{row.report.details}</p>

              {detail?.excerpt ? (
                <blockquote className="mt-2 rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-3 py-2 text-[12px] leading-5 text-navy-700">
                  {detail.excerpt.slice(0, 600)}
                </blockquote>
              ) : (
                <p className="mt-2 text-[11px] italic text-navy-400">
                  No text excerpt is available for this target type. Open the target record to review it in context.
                </p>
              )}

              {detail && detail.history.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {detail.history.map((entry) => (
                    <li key={entry.action.id} className="text-[10.5px] text-navy-500">
                      {entry.action.action.replace(/_/g, " ")} by {entry.moderatorName} · {relativeTime(entry.action.createdAt)} ·{" "}
                      {entry.action.reasonCode}
                    </li>
                  ))}
                </ul>
              ) : null}

              {!closed ? (
                <form action={moderateAction} className="mt-3 grid gap-2 rounded-lg border border-navy-200 p-3 sm:grid-cols-2">
                  <input type="hidden" name="reportId" value={row.report.id} />
                  <Field label="Action" htmlFor={`action-${row.report.id}`}>
                    <Select id={`action-${row.report.id}`} name="action" defaultValue="dismiss">
                      {MODERATION_ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {label(action)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reason code" htmlFor={`reason-${row.report.id}`}>
                    <Select id={`reason-${row.report.id}`} name="reasonCode" defaultValue={row.report.reasonCode}>
                      {REPORT_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {label(reason)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Internal notes" htmlFor={`notes-${row.report.id}`} hint="Stored in the audit log. Required.">
                      <Textarea id={`notes-${row.report.id}`} name="notes" rows={2} required maxLength={2000} />
                    </Field>
                  </div>
                  <Field label="Appeal contact (optional)" htmlFor={`appeal-${row.report.id}`}>
                    <Input id={`appeal-${row.report.id}`} name="appealNote" placeholder="Not sent automatically" maxLength={200} />
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton variant="danger" pendingLabel="Recording…" confirmMessage="Apply this moderation decision? It is audited and notified.">
                      Record decision
                    </SubmitButton>
                  </div>
                </form>
              ) : (
                <p className="mt-2 text-[11px] text-navy-500">
                  Closed {row.report.resolvedAt ? relativeTime(row.report.resolvedAt) : ""}. {row.report.resolution ?? ""}
                </p>
              )}
            </Card>
          );
        })}
        {reports.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="Queue is clear" description="No reports with this status." />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
