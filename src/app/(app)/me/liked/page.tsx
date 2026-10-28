import Link from "next/link";
import { Heart } from "lucide-react";
import { Avatar, Badge, ButtonLink, Card, EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import {
  LIBRARY_PAGE_SIZE,
  countLikedPosts,
  countLikedProjects,
  likedPostsForUser,
  likedProjectsForUser,
} from "@/services/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liked Posts & Projects" };

export default async function LikedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const user = await requireUser();
  const tab = query.tab === "projects" ? "projects" : "posts";
  const page = Math.max(1, Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1);
  const offset = (page - 1) * LIBRARY_PAGE_SIZE;

  const postCount = countLikedPosts(user.id);
  const projectCount = countLikedProjects(user.id);
  const total = tab === "projects" ? projectCount : postCount;
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const safePage = Math.min(page, pages);

  const posts = tab === "posts" ? likedPostsForUser(user.id, { limit: LIBRARY_PAGE_SIZE, offset: (safePage - 1) * LIBRARY_PAGE_SIZE }) : [];
  const projects =
    tab === "projects" ? likedProjectsForUser(user.id, { limit: LIBRARY_PAGE_SIZE, offset: (safePage - 1) * LIBRARY_PAGE_SIZE }) : [];

  return (
    <div>
      <PageHeader
        title="Liked Posts & Projects"
        description="Everything you have liked, newest first. Items that were deleted, hidden or made private drop out of this list."
      />

      <Tabs
        current={tab}
        items={[
          { id: "posts", label: "Posts", href: "/me/liked", count: postCount },
          { id: "projects", label: "Projects", href: "/me/liked?tab=projects", count: projectCount },
        ]}
      />

      {tab === "posts" ? (
        <Card>
          {posts.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Heart size={22} aria-hidden="true" />}
                title="No liked posts yet"
                description="Tap the heart on a post in your feed and it will be collected here."
                action={
                  <ButtonLink href="/home" size="sm">
                    Back to home
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-navy-200">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link href={`/posts/${post.id}`} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-navy-50">
                    {post.imageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${post.imageId}`}
                        alt={post.altText ?? ""}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy-50 to-brand-50 text-navy-500">
                        <Heart size={16} aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 text-[13px] leading-6 text-navy-800">{post.body}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-navy-500">
                        <span>{post.authorName}</span>
                        <span aria-hidden="true">·</span>
                        <span>@{post.authorUsername}</span>
                        <span aria-hidden="true">·</span>
                        <span>liked {relativeTime(post.likedAt)}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {total > 0 ? (
            <Pagination page={safePage} pageSize={LIBRARY_PAGE_SIZE} total={total} basePath="/me/liked" />
          ) : null}
        </Card>
      ) : (
        <Card>
          {projects.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Heart size={22} aria-hidden="true" />}
                title="No liked projects yet"
                description="Like a project and it will be collected here, with its current status."
                action={
                  <ButtonLink href="/explore?tab=projects" size="sm">
                    Explore projects
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="grid gap-3 p-4 sm:grid-cols-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`} className="block h-full">
                    <Card className="motion-card h-full overflow-hidden">
                      <div className="h-28 w-full bg-gradient-to-br from-navy-100 to-brand-50">
                        {project.coverImageId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${project.coverImageId}`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="p-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{label(project.category)}</Badge>
                          <Badge tone="neutral">{label(project.stage)}</Badge>
                        </div>
                        <h2 className="mt-2 text-[14px] font-semibold text-navy-950">{project.name}</h2>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{project.shortDescription}</p>
                        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-navy-500">
                          <Avatar name={project.ownerName} size={18} />
                          {project.ownerName} · liked {relativeTime(project.likedAt)}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {total > 0 ? (
            <Pagination page={safePage} pageSize={LIBRARY_PAGE_SIZE} total={total} basePath="/me/liked" params={{ tab: "projects" }} />
          ) : null}
        </Card>
      )}
    </div>
  );
}
