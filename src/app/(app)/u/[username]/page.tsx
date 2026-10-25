import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, MessageSquare, Star, TrendingUp } from "lucide-react";
import { blockUserAction, followUserAction } from "@/app/actions/social";
import { startDirectMessageAction } from "@/app/actions/chat";
import { ReportForm } from "@/components/report-form";
import { ProjectCard, ResourceCard } from "@/components/cards";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  EmptyState,
  Flash,
  Progress,
  SkillTag,
  Stat,
  Tabs,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { achievementsFor, reputationSummary } from "@/lib/reputation";
import { isBlockedEitherWay } from "@/lib/authz";
import { attributedSkills, contributionCounts, projectHistory, verifiedContributions } from "@/services/profile";
import { followerCounts, getUserByUsername, getUserRolesList, isFollowing, userSkillsFor } from "@/services/users";
import { resourcesForCreator, journeysFor } from "@/services/learning";
import { productsForCreator } from "@/services/commerce";
import { listAttributions } from "@/services/tasks";
import { postsByAuthor } from "@/services/social";

export const dynamic = "force-dynamic";

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

  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === person.id;
  const blocked = viewer ? isBlockedEitherWay(viewer.id, person.id) : false;
  const tab = typeof query.tab === "string" ? query.tab : "about";

  const skills = userSkillsFor(person.id);
  const userRoles = getUserRolesList(person.id);
  const followers = followerCounts(person.id);
  const reputation = reputationSummary(person.id);
  const achievements = achievementsFor(person.id);
  const history = projectHistory(person.id);
  const contributions = contributionCounts(person.id);
  const verified = verifiedContributions(person.id);
  const attributions = listAttributions(person.id);
  const resources = resourcesForCreator(person.id).filter((resource) => resource.status === "published" || isSelf);
  const journeys = journeysFor(person.id).filter((journey) => journey.status === "published" || isSelf);
  const products = productsForCreator(person.id).filter((row) => row.product.status === "published" || isSelf);
  const posts = postsByAuthor(person.id, viewer?.id ?? null);
  const following = viewer ? isFollowing(viewer.id, person.id) : false;
  const skillEvidence = attributedSkills(person.id);

  const tabs = [
    { id: "about", label: "About", href: `/u/${person.username}` },
    { id: "work", label: "Work", href: `/u/${person.username}?tab=work`, count: contributions.total },
    { id: "learning", label: "Learning", href: `/u/${person.username}?tab=learning`, count: resources.length + journeys.length },
    { id: "reputation", label: "Reputation", href: `/u/${person.username}?tab=reputation` },
  ];

  return (
    <div>
      <Flash error={error} notice={notice} />

      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-navy-900 via-navy-800 to-brand-800" aria-hidden="true" />
        <div className="px-5 pb-5">
          <div className="-mt-9 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <span className="rounded-full ring-4 ring-white">
                <Avatar
                  name={person.displayName}
                  size={72}
                  src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null}
                />
              </span>
              <div className="pb-1">
                <h1 className="text-xl font-semibold tracking-tight text-navy-950">{person.displayName}</h1>
                <p className="text-[12.5px] text-navy-500">@{person.username}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-1">
              {isSelf ? (
                <ButtonLink href="/settings" size="sm" variant="secondary">
                  Edit profile
                </ButtonLink>
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
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-navy-600">
            {person.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" /> {person.location}
              </span>
            ) : null}
            <span>Joined {formatDate(person.createdAt)}</span>
          </div>

          {person.bio ? <p className="mt-3 max-w-3xl text-[13px] leading-6 text-navy-700">{person.bio}</p> : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <SkillTag key={skill.id} name={skill.name} href={`/explore?tab=skills&skill=${encodeURIComponent(skill.name)}`} />
            ))}
            {skills.length === 0 ? <p className="text-[12px] text-navy-400">No skills listed yet.</p> : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-navy-100 pt-4 sm:grid-cols-4">
            <Stat label="Followers" value={followers.followers} hint={`Following ${followers.following}`} />
            <Stat label="Contributions" value={contributions.completed} hint={`${contributions.active} active`} />
            <Stat label="Projects" value={history.owned.length} hint={`${history.contributed.length} contributed to`} />
            <Stat label="Learners reached" value={reputation.totals.teaching} hint="Teaching points earned" />
          </div>
        </div>
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

      <div className="mt-5">
        <Tabs current={tab} items={tabs} />
      </div>

      {tab === "about" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Card>
              <div className="border-b border-navy-100 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Verified contribution record</h2>
                <p className="text-[11px] text-navy-500">
                  Each record names how it was confirmed. Owner confirmation is not the same as independent verification.
                </p>
              </div>
              <ul className="divide-y divide-navy-100">
                {verified.slice(0, 6).map((row) => (
                  <li key={row.attribution.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/projects/${row.attribution.projectId}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                        {row.projectName}
                      </Link>
                      <Badge tone={row.attribution.verificationMethod === "owner_confirmed" ? "info" : "success"}>
                        {row.attribution.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Platform verified"}
                      </Badge>
                      {row.attribution.status === "disputed" ? <Badge tone="danger">Disputed</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-navy-600">
                      {row.attribution.role} · {row.attribution.summary}
                    </p>
                    <p className="text-[10.5px] text-navy-400">Confirmed {relativeTime(row.attribution.confirmedAt ?? row.attribution.createdAt)}</p>
                  </li>
                ))}
                {verified.length === 0 ? (
                  <li className="p-5">
                    <EmptyState
                      title="No confirmed contributions yet"
                      description="Contributions appear here once a project owner confirms a submitted task."
                    />
                  </li>
                ) : null}
              </ul>
            </Card>

            <Card>
              <div className="border-b border-navy-100 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Recent posts</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {posts.slice(0, 5).map((post) => (
                  <li key={post.id} className="px-5 py-3">
                    <p className="text-[12.5px] font-medium capitalize text-navy-900">{post.kind.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-5 text-navy-600">{post.body}</p>
                    <p className="mt-0.5 text-[10.5px] text-navy-400">{relativeTime(post.createdAt)}</p>
                  </li>
                ))}
                {posts.length === 0 ? (
                  <li className="px-5 py-6 text-center text-[12px] text-navy-500">No posts yet.</li>
                ) : null}
              </ul>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Reputation dimensions</h2>
              <div className="mt-2 space-y-2.5">
                {(
                  [
                    ["contribution", "Contribution", "Completed, documented work confirmed by an owner"],
                    ["expertise", "Expertise", "Skills demonstrated across tasks and outcomes"],
                    ["teaching", "Teaching", "Learner feedback on published material"],
                    ["influence", "Influence", "Followers and reach — not a quality signal"],
                  ] as const
                ).map(([key, title, hint]) => (
                  <div key={key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-medium text-navy-800">{title}</span>
                      <span className="text-[11px] tabular-nums text-navy-500">{reputation.totals[key]}</span>
                    </div>
                    <Progress value={Math.min(100, Math.round((reputation.totals[key] / 200) * 100))} label={hint} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-navy-400">
                Points are traceable to individual records. There is no single combined score.
              </p>
            </Card>

            {skillEvidence.length > 0 ? (
              <Card className="p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Skill evidence</h2>
                <ul className="mt-2 space-y-1.5">
                  {skillEvidence.map((entry) => (
                    <li key={entry.skillId} className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-navy-700">{entry.name}</span>
                      <span className="text-[10.5px] text-navy-500">
                        {entry.tasks} task{entry.tasks === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
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

            {attributions.length > 0 ? (
              <Card className="p-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Attribution corrections</h2>
                <p className="mt-1 text-[11px] leading-5 text-navy-600">
                  If a record is wrong, open it to dispute or request a correction. Disputes are reviewed by moderation.
                </p>
                <ButtonLink href="/settings?tab=contributions" size="sm" variant="secondary" className="mt-2">
                  Manage my records
                </ButtonLink>
              </Card>
            ) : null}

            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Links</h2>
              <DefinitionList
                items={[
                  {
                    term: "Portfolio",
                    value:
                      person.portfolioUrls && person.portfolioUrls.length > 0 ? (
                        <span className="space-x-2">
                          {person.portfolioUrls.slice(0, 3).map((url) => (
                            <a key={url} href={url} rel="nofollow noopener noreferrer" target="_blank" className="text-brand-700 underline">
                              {new URL(url).hostname.replace(/^www\./, "")}
                            </a>
                          ))}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                  { term: "Timezone", value: person.timezone ?? "—" },
                  { term: "Roles", value: userRoles.join(", ") },
                ]}
              />
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "work" ? (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-navy-900">Projects created</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {history.owned.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
              {history.owned.length === 0 ? (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState title="No projects created" description={isSelf ? "Create a project to start building in public." : undefined} />
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-navy-900">Projects contributed to</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {history.contributed.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
              {history.contributed.length === 0 ? (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState title="No contributions yet" description="Accepted tasks on someone else's project appear here." />
                </div>
              ) : null}
            </div>
          </section>

          <Card>
            <div className="border-b border-navy-100 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Contribution history</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="border-b border-navy-100 bg-navy-50/60 text-[10.5px] uppercase tracking-wide text-navy-500">
                  <tr>
                    <th scope="col" className="px-5 py-2 font-medium">Project</th>
                    <th scope="col" className="px-5 py-2 font-medium">Role</th>
                    <th scope="col" className="px-5 py-2 font-medium">Verification</th>
                    <th scope="col" className="px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {attributions.map((row) => (
                    <tr key={row.attribution.id}>
                      <td className="px-5 py-2">
                        <Link href={`/projects/${row.attribution.projectId}`} className="font-medium text-navy-800 hover:underline">
                          {row.projectName}
                        </Link>
                        {row.taskTitle ? <span className="block text-[10.5px] text-navy-500">{row.taskTitle}</span> : null}
                      </td>
                      <td className="px-5 py-2 text-navy-600">{row.attribution.role}</td>
                      <td className="px-5 py-2">
                        <Badge tone={row.attribution.verificationMethod === "owner_confirmed" ? "info" : "success"}>
                          {row.attribution.verificationMethod === "owner_confirmed" ? "Owner confirmed" : "Platform verified"}
                        </Badge>
                      </td>
                      <td className="px-5 py-2">
                        <span className={cn("capitalize", row.attribution.status === "disputed" && "text-red-700")}>
                          {row.attribution.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {attributions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-navy-500">
                        No contribution records.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "learning" ? (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-navy-900">Learning resources</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {resources.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={{ ...resource, creatorName: person.displayName, creatorUsername: person.username }}
                />
              ))}
              {resources.length === 0 ? (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState title="No published learning resources" description="Free lessons and premium products appear here." />
                </div>
              ) : null}
            </div>
          </section>

          {journeys.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Learning journeys</h2>
              </div>
              <ul className="divide-y divide-navy-100">
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

          {products.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Premium products</h2>
                <p className="text-[11px] text-navy-500">Access is granted in test mode — no payment is taken.</p>
              </div>
              <ul className="divide-y divide-navy-100">
                {products.map((row) => (
                  <li key={row.product.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <Link href={`/checkout/${row.product.id}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                        {row.product.title}
                      </Link>
                      <p className="text-[11px] text-navy-500">{row.product.format.replace(/_/g, " ")}</p>
                    </div>
                    <span className="text-[12px] font-medium tabular-nums text-navy-800">
                      {row.product.priceCents === 0
                        ? "Free"
                        : `${row.product.currency} ${(row.product.priceCents / 100).toFixed(2)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "reputation" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <div className="border-b border-navy-100 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Reputation events</h2>
              <p className="text-[11px] text-navy-500">Every point names the record that produced it.</p>
            </div>
            <ul className="divide-y divide-navy-100">
              {reputation.recent.map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <div>
                    <p className="text-[12px] text-navy-800">{event.reason}</p>
                    <p className="text-[10.5px] capitalize text-navy-500">
                      {event.dimension} · {relativeTime(event.createdAt)}
                    </p>
                  </div>
                  <span className="text-[12px] font-medium tabular-nums text-brand-700">+{event.points}</span>
                </li>
              ))}
              {reputation.recent.length === 0 ? (
                <li className="px-5 py-6 text-center text-[12px] text-navy-500">No reputation events yet.</li>
              ) : null}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Skill reputation</h2>
              <ul className="mt-2 space-y-2">
                {reputation.skills.map((skill) => (
                  <li key={skill.skillId}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-navy-800">{skill.name}</span>
                      <span className="text-[10.5px] text-navy-500">
                        {skill.points} pts · {skill.events} event{skill.events === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Progress value={Math.min(100, skill.points)} />
                  </li>
                ))}
                {reputation.skills.length === 0 ? <li className="text-[11px] text-navy-400">No skill-linked events.</li> : null}
              </ul>
            </Card>

            <Card className="p-4">
              <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
                <TrendingUp size={12} aria-hidden="true" /> Teaching feedback
              </h2>
              <p className="mt-1 text-[12px] text-navy-700">
                {reputation.feedback.count > 0
                  ? `${reputation.feedback.average.toFixed(1)} average from ${reputation.feedback.count} learner rating${reputation.feedback.count === 1 ? "" : "s"}.`
                  : "No learner feedback yet."}
              </p>
            </Card>

            <Alert tone="info" title="How these numbers are produced">
              Contribution, expertise, teaching and influence are calculated separately from recorded events. Follower counts
              never adjust contribution or expertise. Manipulation (duplicate submissions, reciprocal reviews) is reviewed by
              moderation and can be reversed.
            </Alert>
          </div>
        </div>
      ) : null}

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
