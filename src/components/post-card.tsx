import Link from "next/link";
import { Bookmark, Heart, MessageCircle } from "lucide-react";
import { commentAction, reactAction, saveAction } from "@/app/actions/social";
import { ShareButton } from "@/components/client/share-button";
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

        </div>
      </div>

      {post.title ? (
        <div className="px-4 pt-1">
          {post.topic ? (
            <span className="mb-1 inline-block rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-600">
              {post.topic}
            </span>
          ) : null}
          <h3 className="text-[14px] font-semibold leading-5 text-navy-950">{post.title}</h3>
        </div>
      ) : null}

      {post.imageId ? (
        <Link href={`/posts/${post.id}`} className="mt-2 block bg-navy-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${post.imageId}`}
            alt={post.altText ?? ""}
            loading="lazy"
            className="max-h-[520px] w-full object-cover"
          />
        </Link>
      ) : null}

      <div className="px-4 pb-1 pt-3">
          <div className="whitespace-pre-line text-[13.5px] leading-6 text-navy-800">{post.body}</div>

          <Link href={`/posts/${post.id}`} className="mt-1 inline-block text-[11.5px] font-medium text-navy-500 hover:text-brand-700 hover:underline">
            View post
          </Link>

          {post.linkUrl ? (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[11.5px] font-medium text-brand-600 underline"
            >
              {post.linkUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : null}

          {post.projectId ? (
            <Link
              href={`/projects/${post.projectId}`}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-navy-50 px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:bg-navy-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              {post.projectName ?? "Open project"}
            </Link>
          ) : null}

          <div className="mt-3 flex items-center gap-0.5 border-t border-navy-200 pt-2">
            <form action={reactAction}>
              <input type="hidden" name="targetType" value="post" />
              <input type="hidden" name="targetId" value={post.id} />
              <input type="hidden" name="kind" value="like" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitIconButton label={post.liked ? "Remove like" : "Like this post"}>
                {/* Dark coral keeps the outline at 3:1 on white; the fill stays the brand coral. */}
                <Heart size={14} aria-hidden="true" className={post.liked ? "fill-coral-500 text-coral-600" : "text-coral-600"} />
                <span>{post.likeCount}</span>
              </SubmitIconButton>
            </form>

            <Link
              href={`/posts/${post.id}#comments`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-navy-500 hover:bg-navy-100 hover:text-navy-800"
            >
              <MessageCircle size={14} aria-hidden="true" className="text-brand-600" />
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
              <ShareButton path={`/posts/${post.id}`} title={`${post.author.displayName} on BuildTogether`} />
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
                className="h-9 flex-1 rounded-lg border border-navy-200 bg-navy-50/50 px-3 text-[12.5px] focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
              <SubmitIconButton label="Post comment" className={cn("border border-navy-200 bg-surface")}>
                Reply
              </SubmitIconButton>
            </form>
          ) : null}
      </div>
    </Card>
  );
}
