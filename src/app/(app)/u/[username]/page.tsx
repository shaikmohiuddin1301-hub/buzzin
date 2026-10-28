import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, GraduationCap, MapPin, MessageSquare, Plus, Star } from "lucide-react";
import { blockUserAction, followUserAction } from "@/app/actions/social";
import { startDirectMessageAction } from "@/app/actions/chat";
import { ProjectCard, ResourceCard } from "@/components/cards";
import { ProfileMenu } from "@/components/client/profile-menu";
import { Reveal } from "@/components/client/reveal";
import { ReportForm } from "@/components/report-form";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Flash,
  SkillTag,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { accountKindLabel } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";
import { canViewProfile, isBlockedEitherWay } from "@/lib/authz";
import { formatDate, relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import { achievementsFor, reputationSummary } from "@/lib/reputation";
import { contributionCounts, projectHistory, verifiedContributions } from "@/services/profile";
import { acceptedWorkForUser, learningHistoryFor, sharesLearningHistory } from "@/services/profileContent";
import { followerCounts, getPreferences, getUserByUsername, getUserRolesList, isFollowing, userSkillsFor } from "@/services/users";
import { journeysFor, resourcesForCreator } from "@/services/learning";
import { listAttributions } from "@/services/tasks";
import { postsByAuthor } from "@/services/social";
import { accountContext } from "@/services/account";

export const dynamic = "force-dynamic";

// About is no longer a tab; the information it held is shown in the profile footer
// section below the tabs, and nothing was deleted from the database.
const TABS = ["posts", "projects", "teachings", "learnings", "accepted"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const person = getUserByUsername(username);
  return { title: person ? `${person.displayName} (@${person.username})` : "Profile not found" };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { username } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);

  const person = getUserByUsername(username);
  if (!person) notFound();
  // Presentation only: roles, memberships and published teaching owned by this account.
  const account = accountContext(person);

  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === person.id;
  // A private organisation is never disclosed on someone else's profile.
  const profileBusinesses = isSelf ? account.businesses : account.businesses.filter((business) => business.visibility === "public");
  const profileKind = profileBusinesses.length > 0 ? "business" : account.isCreator ? "creator" : "individual";
  const blocked = viewer ? isBlockedEitherWay(viewer.id, person.id) : false;

  const requestedTab = typeof query.tab === "string" ? query.tab : "posts";
  const tab: Tab = (TABS as readonly string[]).includes(requestedTab) ? (requestedTab as Tab) : "posts";
  const projectFilter = query.filter === "contributing" || query.filter === "completed" ? query.filter : "created";

  const skills = userSkillsFor(person.id);
  const userRoles = getUserRolesList(person.id);
  const followers = followerCounts(person.id);
  const reputation = reputationSummary(person.id);
  const achievements = achievementsFor(person.id);
  // A visitor sees published, non-private projects only; the owner sees everything,
  // including drafts, on their own profile.
  const publicOnly = !isSelf;
  const history = projectHistory(person.id, { publicOnly });
  const contributions = contributionCounts(person.id);
  const verified = verifiedContributions(person.id, { publicOnly });
  const attributions = listAttributions(person.id, { publicOnly });
  const prefs = getPreferences(person.id);
  const view = canViewProfile(person.id, viewer, prefs ?? null);
  const sharesLearning = sharesLearningHistory(person.id);

  const posts = postsByAuthor(person.id, viewer?.id ?? null, 60);
  const publishedPosts = posts.filter((post) => post.status === "published");
  const resources = resourcesForCreator(person.id).filter(
    (resource) =>
      (resource.status === "published" && resource.courseVisibility === "public" && view.learning) || isSelf,
  );
  const journeys = journeysFor(person.id).filter((journey) => (journey.status === "published" && view.learning) || isSelf);
  const learnings = isSelf || sharesLearning ? learningHistoryFor(person.id) : [];
  const accepted = view.contributions ? acceptedWorkForUser(person.id, { publicOnly }) : [];
  const following = viewer ? isFollowing(viewer.id, person.id) : false;

  const projectList =
    projectFilter === "contributing"
      ? history.contributed
      : projectFilter === "completed"
        ? [...history.owned, ...history.contributed].filter((project) => project.stage === "completed")
        : history.owned;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "posts", label: "Posts", count: posts.length },
    { id: "projects", label: "Projects", count: history.owned.length + history.contributed.length },
    { id: "teachings", label: "Teachings", count: resources.length + journeys.length },
    { id: "learnings", label: "Learnings", count: learnings.length },
    { id: "accepted", label: "Accepted", count: accepted.length },
  ];

  return (
    <div>
      <Flash error={error} notice={notice} />

      {/* Header: the person, then their actions, then the facts. There is no banner
          behind it — the page opens straight onto the avatar, name and username. */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar
            name={person.displayName}
            size={72}
            src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null}
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-navy-950 sm:text-[22px]">
              {person.displayName}
            </h1>
            <p className="truncate text-[12.5px] text-navy-500">@{person.username}</p>
            {userRoles.length > 0 || profileKind !== "individual" ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {userRoles.map((role) => (
                  <Badge key={role} tone="neutral">
                    {label(role)}
                  </Badge>
                ))}
                {profileKind !== "individual" ? (
                  <Badge tone={profileKind === "business" ? "info" : "brand"}>{accountKindLabel(profileKind)}</Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* The account's own options, in the header's top-right corner. Rendered by
              this page only, so no other page grows a control it does not use. */}
          {isSelf ? <ProfileMenu /> : null}
        </div>

        {person.bio ? <p className="mt-3 max-w-2xl text-[13px] leading-6 text-navy-700">{person.bio}</p> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isSelf ? (
            <>
              <ButtonLink href="/settings?tab=profile" size="sm" variant="primary">
                Edit profile
              </ButtonLink>
              <ButtonLink href="/create" size="sm" variant="creative">
                <Plus size={13} aria-hidden="true" /> Create
              </ButtonLink>
            </>
          ) : viewer ? (
            <>
              <form action={followUserAction}>
                <input type="hidden" name="userId" value={person.id} />
                <SubmitButton size="sm" variant={following ? "secondary" : "primary"} pendingLabel="…">
                  {following ? "Following" : "Follow"}
                </SubmitButton>
              </form>
              <form action={startDirectMessageAction}>
                <input type="hidden" name="userId" value={person.id} />
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                  <MessageSquare size={12} aria-hidden="true" /> Message
                </SubmitButton>
              </form>
              <ReportForm targetType="user" targetId={person.id} returnTo={`/u/${person.username}`} compact />
            </>
          ) : (
            <ButtonLink href="/auth/sign-in" size="sm">
              Sign in to follow
            </ButtonLink>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-navy-600">
          {person.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" /> {person.location}
            </span>
          ) : null}
          <span>Joined {formatDate(person.createdAt)}</span>
          {person.portfolioUrls && person.portfolioUrls.length > 0 ? (
            <a
              href={person.portfolioUrls[0]}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="text-brand-600 underline"
            >
              Portfolio
            </a>
          ) : null}
        </div>

        {skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <SkillTag key={skill.id} name={skill.name} href={`/explore?tab=skills&skill=${encodeURIComponent(skill.name)}`} />
            ))}
          </div>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-navy-200 pt-4 sm:grid-cols-4">
          {[
            { label: "Posts", value: publishedPosts.length, hint: `${posts.length - publishedPosts.length} draft` },
            {
              label: "Followers",
              value: view.followers ? followers.followers : "—",
              hint: `Following ${followers.following}`,
            },
            {
              label: "Accepted work",
              value: view.contributions ? contributions.completed : "—",
              hint: `${reputation.totals.contribution} contribution pts`,
            },
            { label: "Teaching", value: reputation.totals.teaching, hint: "Points from learner feedback" },
          ].map((metric) => (
            <div key={metric.label}>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-400">{metric.label}</dt>
              <dd className="mt-0.5 text-xl font-semibold leading-tight text-navy-950">{metric.value}</dd>
              <dd className="text-[10.5px] leading-4 text-navy-500">{metric.hint}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {blocked ? (
        <div className="mt-4">
          <Alert tone="warning" title="You have blocked this person">
            Their content is hidden from your feed and they cannot message you.{" "}
            {viewer ? (
              <form action={blockUserAction} className="mt-1 inline">
                <input type="hidden" name="userId" value={person.id} />
                <input type="hidden" name="unblock" value="true" />
                <input type="hidden" name="returnTo" value={`/u/${person.username}`} />
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                  Unblock
                </SubmitButton>
              </form>
            ) : null}
          </Alert>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mt-5">
        {/* Edge-to-edge scroll on phones, so the tabs never squeeze the content. */}
        <ul
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Profile sections"
        >
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <li key={item.id}>
                <Link
                  href={`/u/${person.username}?tab=${item.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "border-brand-500 text-brand-600"
                      : "border-transparent text-navy-500 hover:text-navy-900",
                  )}
                >
                  {item.label}
                  {typeof item.count === "number" && item.count > 0 ? (
                    <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", active ? "bg-brand-50 text-brand-600" : "bg-navy-100 text-navy-600")}>{item.count}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Posts */}
      {tab === "posts" ? (
        <div className="mt-4">
          {posts.length === 0 ? (
            <EmptyState
              title={isSelf ? "You have not posted yet" : "No posts yet"}
              description={
                isSelf
                  ? "Share a photo of what you are building. Posts appear here and, when public, in the feed."
                  : "When this person publishes work, it appears here."
              }
              action={isSelf ? <ButtonLink href="/create/post" size="sm">Create a post</ButtonLink> : undefined}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {posts.map((post, index) => (
                <Reveal key={post.id} as="li" delay={Math.min(index * 40, 160)}>
                  <Link
                    href={`/posts/${post.id}`}
                    className="group relative block aspect-square overflow-hidden rounded-lg border border-navy-200/70 bg-navy-50"
                  >
                    {post.imageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${post.imageId}`}
                        alt={post.altText ?? ""}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-50 to-brand-50 p-3 text-center text-[12px] leading-5 text-navy-700">
                        <span className="line-clamp-6">{post.title ?? post.body}</span>
                      </span>
                    )}
                    {post.status === "draft" ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        Draft
                      </span>
                    ) : null}
                    {post.visibility !== "public" ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-navy-700">
                        Private
                      </span>
                    ) : null}
                  </Link>
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Projects */}
      {tab === "projects" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "created", label: "Created" },
              { id: "contributing", label: "Contributing" },
              { id: "completed", label: "Completed" },
            ].map((filter) => (
              <Link
                key={filter.id}
                href={`/u/${person.username}?tab=projects&filter=${filter.id}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  projectFilter === filter.id
                    ? "border-brand-500 bg-brand-50 text-brand-600"
                    : "border-navy-200 bg-surface text-navy-600 hover:border-navy-300",
                )}
                aria-current={projectFilter === filter.id ? "page" : undefined}
              >
                {filter.label}
              </Link>
            ))}
          </div>

          {projectList.length === 0 ? (
            <EmptyState
              title="No projects in this view"
              description={
                projectFilter === "created"
                  ? isSelf
                    ? "Start a project and it appears here with its real status."
                    : "This person has not created a public project yet."
                  : projectFilter === "contributing"
                    ? "Accepted contributions on other people's projects appear here."
                    : "Completed projects appear here once their status says so."
              }
              action={isSelf && projectFilter === "created" ? <ButtonLink href="/projects/new" size="sm">Start a project</ButtonLink> : undefined}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projectList.map((project) => (
                <li key={project.id} className="relative">
                  <ProjectCard project={project} />
                  <span className="absolute right-3 top-3">
                    <Badge tone={history.owned.some((owned) => owned.id === project.id) ? "brand" : "neutral"}>
                      {history.owned.some((owned) => owned.id === project.id) ? "Owner" : "Contributor"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {attributions.length > 0 && view.contributions ? (
            <Card>
              <div className="border-b border-navy-200 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Contribution history</h2>
                <p className="text-[11px] text-navy-500">Owner-confirmed records. These are not independent verification.</p>
              </div>
              <ul className="divide-y divide-navy-200">
                {attributions.map((row) => (
                  <li key={row.attribution.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Link href={`/projects/${row.attribution.projectId}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                      {row.projectName}
                    </Link>
                    {row.taskTitle ? <span className="text-[11.5px] text-navy-500">{row.taskTitle}</span> : null}
                    <Badge tone={row.attribution.verificationMethod === "owner_confirmed" ? "info" : "success"}>
                      {row.attribution.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Platform verified"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Teachings */}
      {tab === "teachings" ? (
        <div className="mt-4 space-y-4">
          {!view.learning && !isSelf ? (
            <EmptyState
              title="Teaching is private"
              description="This person has chosen not to show the learning material they published."
            />
          ) : resources.length + journeys.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={22} aria-hidden="true" />}
              title={isSelf ? "You have not published a teaching yet" : "No published teaching yet"}
              description={
                isSelf
                  ? "Turn something you know into a guide or explainer. It appears in Learning and here."
                  : "Tutorials, guides and explainers this person publishes appear here."
              }
              action={isSelf ? <ButtonLink href="/create/teaching" size="sm">Create a teaching</ButtonLink> : undefined}
            />
          ) : (
            <>
              {resources.length > 0 ? (
                <ul className="grid gap-3">
                  {resources.map((resource) => (
                    <li key={resource.id}>
                      <ResourceCard resource={{ ...resource, creatorName: person.displayName, creatorUsername: person.username }} />
                      {resource.status !== "published" ? (
                        <p className="mt-1 text-[10.5px] text-navy-400">Draft — only you can see this.</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {journeys.length > 0 ? (
                <Card>
                  <div className="border-b border-navy-200 px-5 py-3.5">
                    <h2 className="text-[13px] font-semibold text-navy-900">Learning journeys</h2>
                  </div>
                  <ul className="divide-y divide-navy-200">
                    {journeys.map((journey) => (
                      <li key={journey.id} className="px-5 py-3">
                        <Link href={`/learn/journeys/${journey.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                          {journey.title}
                        </Link>
                        <p className="text-[11px] capitalize text-navy-500">{journey.status}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Learnings */}
      {tab === "learnings" ? (
        <div className="mt-4 space-y-4">
          {!isSelf && !sharesLearning ? (
            <EmptyState
              title="Learning history is private"
              description="Completed learning is only shown when the person chooses to share it."
            />
          ) : learnings.length === 0 ? (
            <EmptyState
              title={isSelf ? "You have not marked anything complete" : "Nothing completed yet"}
              description={
                isSelf
                  ? "Completing a lesson in Learning records it here. It stays private unless you share it."
                  : undefined
              }
              action={isSelf ? <ButtonLink href="/learn" size="sm">Browse Learning</ButtonLink> : undefined}
            />
          ) : (
            <>
              {isSelf ? (
                <Alert tone={sharesLearning ? "info" : "warning"} title={sharesLearning ? "Your learning history is visible on your profile" : "Your learning history is private"}>
                  {sharesLearning
                    ? "Only completed items are shown. You can turn this off in Settings → Privacy."
                    : "Only you can see this list. Sharing it is opt-in, in Settings → Privacy."}{" "}
                  <Link href="/settings?tab=privacy" className="underline">
                    Privacy settings
                  </Link>
                </Alert>
              ) : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {learnings.map((item) => (
                  <li key={item.resourceId}>
                    <Link href={`/learn/${item.resourceId}`} className="block">
                      <Card className="motion-card h-full p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13px] font-semibold text-navy-950">{item.title}</h3>
                          <Badge tone="success">
                            <CheckCircle2 size={11} aria-hidden="true" /> Complete
                          </Badge>
                        </div>
                        {item.summary ? <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-navy-600">{item.summary}</p> : null}
                        <p className="mt-2 text-[10.5px] text-navy-500">
                          {item.creatorName} · finished {relativeTime(item.completedAt)}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {/* Accepted work */}
      {tab === "accepted" ? (
        <div className="mt-4 space-y-4">
          {!view.contributions && !isSelf ? (
            <EmptyState title="Accepted work is private" description="This person has chosen not to show their contribution records." />
          ) : accepted.length === 0 ? (
            <EmptyState
              title={isSelf ? "No accepted work yet" : "No accepted work yet"}
              description="Accepted work appears here when a project reviewer approves a task this person delivered."
              action={isSelf ? <ButtonLink href="/projects" size="sm">See your tasks</ButtonLink> : undefined}
            />
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {accepted.map((item) => (
                  <li key={`${item.attributionId}-${item.deliverable?.id ?? "none"}`}>
                    <Card className="motion-card h-full p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/projects/${item.projectId}`} className="text-[12px] font-medium text-brand-600 hover:underline">
                          {item.projectName}
                        </Link>
                        <Badge tone={item.verificationMethod === "owner_confirmed" ? "info" : "success"}>
                          {item.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Platform verified"}
                        </Badge>
                        {item.status === "disputed" ? <Badge tone="danger">Disputed</Badge> : null}
                      </div>
                      <h3 className="mt-1 text-[13.5px] font-semibold text-navy-950">
                        {item.deliverable?.title ?? item.taskTitle ?? "Contribution"}
                      </h3>
                      <p className="mt-0.5 text-[11.5px] text-navy-500">
                        {item.role}
                        {item.confirmedAt ? ` · accepted ${relativeTime(item.confirmedAt)}` : ""}
                      </p>
                      {item.summary ? <p className="mt-1.5 line-clamp-3 text-[12px] leading-5 text-navy-600">{item.summary}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px]">
                        {item.taskId ? (
                          <Link href={`/tasks/${item.taskId}`} className="text-brand-600 underline">
                            View the task
                          </Link>
                        ) : null}
                        {item.deliverable?.url ? (
                          <a
                            href={item.deliverable.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-brand-600 underline"
                          >
                            Open deliverable
                          </a>
                        ) : null}
                        {item.deliverable?.fileId ? (
                          <Link href={`/api/files/${item.deliverable.fileId}`} className="text-brand-600 underline">
                            Download file
                          </Link>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
              <p className="text-[10.5px] text-navy-400">
                Acceptance by a project owner is a record of a decision, not independent verification of the work.
              </p>
            </>
          )}
        </div>
      ) : null}

      {/* About, achievements, organisations and links: kept, no longer a tab. */}
      <section aria-labelledby="profile-about" className="mt-5">
        <h2 id="profile-about" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-navy-500">
          About, achievements and links
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="border-b border-navy-200 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Verified contribution record</h2>
              <p className="text-[11px] text-navy-500">Each record names how it was confirmed.</p>
            </div>
            <ul className="divide-y divide-navy-200">
              {view.contributions ? (
                verified.slice(0, 6).map((row) => (
                  <li key={row.attribution.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/projects/${row.attribution.projectId}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                        {row.projectName}
                      </Link>
                      <Badge tone={row.attribution.verificationMethod === "owner_confirmed" ? "info" : "success"}>
                        {row.attribution.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Platform verified"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-navy-600">
                      {row.attribution.role}
                      {row.attribution.summary ? ` · ${row.attribution.summary}` : ""}
                    </p>
                  </li>
                ))
              ) : (
                <li className="px-5 py-4 text-[12px] text-navy-500">Contribution records are private.</li>
              )}
              {view.contributions && verified.length === 0 ? (
                <li className="px-5 py-4 text-[12px] text-navy-500">No confirmed contributions yet.</li>
              ) : null}
            </ul>
          </Card>

          <div className="space-y-4">
            {profileBusinesses.length > 0 ? (
              <Card className="p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Organisations</h2>
                <ul className="mt-2 space-y-1.5">
                  {profileBusinesses.map((business) => (
                    <li key={business.id} className="text-[12.5px] text-navy-700">
                      <Link href={`/business/${business.id}`} className="font-medium text-navy-900 hover:underline">
                        {business.name}
                      </Link>
                      <span className="ml-1 text-[10.5px] text-navy-500">· {business.role.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10.5px] leading-4 text-navy-400">
                  Organisation work stays private to its team unless it is published.
                </p>
              </Card>
            ) : null}

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Achievements</h2>
              <ul className="mt-2 space-y-2">
                {achievements.map((achievement) => (
                  <li key={achievement.id} className="flex items-start gap-2">
                    <Star size={13} className="mt-0.5 text-brand-600" aria-hidden="true" />
                    <div>
                      <p className="text-[11.5px] font-medium text-navy-800">{achievement.title}</p>
                      <p className="text-[10px] text-navy-500">{achievement.description ?? relativeTime(achievement.earnedAt)}</p>
                    </div>
                  </li>
                ))}
                {achievements.length === 0 ? <li className="text-[11px] text-navy-400">None yet.</li> : null}
              </ul>
            </Card>

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Reputation</h2>
              <ul className="mt-2 space-y-1.5 text-[12px] text-navy-700">
                <li className="flex justify-between">
                  <span>Contribution</span>
                  <span className="tabular-nums">{reputation.totals.contribution}</span>
                </li>
                <li className="flex justify-between">
                  <span>Expertise</span>
                  <span className="tabular-nums">{reputation.totals.expertise}</span>
                </li>
                <li className="flex justify-between">
                  <span>Teaching</span>
                  <span className="tabular-nums">{reputation.totals.teaching}</span>
                </li>
                <li className="flex justify-between">
                  <span>Influence</span>
                  <span className="tabular-nums">{reputation.totals.influence}</span>
                </li>
              </ul>
              <p className="mt-2 text-[10px] leading-4 text-navy-400">
                Points are traceable to individual records. There is no combined score.
              </p>
            </Card>

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Links</h2>
              <ul className="mt-2 space-y-1 text-[12px]">
                {person.portfolioUrls && person.portfolioUrls.length > 0 ? (
                  person.portfolioUrls.slice(0, 3).map((url) => (
                    <li key={url}>
                      <a href={url} rel="nofollow noopener noreferrer" target="_blank" className="text-brand-600 underline">
                        {new URL(url).hostname.replace(/^www\./, "")}
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="text-navy-400">No links added.</li>
                )}
              </ul>
              {isSelf ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href="/settings?tab=privacy" size="sm" variant="secondary">
                    Privacy
                  </ButtonLink>
                  <ButtonLink href="/settings?tab=contributions" size="sm" variant="ghost">
                    My records
                  </ButtonLink>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </section>

      {!viewer ? (
        <p className="mt-4 text-[11px] text-navy-400">
          <Link href="/auth/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to follow, message or report.
        </p>
      ) : null}
    </div>
  );
}
