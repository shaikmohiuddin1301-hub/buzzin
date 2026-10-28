import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, Heart } from "lucide-react";
import { deletePostAction, reactAction, saveAction } from "@/app/actions/social";
import { CommentThread } from "@/components/comments";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, ButtonLink, Card, Flash } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import { postDetail } from "@/services/social";
import { listComments } from "@/services/social";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { postId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const viewer = await getCurrentUser();
  const detail = postDetail(postId, viewer);
  if (!detail) notFound();

  const { post, author, projectName, isAuthor, likeCount, liked, saved } = detail;
  const comments = listComments("post", postId, viewer);
  const returnTo = `/posts/${postId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/u/${author.username}`} className="hover:underline">
          {author.displayName}
        </Link>{" "}
        / <span className="text-navy-700">Post</span>
      </nav>

      <Flash error={error} notice={notice} />

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <Link href={`/u/${author.username}`} aria-label={`${author.displayName} profile`}>
            <Avatar name={author.displayName} size={40} src={author.avatarFileId ? `/api/files/${author.avatarFileId}` : null} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/u/${author.username}`} className="text-[13.5px] font-semibold text-navy-950 hover:underline">
                {author.displayName}
              </Link>
              <span className="text-[11px] text-navy-400">@{author.username}</span>
              <Badge tone="neutral">{label(post.kind)}</Badge>
              {post.status === "draft" ? <Badge tone="warning">Draft — only you can see this</Badge> : null}
              {post.visibility !== "public" ? <Badge tone="neutral">{label(post.visibility)}</Badge> : null}
            </div>
            <time className="text-[11px] text-navy-400" dateTime={post.createdAt}>
              {relativeTime(post.createdAt)}
            </time>
          </div>
        </div>

        {post.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${post.imageId}`}
            alt={post.altText ?? ""}
            className="max-h-[70vh] w-full bg-navy-50 object-contain"
          />
        ) : null}

        <div className="p-4">
          {post.topic ? (
            <span className="mb-1 inline-block rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-600">
              {post.topic}
            </span>
          ) : null}
          {post.title ? <h1 className="text-[18px] font-semibold leading-7 text-navy-950">{post.title}</h1> : null}
          <div className="mt-1 whitespace-pre-line text-[14px] leading-7 text-navy-800">{post.body}</div>

          {post.linkUrl ? (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-[12px] font-medium text-brand-600 underline"
            >
              {post.linkUrl.replace(/^https?:\/\//, "")}
            </a>
          ) : null}

          {post.projectId ? (
            <Link
              href={`/projects/${post.projectId}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-navy-50 px-2.5 py-1 text-[11.5px] font-medium text-navy-700 hover:bg-navy-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              {projectName ?? "Open project"}
            </Link>
          ) : null}
          {post.resourceId ? (
            <Link href={`/learn/${post.resourceId}`} className="mt-3 inline-flex text-[11.5px] font-medium text-brand-600 underline">
              Open the related learning
            </Link>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-navy-200 pt-3">
            {viewer ? (
              <>
                <form action={reactAction}>
                  <input type="hidden" name="targetType" value="post" />
                  <input type="hidden" name="targetId" value={post.id} />
                  <input type="hidden" name="kind" value="like" />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                    <Heart size={13} aria-hidden="true" className={liked ? "fill-brand-600 text-brand-600" : ""} /> {likeCount}
                  </SubmitButton>
                </form>
                <form action={saveAction}>
                  <input type="hidden" name="targetType" value="post" />
                  <input type="hidden" name="targetId" value={post.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                    <Bookmark size={13} aria-hidden="true" className={saved ? "fill-navy-800" : ""} /> {saved ? "Saved" : "Save"}
                  </SubmitButton>
                </form>
              </>
            ) : (
              <ButtonLink href="/auth/sign-in" size="sm" variant="secondary">
                Sign in to like or comment
              </ButtonLink>
            )}

            {isAuthor ? (
              <form action={deletePostAction} className="ml-auto">
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="returnTo" value={`/u/${author.username}?tab=posts`} />
                <SubmitButton
                  size="sm"
                  variant="ghost"
                  confirmMessage="Delete this post? Comments and reactions go with it. This cannot be undone."
                >
                  Delete
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-[14px] font-semibold text-navy-950">Comments</h2>
        <div className="mt-3">
          <CommentThread
            comments={comments}
            targetType="post"
            targetId={post.id}
            returnTo={returnTo}
            canComment={!!viewer}
          />
        </div>
      </Card>
    </div>
  );
}
