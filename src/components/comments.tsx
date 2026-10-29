import Link from "next/link";
import { commentAction } from "@/app/actions/social";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, Textarea } from "@/components/ui";
import { relativeTime } from "@/lib/format";

type CommentRow = {
  comment: { id: string; body: string; createdAt: string; parentId: string | null };
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
};

export function CommentThread({
  comments,
  targetType,
  targetId,
  returnTo,
  canComment,
  emptyLabel = "No comments yet. Start the conversation.",
}: {
  comments: { comment: CommentRow["comment"]; authorName: string; authorUsername: string; authorAvatar: string | null; replies: CommentRow[] }[];
  targetType: "post" | "project" | "resource" | "task" | "story";
  targetId: string;
  returnTo: string;
  canComment: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-5">
      {canComment ? (
        <form action={commentAction} className="space-y-2">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label htmlFor={`comment-body-${targetId}`} className="text-[13px] font-medium text-navy-800">
            Add to the discussion
          </label>
          <Textarea
            id={`comment-body-${targetId}`}
            name="body"
            required
            maxLength={3000}
            rows={3}
            placeholder="Ask a question, offer feedback, or share something useful."
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-navy-500">
              Public discussion. Use project chat for private team conversations.
            </p>
            <SubmitButton size="sm" pendingLabel="Posting…">
              Post comment
            </SubmitButton>
          </div>
        </form>
      ) : (
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-[12px] text-navy-600">
          <Link href="/auth/sign-in" className="font-medium text-blue-600 underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-[13px] text-navy-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((entry) => (
            <li key={entry.comment.id} className="rounded-lg border border-navy-200 bg-surface p-3">
              <div className="flex items-start gap-2.5">
                <Avatar name={entry.authorName} size={28} src={entry.authorAvatar ? `/api/files/${entry.authorAvatar}` : null} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link href={`/u/${entry.authorUsername}`} className="text-[12.5px] font-semibold text-navy-900 hover:underline">
                      {entry.authorName}
                    </Link>
                    <time className="text-[11px] text-navy-400" dateTime={entry.comment.createdAt}>
                      {relativeTime(entry.comment.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-navy-700">{entry.comment.body}</p>

                  {entry.replies.length > 0 ? (
                    <ul className="mt-3 space-y-3 border-l-2 border-navy-200 pl-3">
                      {entry.replies.map((reply) => (
                        <li key={reply.comment.id}>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <Link href={`/u/${reply.authorUsername}`} className="text-[12px] font-semibold text-navy-900 hover:underline">
                              {reply.authorName}
                            </Link>
                            <time className="text-[10px] text-navy-400" dateTime={reply.comment.createdAt}>
                              {relativeTime(reply.comment.createdAt)}
                            </time>
                            <Badge tone="neutral">reply</Badge>
                          </div>
                          <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{reply.comment.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {canComment ? (
                    <form action={commentAction} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="targetType" value={targetType} />
                      <input type="hidden" name="targetId" value={targetId} />
                      <input type="hidden" name="parentId" value={entry.comment.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <label htmlFor={`reply-${entry.comment.id}`} className="sr-only">
                        Reply to {entry.authorName}
                      </label>
                      <input
                        id={`reply-${entry.comment.id}`}
                        name="body"
                        required
                        placeholder="Reply…"
                        className="h-8 flex-1 rounded-md border border-navy-200 px-2.5 text-[12px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                        Reply
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
