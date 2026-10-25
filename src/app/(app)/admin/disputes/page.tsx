import Link from "next/link";
import { resolveDisputeAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Badge, Card, EmptyState, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { listDisputes } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disputes" };

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  await requireAdmin();
  const disputes = listDisputes();

  return (
    <div>
      <PageHeader
        title="Attribution disputes"
        description="Contribution records that someone believes are inaccurate. Resolving a dispute marks the underlying record as corrected."
      />

      <Flash error={error} notice={notice} />

      <Alert tone="info" title="Nobody reviews their own case">
        A moderator who is the subject of a dispute, or who confirmed the disputed record, must not decide it. The audit log records
        who closed each case, so this can be checked after the fact.
      </Alert>

      <div className="mt-4 space-y-4">
        {disputes.map((row) => {
          const closed = row.dispute.status === "resolved" || row.dispute.status === "rejected";
          return (
            <Card key={row.dispute.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={closed ? "success" : "warning"}>{row.dispute.status.replace(/_/g, " ")}</Badge>
                <h2 className="text-[13px] font-semibold text-navy-900">{row.dispute.subject}</h2>
                <span className="text-[11px] text-navy-400">{relativeTime(row.dispute.createdAt)}</span>
              </div>
              <p className="mt-1 text-[11px] text-navy-500">
                Raised by{" "}
                <Link href={`/u/${row.username}`} className="underline">
                  {row.raisedByName}
                </Link>
                {row.dispute.projectId ? (
                  <>
                    {" · "}
                    <Link href={`/projects/${row.dispute.projectId}`} className="underline">
                      project
                    </Link>
                  </>
                ) : null}
                {row.dispute.attributionId ? (
                  <>
                    {" · "}
                    <span className="font-mono text-[10px]">attribution {row.dispute.attributionId.slice(0, 8)}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-2 whitespace-pre-line text-[12.5px] leading-6 text-navy-800">{row.dispute.details}</p>

              {!closed ? (
                <form action={resolveDisputeAction} className="mt-3 grid gap-2 rounded-lg border border-navy-200 p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <input type="hidden" name="disputeId" value={row.dispute.id} />
                  <Field label="Decision" htmlFor={`decision-${row.dispute.id}`}>
                    <Input id={`decision-${row.dispute.id}`} name="decision" defaultValue="resolved" list={`decision-options-${row.dispute.id}`} />
                    <datalist id={`decision-options-${row.dispute.id}`}>
                      <option value="resolved" />
                      <option value="rejected" />
                    </datalist>
                  </Field>
                  <Field label="Resolution" htmlFor={`resolution-${row.dispute.id}`} hint="Sent to the person who raised the dispute.">
                    <Textarea id={`resolution-${row.dispute.id}`} name="resolution" rows={2} required maxLength={2000} />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton pendingLabel="Closing…">Close dispute</SubmitButton>
                  </div>
                </form>
              ) : (
                <p className="mt-2 text-[11.5px] text-navy-600">Resolution: {row.dispute.resolution}</p>
              )}
            </Card>
          );
        })}
        {disputes.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No disputes" description="Attribution disputes raised by contributors or project owners appear here." />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
