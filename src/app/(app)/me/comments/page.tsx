import Link from "next/link";
import { CornerDownRight, MessageSquare } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { LIBRARY_PAGE_SIZE, commentsByUser, countCommentsByUser } from "@/services/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Comments" };

const TARGET_LABELS: Record<string, string> = {
  post: "Post",
  project: "Project",
  resource: "Teaching",
};

export default async function YourCommentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const user = await requireUser();
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);

  const total = countCommentsByUser(user.id);
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const comments = commentsByUser(user.id, { limit: LIBRARY_PAGE_SIZE, offset: (safePage - 1) * LIBRARY_PAGE_SIZE });

  return (
    <div>
      <PageHeader
        title="Your Comments"
        description="Comments and replies you wrote on other people's posts, projects and teaching, newest first. Content you can no longer see is not listed."
      />

      <Card>
        {comments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<MessageSquare size={22} aria-hidden="true" />}
              title="No comments yet"
              description="Comments and replies you write on other people's posts and projects are collected here."
              action={
                <ButtonLink href="/home" size="sm">
                  Back to home
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-navy-200">
            {comments.map((comment) => (
              <li key={comment.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{TARGET_LABELS[comment.targetType] ?? comment.targetType}</Badge>
                  {comment.isReply ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-navy-500">
                      <CornerDownRight size={11} aria-hidden="true" /> Reply
                    </span>
                  ) : null}
                  <Link
                    href={comment.targetHref}
                    className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-navy-900 hover:text-blue-700 hover:underline"
                  >
                    {comment.targetTitle}
                  </Link>
                </div>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-navy-700">{comment.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
                  <time className="text-navy-400" dateTime={comment.createdAt}>
                    {relativeTime(comment.createdAt)}
                  </time>
                  <Link href={comment.targetHref} className="font-medium text-blue-600 hover:underline">
                    Open the original
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > 0 ? <Pagination page={safePage} pageSize={LIBRARY_PAGE_SIZE} total={total} basePath="/me/comments" /> : null}
      </Card>
    </div>
  );
}
