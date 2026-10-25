import Link from "next/link";
import { searchAll } from "@/services/social";
import { Badge, ButtonLink, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { label } from "@/lib/types";
import { money } from "@/lib/format";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const results = query ? searchAll(query, 8) : null;
  const total = results
    ? results.projects.length + results.people.length + results.skills.length + results.resources.length + results.businesses.length
    : 0;

  return (
    <div>
      <PageHeader
        title={query ? `Search results for “${query}”` : "Search"}
        description="One search across projects, people, skills, learning resources and businesses."
      />

      <Card className="mb-6 p-4">
        <form action="/search" className="flex flex-wrap gap-2">
          <Field label="Search BuildTogether" htmlFor="q" className="flex-1">
            <Input id="q" name="q" defaultValue={query} placeholder="Try “accessibility”, “sensor”, “field data”" autoFocus={!query} />
          </Field>
          <button type="submit" className="mt-auto h-10 rounded-lg bg-brand-600 px-5 text-[13px] font-medium text-white hover:bg-brand-700">
            Search
          </button>
        </form>
      </Card>

      {!query ? (
        <EmptyState
          title="Search for something specific"
          description="Results are ranked by match relevance and recency. Promoted placement is not sold, so ranking is never silently influenced by payment."
        />
      ) : total === 0 ? (
        <EmptyState title="No results" description="Try a shorter term, or browse Explore to find projects and people." action={<ButtonLink href="/explore" size="sm">Browse Explore</ButtonLink>} />
      ) : (
        <div className="space-y-5">
          {results?.projects.length ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Projects</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {results.projects.map((project) => (
                  <li key={project.id} className="px-5 py-3">
                    <Link href={`/projects/${project.id}`} className="text-[13px] font-semibold text-navy-900 hover:underline">
                      {project.name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-navy-600">{project.shortDescription}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Badge tone="neutral">{label(project.category)}</Badge>
                      <Badge tone="neutral">{label(project.stage)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {results?.people.length ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">People</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {results.people.map((person) => (
                  <li key={person.id} className="px-5 py-3">
                    <Link href={`/u/${person.username}`} className="text-[13px] font-semibold text-navy-900 hover:underline">
                      {person.displayName}
                    </Link>
                    <span className="ml-2 text-[11px] text-navy-400">@{person.username}</span>
                    {person.bio ? <p className="mt-0.5 text-[12px] text-navy-600">{person.bio}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {results?.resources.length ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Learning resources</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {results.resources.map((resource) => (
                  <li key={resource.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <Link href={`/learn/${resource.id}`} className="text-[13px] font-semibold text-navy-900 hover:underline">
                        {resource.title}
                      </Link>
                      <p className="text-[12px] text-navy-600">{resource.summary}</p>
                    </div>
                    <Badge tone={resource.priceCents > 0 ? "warning" : "success"}>
                      {resource.priceCents > 0 ? money(resource.priceCents) : "Free"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {results?.skills.length ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Skills</h2>
              </div>
              <ul className="flex flex-wrap gap-2 p-5">
                {results.skills.map((skill) => (
                  <li key={skill.id}>
                    <Link href={`/explore?tab=projects&skill=${skill.slug}`} className="rounded-md bg-navy-50 px-2.5 py-1.5 text-[12px] font-medium text-navy-700 hover:bg-navy-100">
                      {skill.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {results?.businesses.length ? (
            <Card>
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Businesses</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {results.businesses.map((business) => (
                  <li key={business.id} className="px-5 py-3">
                    <Link href={`/business/${business.id}`} className="text-[13px] font-semibold text-navy-900 hover:underline">
                      {business.name}
                    </Link>
                    <p className="text-[12px] text-navy-600">{business.description}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
