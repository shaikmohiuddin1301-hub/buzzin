import Link from "next/link";
import { eq } from "drizzle-orm";
import { BookOpen, Briefcase, Compass, Sparkles, Users, Wrench } from "lucide-react";
import { getDb } from "@/db/client";
import { projectSkills, skills } from "@/db/schema";
import { followUserAction } from "@/app/actions/social";
import { ProjectCard, ResourceCard, PersonCard } from "@/components/cards";
import { Reveal } from "@/components/client/reveal";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Field, Flash, Input, Select, Tabs } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { listProjects } from "@/services/projects";
import { personalisedDiscovery } from "@/services/recommendations";
import { listResources, learningTopics } from "@/services/learning";
import { listSkills, searchPeople } from "@/services/users";
import { listChallenges, listBusinesses, searchAll } from "@/services/social";
import {
  COMPENSATION_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_STAGES,
  RESOURCE_FORMATS,
  RESOURCE_LEVELS,
  WORK_MODES,
  label,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Explore" };

const TABS = [
  { id: "foryou", label: "For you", icon: <Sparkles size={14} aria-hidden="true" /> },
  { id: "projects", label: "Projects", icon: <Compass size={14} aria-hidden="true" /> },
  { id: "people", label: "People", icon: <Users size={14} aria-hidden="true" /> },
  { id: "skills", label: "Skills", icon: <Wrench size={14} aria-hidden="true" /> },
  { id: "learning", label: "Learning", icon: <BookOpen size={14} aria-hidden="true" /> },
  { id: "businesses", label: "Businesses", icon: <Briefcase size={14} aria-hidden="true" /> },
  { id: "challenges", label: "Challenges", icon: <Sparkles size={14} aria-hidden="true" /> },
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { error, notice } = readFlash(params);
  const viewer = await getCurrentUser();
  const tab = typeof params.tab === "string" && TABS.some((t) => t.id === params.tab) ? params.tab : "foryou";

  const q = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  const workMode = typeof params.workMode === "string" ? params.workMode : "";
  const compensation = typeof params.compensation === "string" ? params.compensation : "";
  const skill = typeof params.skill === "string" ? params.skill : "";
  const sort = (typeof params.sort === "string" ? params.sort : "recent") as "recent" | "active" | "followed";
  const format = typeof params.format === "string" ? params.format : "";
  const level = typeof params.level === "string" ? params.level : "";
  const price = typeof params.price === "string" ? (params.price as "free" | "paid") : undefined;
  // The header search feeds every category, businesses included; `bq` stays for
  // links made before that field existed.
  const businessQuery = typeof params.bq === "string" && params.bq ? params.bq : q;
  // Only computed on the For you tab: other tabs keep their own queries.
  const discovery = viewer && tab === "foryou" ? personalisedDiscovery(viewer) : null;

  const projectResults =
    tab === "projects"
      ? listProjects({ q, category, stage, workMode, compensation, skill, sort, limit: 30 }, viewer)
      : [];

  const skillsByProject = new Map<string, { id: string; name: string; slug: string }[]>();
  if (tab === "projects" && projectResults.length > 0) {
    const db = getDb();
    for (const project of projectResults.slice(0, 30)) {
      const rows = db
        .select({ id: skills.id, name: skills.name, slug: skills.slug })
        .from(projectSkills)
        .innerJoin(skills, eq(skills.id, projectSkills.skillId))
        .where(eq(projectSkills.projectId, project.id))
        .limit(3)
        .all();
      skillsByProject.set(project.id, rows);
    }
  }

  // The default category answers a header search with results from every kind of
  // record, so a term never lands on a page that silently ignores it.
  const allResults = tab === "foryou" && q ? searchAll(q, 4) : null;
  const people = tab === "people" ? searchPeople(q, 30) : [];
  const skillResults = tab === "skills" ? listSkills(q || undefined) : [];
  const resources =
    tab === "learning" ? listResources({ q, format, level, price, limit: 30 }) : [];
  const topics = learningTopics();
  const businessResults = tab === "businesses" ? listBusinesses(businessQuery) : [];
  const challenges = tab === "challenges" ? listChallenges() : [];

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const merged = { tab, q, category, stage, workMode, compensation, skill, sort, format, level, price, bq: businessQuery, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
    }
    return `/explore?${query.toString()}`;
  };

  return (
    <div>
      {/* The header carries the search, so the page keeps its title for structure
          without spending a screen of space on an introduction. */}
      <h1 className="sr-only">Explore</h1>

      <Flash error={error} notice={notice} />

      {/* The category rail is the first thing under the header search, so results
          start high on the screen instead of behind an introduction. */}
      <Tabs
        current={tab}
        items={TABS.map((item) => ({
          id: item.id,
          label: item.label,
          href: q ? `/explore?tab=${item.id}&q=${encodeURIComponent(q)}` : `/explore?tab=${item.id}`,
        }))}
      />

      {q ? (
        <p className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-[12px] text-navy-500">
          <span>
            Results for <span className="font-medium text-navy-800">“{q}”</span>
          </span>
          <Link href={buildQuery({ q: undefined })} className="font-medium text-navy-700 underline">
            Clear search
          </Link>
        </p>
      ) : null}

      {allResults ? (
        <section className="mb-8" aria-labelledby="explore-results">
          <h2 id="explore-results" className="text-[15px] font-semibold text-navy-950">
            Results for “{q}”
          </h2>
          {allResults.projects.length + allResults.people.length + allResults.resources.length === 0 ? (
            <EmptyState
              title="Nothing matches that search"
              description="Try a shorter term, or browse the categories above."
            />
          ) : (
            <div className="mt-3 space-y-4">
              {allResults.projects.length > 0 ? (
                <Card>
                  <h3 className="border-b border-navy-200 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    Projects
                  </h3>
                  <ul className="divide-y divide-navy-200">
                    {allResults.projects.map((project) => (
                      <li key={project.id} className="px-4 py-2.5">
                        <Link href={`/projects/${project.id}`} className="text-[13px] font-medium text-navy-950 hover:underline">
                          {project.name}
                        </Link>
                        <p className="line-clamp-1 text-[11.5px] text-navy-500">{project.shortDescription}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              {allResults.people.length > 0 ? (
                <Card>
                  <h3 className="border-b border-navy-200 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    People
                  </h3>
                  <ul className="divide-y divide-navy-200">
                    {allResults.people.map((person) => (
                      <li key={person.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        <Avatar name={person.displayName} size={28} src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null} />
                        <Link href={`/u/${person.username}`} className="text-[13px] font-medium text-navy-950 hover:underline">
                          {person.displayName}
                        </Link>
                        <span className="text-[11.5px] text-navy-500">@{person.username}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              {allResults.resources.length > 0 ? (
                <Card>
                  <h3 className="border-b border-navy-200 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    Learning
                  </h3>
                  <ul className="divide-y divide-navy-200">
                    {allResults.resources.map((resource) => (
                      <li key={resource.id} className="px-4 py-2.5">
                        <Link href={`/learn/${resource.id}`} className="text-[13px] font-medium text-navy-950 hover:underline">
                          {resource.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {tab === "foryou" && discovery ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] leading-5 text-navy-500">
              {discovery.hasProfileSignals
                ? `Picked from ${discovery.signals.interests} interest${discovery.signals.interests === 1 ? "" : "s"}, ${discovery.signals.skills} skill${discovery.signals.skills === 1 ? "" : "s"}, ${discovery.signals.categories} categor${discovery.signals.categories === 1 ? "y" : "ies"} and ${discovery.signals.goals} goal${discovery.signals.goals === 1 ? "" : "s"}.`
                : "General picks. Add interests and skills for sharper matches."}
            </p>
            <ButtonLink href="/settings?tab=profile" variant="secondary" size="sm">
              Tune your interests
            </ButtonLink>
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-navy-950">Projects that need what you know</h2>
                <p className="text-[12px] text-navy-500">
                  Matched on your listed skills and categories. Private and team-only work is never included.
                </p>
              </div>
              <ButtonLink href="/explore?tab=projects" variant="ghost" size="sm">
                All projects →
              </ButtonLink>
            </div>
            {discovery.projects.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {discovery.projects.map((project, index) => (
                  <Reveal key={project.id} delay={Math.min(index * 40, 160)}>
                    <ProjectCard project={project} reasons={project.reasons.map((reason) => reason.label)} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No project matches yet"
                description="Add a skill or interest, or browse every public project."
                action={
                  <ButtonLink href="/explore?tab=projects" size="sm">
                    Browse projects
                  </ButtonLink>
                }
              />
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-navy-950">People to follow</h2>
                  <p className="text-[12px] text-navy-500">Shared skills, shared interests and the same city.</p>
                </div>
                <ButtonLink href="/explore?tab=people" variant="ghost" size="sm">
                  Everyone →
                </ButtonLink>
              </div>
              {discovery.people.length > 0 ? (
                <div className="space-y-3">
                  {discovery.people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      reasons={person.reasons.map((reason) => reason.label)}
                      action={
                        <form action={followUserAction}>
                          <input type="hidden" name="userId" value={person.id} />
                          <input type="hidden" name="returnTo" value="/explore?tab=foryou" />
                          <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                            Follow
                          </SubmitButton>
                        </form>
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-navy-200 p-4 text-[12px] text-navy-500">
                  No new people to suggest right now. Browse everyone in People.
                </p>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-navy-950">Learning for your goals</h2>
                  <p className="text-[12px] text-navy-500">Matched to your interests and what you are studying.</p>
                </div>
                <ButtonLink href="/learn" variant="ghost" size="sm">
                  Learning centre →
                </ButtonLink>
              </div>
              {discovery.learning.length > 0 ? (
                <div className="space-y-3">
                  {discovery.learning.map((resource) => (
                    <ResourceCard
                      key={resource.id}
                      resource={resource}
                      reasons={resource.reasons.map((reason) => reason.label)}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-navy-200 p-4 text-[12px] text-navy-500">
                  No learning suggestions yet. Browse the learning centre to add a topic you want to study.
                </p>
              )}
            </div>
          </section>

          {discovery.topics.length > 0 ? (
            <section>
              <h2 className="text-[15px] font-semibold text-navy-950">Explore by topic</h2>
              <p className="mt-0.5 text-[12px] text-navy-500">Real topics from published learning content.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {discovery.topics.map((topic) => (
                  <Link key={topic.topic} href={`/explore?tab=learning&q=${encodeURIComponent(topic.topic)}`}>
                    <Badge tone="neutral">
                      {topic.topic} ({topic.count})
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "projects" ? (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="h-fit p-4">
            <form action="/explore" className="space-y-3">
              <input type="hidden" name="tab" value="projects" />
              {/* The term comes from the header search; filters keep it. */}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <Field label="Category" htmlFor="filter-category">
                <Select id="filter-category" name="category" defaultValue={category}>
                  <option value="">Any category</option>
                  {PROJECT_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <details className="rounded-xl border border-navy-200/70 bg-navy-50/50 px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[12px] font-medium text-navy-700 [&::-webkit-details-marker]:hidden">
                  More filters
                  {[stage, workMode, compensation, skill].filter(Boolean).length + (sort !== "recent" ? 1 : 0) > 0 ? (
                    <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-800">
                      {[stage, workMode, compensation, skill].filter(Boolean).length + (sort !== "recent" ? 1 : 0)}
                    </span>
                  ) : null}
                </summary>
                <div className="mt-3 space-y-3">
              <Field label="Stage" htmlFor="filter-stage">
                <Select id="filter-stage" name="stage" defaultValue={stage}>
                  <option value="">Any stage</option>
                  {PROJECT_STAGES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ways of working" htmlFor="filter-work">
                <Select id="filter-work" name="workMode" defaultValue={workMode}>
                  <option value="">Remote or local</option>
                  {WORK_MODES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Arrangement" htmlFor="filter-comp">
                <Select id="filter-comp" name="compensation" defaultValue={compensation}>
                  <option value="">Any arrangement</option>
                  {COMPENSATION_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Skill" htmlFor="filter-skill" hint="Use the skill page to browse by name.">
                <Input id="filter-skill" name="skill" defaultValue={skill} placeholder="e.g. accessibility" />
              </Field>
              <Field label="Sort" htmlFor="filter-sort">
                <Select id="filter-sort" name="sort" defaultValue={sort}>
                  <option value="recent">Newest</option>
                  <option value="active">Most viewed</option>
                </Select>
              </Field>
                </div>
              </details>
              <button type="submit" className="w-full rounded-xl bg-brand-600 px-3 py-2 text-[13px] font-medium text-on-brand transition hover:bg-brand-700">
                Apply filters
              </button>
              <Link href="/explore" className="block text-center text-[11px] text-navy-500 hover:underline">
                Clear all
              </Link>
            </form>
          </Card>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-navy-500">
                {projectResults.length} project{projectResults.length === 1 ? "" : "s"} · public projects only
              </p>
              <div className="flex gap-2">
                <Badge tone="neutral">{q ? `“${q}”` : "All categories"}</Badge>
                {skill ? <Badge tone="brand">skill: {skill}</Badge> : null}
              </div>
            </div>

            {projectResults.length === 0 ? (
              <EmptyState
                title="No projects match those filters"
                description="Try removing a filter, or start the project you were looking for."
                action={<ButtonLink href="/projects/new" size="sm">Start a project</ButtonLink>}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projectResults.map((project, index) => (
                  <Reveal key={project.id} delay={Math.min(index * 45, 180)}>
                    <ProjectCard project={{ ...project, skills: skillsByProject.get(project.id) ?? [] }} />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "people" ? (
        <div>
          {people.length === 0 ? (
            <EmptyState
              title="No people found"
              description={q ? `Nobody matches “${q}”. Try a shorter term or a username.` : "No people to show yet."}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {people.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "skills" ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skillResults.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-navy-950">{item.name}</h3>
                    <p className="text-[11px] text-navy-500">{item.category ?? "General"} · {item.people} people · {item.projects} projects</p>
                  </div>
                  <Link href={`/explore?tab=projects&skill=${item.slug}`} className="text-[11px] font-medium text-brand-600 hover:underline">
                    Projects →
                  </Link>
                </div>
              </Card>
            ))}
            {skillResults.length === 0 ? <EmptyState title="No skills found" /> : null}
          </div>
        </div>
      ) : null}

      {tab === "learning" ? (
        <div>
          <form action="/explore" className="mb-4 grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="tab" value="learning" />
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <Select name="format" defaultValue={format}>
              <option value="">Any format</option>
              {RESOURCE_FORMATS.map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </Select>
            <Select name="level" defaultValue={level}>
              <option value="">Any level</option>
              {RESOURCE_LEVELS.map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </Select>
            <Select name="price" defaultValue={price ?? ""}>
              <option value="">Free or paid</option>
              <option value="free">Free only</option>
              <option value="paid">Premium only</option>
            </Select>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-medium text-on-brand sm:col-span-4">
              Filter learning
            </button>
          </form>
          {topics.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {topics.map((topic) => (
                <Link key={topic.topic} href={`/explore?tab=learning&q=${encodeURIComponent(topic.topic)}`}>
                  <Badge tone="neutral">{topic.topic} ({topic.count})</Badge>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {resources.map((resource, index) => (
              <Reveal key={resource.id} delay={Math.min(index * 45, 180)}>
                <ResourceCard resource={resource} />
              </Reveal>
            ))}
          </div>
          {resources.length === 0 ? <EmptyState title="No learning resources match" /> : null}
        </div>
      ) : null}

      {tab === "businesses" ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {businessResults.map((business) => (
              <Card key={business.id} className="p-5">
                <h3 className="text-[14px] font-semibold text-navy-950">{business.name}</h3>
                <p className="text-[11px] text-navy-500">{business.industry ?? "Independent organisation"}</p>
                <p className="mt-2 text-[12.5px] leading-6 text-navy-600">{business.description}</p>
                <ButtonLink href={`/business/${business.id}`} size="sm" variant="secondary" className="mt-3">
                  View business
                </ButtonLink>
              </Card>
            ))}
            {businessResults.length === 0 ? <EmptyState title="No businesses found" /> : null}
          </div>
        </div>
      ) : null}

      {tab === "challenges" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {challenges.map((challenge) => (
            <Card key={challenge.id} className="p-5">
              <div className="flex items-center justify-between">
                <Badge tone={challenge.status === "active" ? "success" : "neutral"}>{label(challenge.status)}</Badge>
                {challenge.deadline ? <span className="text-[11px] text-navy-500">Ends {formatDate(challenge.deadline)}</span> : null}
              </div>
              <h3 className="mt-2 text-[14px] font-semibold text-navy-950">{challenge.title}</h3>
              <p className="mt-1 text-[12.5px] leading-6 text-navy-600">{challenge.description}</p>
            </Card>
          ))}
          {challenges.length === 0 ? (
            <EmptyState title="No challenges running" description="Challenges are community prompts run by hosts." />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
