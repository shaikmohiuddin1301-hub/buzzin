import Link from "next/link";
import { eq } from "drizzle-orm";
import { BookOpen, Briefcase, Compass, Sparkles, Users, Wrench } from "lucide-react";
import { getDb } from "@/db/client";
import { projectSkills, skills } from "@/db/schema";
import { ProjectCard, ResourceCard, PersonCard } from "@/components/cards";
import { Badge, ButtonLink, Card, EmptyState, Field, Flash, Input, PageHeader, Select, Tabs } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { listProjects } from "@/services/projects";
import { listResources, learningTopics } from "@/services/learning";
import { listSkills, searchPeople } from "@/services/users";
import { listChallenges, listBusinesses } from "@/services/social";
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
  const tab = typeof params.tab === "string" && TABS.some((t) => t.id === params.tab) ? params.tab : "projects";

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
  const businessQuery = typeof params.bq === "string" ? params.bq : "";

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
      <PageHeader
        title="Explore"
        description="Projects looking for collaborators, people with the skills, learning material built from real work, and the challenges running now."
        actions={
          <form action="/explore" className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label htmlFor="explore-q" className="sr-only">
              Search
            </label>
            <Input id="explore-q" name="q" defaultValue={q} placeholder="Search…" className="h-9 w-48 text-[13px]" />
            <ButtonLink href="/search" variant="ghost" size="sm">
              Advanced
            </ButtonLink>
          </form>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs current={tab} items={TABS.map((item) => ({ id: item.id, label: item.label, href: `/explore?tab=${item.id}` }))} />

      {tab === "projects" ? (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="h-fit p-4">
            <form action="/explore" className="space-y-3">
              <input type="hidden" name="tab" value="projects" />
              <Field label="Search" htmlFor="filter-q">
                <Input id="filter-q" name="q" defaultValue={q} placeholder="Keywords" />
              </Field>
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
              <button type="submit" className="w-full rounded-lg bg-navy-950 px-3 py-2 text-[13px] font-medium text-white hover:bg-navy-800">
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
                {projectResults.map((project) => (
                  <ProjectCard key={project.id} project={{ ...project, skills: skillsByProject.get(project.id) ?? [] }} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "people" ? (
        <div>
          <form action="/explore" className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="people" />
            <Input name="q" defaultValue={q} placeholder="Search people by name, username or bio" className="max-w-sm" />
            <button type="submit" className="rounded-lg bg-navy-950 px-4 text-[13px] font-medium text-white">
              Search
            </button>
          </form>
          {people.length === 0 ? (
            <EmptyState title="No people found" description="Try a different search term." />
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
          <form action="/explore" className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="tab" value="skills" />
            <Input name="q" defaultValue={q} placeholder="Search skills" className="max-w-sm" />
            <button type="submit" className="rounded-lg bg-navy-950 px-4 text-[13px] font-medium text-white">
              Search
            </button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skillResults.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[13.5px] font-semibold text-navy-950">{item.name}</h3>
                    <p className="text-[11px] text-navy-500">{item.category ?? "General"} · {item.people} people · {item.projects} projects</p>
                  </div>
                  <Link href={`/explore?tab=projects&skill=${item.slug}`} className="text-[11px] font-medium text-brand-700 hover:underline">
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
            <Input name="q" defaultValue={q} placeholder="Search learning" />
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
            <button type="submit" className="rounded-lg bg-navy-950 px-4 py-2 text-[13px] font-medium text-white sm:col-span-4">
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
            {resources.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
          {resources.length === 0 ? <EmptyState title="No learning resources match" /> : null}
        </div>
      ) : null}

      {tab === "businesses" ? (
        <div>
          <form action="/explore" className="mb-4 flex gap-2">
            <input type="hidden" name="tab" value="businesses" />
            <Input name="bq" defaultValue={businessQuery} placeholder="Search businesses" className="max-w-sm" />
            <button type="submit" className="rounded-lg bg-navy-950 px-4 text-[13px] font-medium text-white">Search</button>
          </form>
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
