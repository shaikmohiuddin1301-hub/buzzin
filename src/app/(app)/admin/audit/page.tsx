import Link from "next/link";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { auditTrail } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  await requireAdmin();
  const entries = auditTrail(150);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Immutable record of sensitive operations. Entries carry the actor, target, reason code and timestamp."
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Reason</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.log.id}>
                <Td>
                  <span className="text-[11px] text-navy-700">{relativeTime(entry.log.createdAt)}</span>
                  <span className="block text-[10px] text-navy-400">{formatDate(entry.log.createdAt)}</span>
                </Td>
                <Td>
                  {entry.actorUsername ? (
                    <Link href={`/u/${entry.actorUsername}`} className="text-[11.5px] text-navy-800 underline">
                      {entry.actorName}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-navy-400">system</span>
                  )}
                </Td>
                <Td>
                  <code className="text-[10.5px] text-navy-700">{entry.log.action}</code>
                </Td>
                <Td>
                  <span className="text-[10.5px] text-navy-500">
                    {entry.log.targetType ? `${entry.log.targetType} ` : ""}
                    {entry.log.targetId ? entry.log.targetId.slice(0, 8) : ""}
                  </span>
                </Td>
                <Td>
                  <span className="text-[10.5px] text-navy-500">{entry.log.reasonCode ?? "—"}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No audit entries" description="Sensitive actions will be recorded here." />
          </div>
        ) : null}
      </Card>

      <p className="mt-3 text-[10.5px] text-navy-400">
        Showing the 150 most recent entries. Production deployments should ship this table to append-only storage.
      </p>
    </div>
  );
}
