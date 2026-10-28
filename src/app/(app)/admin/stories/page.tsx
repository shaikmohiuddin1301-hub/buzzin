import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { storyReviewQueue } from "@/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Story review" };

export default async function AdminStoriesPage() {
  await requireAdmin();
  const queue = storyReviewQueue();

  return (
    <div>
      <PageHeader
        title="AI-generated content review"
        description="Storyboards waiting for approval. Approval is a project-owner decision; this view is for oversight and safety escalation."
      />

      <Alert tone="warning" title="Generated stories must never invent facts">
        Each scene carries a fact status and a link to its source record. Escalate any board that presents unsupported claims,
        uses a likeness without consent, or discloses confidential material.
      </Alert>

      <div className="mt-4 space-y-4">
        {queue.map((row) => (
          <Card key={row.board.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold text-navy-900">{row.board.title}</h2>
                <p className="text-[11px] text-navy-500">
                  {row.projectName ? (
                    <>
                      Project:{" "}
                      <Link href={`/projects/${row.board.projectId}`} className="underline">
                        {row.projectName}
                      </Link>{" "}
                      ·{" "}
                    </>
                  ) : null}
                  submitted by {row.authorName} · {relativeTime(row.board.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="warning">in review</Badge>
                <Badge tone="neutral">v{row.board.version}</Badge>
              </div>
            </div>
            <p className="mt-1.5 text-[12px] leading-6 text-navy-700">{row.board.summary}</p>
            <p className="mt-1 text-[10.5px] text-navy-400">
              Provider: {row.board.provider} · generated {formatDate(row.board.createdAt)} · visibility {row.board.visibility}
            </p>
            {row.board.projectId ? (
              <Link href={`/projects/${row.board.projectId}/story`} className="mt-2 inline-block text-[11.5px] text-brand-600 underline">
                Open the storyboard editor
              </Link>
            ) : null}
          </Card>
        ))}
        {queue.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="Nothing waiting" description="Storyboards appear here while they are in review." />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
