import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react";
import { commentAction, reactAction, saveAction } from "@/app/actions/social";
import { SubmitIconButton } from "@/components/client/submit-button";
import { Avatar, Badge, Card, cn } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import type { FeedItem } from "@/services/social";
import { ReportForm } from "@/components/report-form";

const kindTone: Record<string, "brand" | "success" | "warning" | "info" | "neutral"> = {
  project_update: "brand",
  milestone: "success",
  lesson: "info",
  story: "brand",
  question: "warning",
  launch: "success",
  challenge: "info",
  general: "neutral",
};

export function PostCard({ post, returnTo, showCommentBox = true }: { post: FeedItem; returnTo: string; showCommentBox?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <Link href={`/u/${post.author.username}`} aria-label={`${post.author.displayName} profile`}>
          <Avatar
            name={post.author.displayName}
            size={38}
            src={post.author.avatarFileId ? `/api/files/${post.author.avatarFileId}` : null}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/u/${post.author.username}`} className="text-[13px] font-semibold text-navy-950 hover:underline">
              {post.author.displayName}
            </Link>
            <span className="text-[11px] text-navy-400">@{post.author.username}</span>
            <span className="text-[11px] text-navy-400">·</span>
            <time className="text-[11px] text-navy-400" dateTime={post.createdAt}>
              {relativeTime(post.createdAt)}
            </time>
            <Badge tone={kindTone[post.kind] ?? "neutral"}>{label(post.kind)}</Badge>
          </div>

          <div className="mt-2 whitespace-pre-line text-[13.5px] leading-6 text-navy-800">{post.body}</div>

          {post.projectId ? (
            <Link
              href={`/projects/${post.projectId}`}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-navy-50 px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:bg-navy-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              {post.projectName ?? "Open project"}
            </Link>
          ) : null}

          <div className="mt-3 flex items-center gap-0.5 border-t border-navy-100 pt-2">
            <form action={reactAction}>
              <input type="hidden" name="targetType" value="post" />
              <input type="hidden" name="targetId" value={post.id} />
              <input type="hidden" name="kind" value="like" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitIconButton label={post.liked ? "Remove like" : "Like this post"}>
                <Heart size={14} aria-hidden="true" className={post.liked ? "fill-brand-600 text-brand-600" : ""} />
                <span>{post.likeCount}</span>
              </SubmitIconButton>
            </form>

            <Link
              href={post.projectId ? `/projects/${post.projectId}?tab=discussion` : "#comments"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-navy-500 hover:bg-navy-100 hover:text-navy-800"
            >
              <MessageCircle size={14} aria-hidden="true" />
              {post.commentCount}
            </Link>

            <form action={saveAction}>
              <input type="hidden" name="targetType" value="post" />
              <input type="hidden" name="targetId" value={post.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitIconButton label={post.saved ? "Remove from saved" : "Save this post"}>
                <Bookmark size={14} aria-hidden="true" className={post.saved ? "fill-navy-700 text-navy-700" : ""} />
                <span>{post.saved ? "Saved" : "Save"}</span>
              </SubmitIconButton>
            </form>

            <span className="ml-auto flex items-center gap-1">
              <ReportForm targetType="post" targetId={post.id} returnTo={returnTo} compact />
              <span className="inline-flex h-8 items-center gap-1.5 px-2 text-[12px] text-navy-400" title="Use your browser's share menu">
                <Share2 size={13} aria-hidden="true" />
                <span className="sr-only">Share</span>
              </span>
            </span>
          </div>

          {showCommentBox ? (
            <form action={commentAction} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="targetType" value="post" />
              <input type="hidden" name="targetId" value={post.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label htmlFor={`comment-${post.id}`} className="sr-only">
                Write a comment
              </label>
              <input
                id={`comment-${post.id}`}
                name="body"
                required
                maxLength={3000}
                placeholder="Add a comment…"
                className="h-9 flex-1 rounded-lg border border-navy-200 bg-navy-50/50 px-3 text-[12.5px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
              <SubmitIconButton label="Post comment" className={cn("border border-navy-200 bg-white")}>
                Reply
              </SubmitIconButton>
            </form>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
