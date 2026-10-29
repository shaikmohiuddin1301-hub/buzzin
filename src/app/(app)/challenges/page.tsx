import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { challenges, projects, users } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { label } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Challenges" };

export default async function ChallengesPage() {
  const rows = getDb()
    .select({ challenge: challenges, hostName: users.displayName, hostUsername: users.username })
    .from(challenges)
    .innerJoin(users, eq(users.id, challenges.hostId))
    .orderBy(challenges.deadline)
    .all();

  const openProjects = getDb()
    .select({ id: projects.id, name: projects.name, category: projects.category, stage: projects.stage })
    .from(projects)
    .where(and(eq(projects.status, "published"), eq(projects.compensationType, "paid")))
    .limit(6)
    .all();

  return (
    <div>
      <PageHeader
        title="Challenges and opportunities"
        description="Time-boxed community challenges hosted by creators and organisations, plus paid work currently open on the platform."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="border-b border-navy-200 px-5 py-3.5">
            <h2 className="text-[13px] font-semibold text-navy-900">Active challenges</h2>
          </div>
          <ul className="divide-y divide-navy-200">
            {rows.map((row) => (
              <li key={row.challenge.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-navy-900">{row.challenge.title}</h3>
                  {row.challenge.category ? <Badge tone="rose">{label(row.challenge.category)}</Badge> : null}
                  <Badge tone={row.challenge.status === "active" ? "success" : "neutral"}>{row.challenge.status}</Badge>
                </div>
                <p className="mt-1 text-[12px] leading-6 text-navy-600">{row.challenge.description}</p>
                <p className="mt-1 text-[10.5px] text-navy-400">
                  Hosted by{" "}
                  <Link href={`/u/${row.hostUsername}`} className="underline">
                    {row.hostName}
                  </Link>
                  {row.challenge.deadline ? ` · closes ${formatDate(row.challenge.deadline)}` : ""}
                </p>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="p-5">
                <EmptyState
                  title="No challenges right now"
                  description="Challenges are created by creators and organisations. None are scheduled in this environment."
                />
              </li>
            ) : null}
          </ul>
        </Card>

        <aside className="space-y-4">
          <Card>
            <div className="border-b border-navy-200 px-4 py-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Paid work open now</h2>
            </div>
            <ul className="divide-y divide-navy-200">
              {openProjects.map((project) => (
                <li key={project.id} className="px-4 py-2.5">
                  <Link href={`/projects/${project.id}`} className="text-[12px] font-medium text-navy-900 hover:underline">
                    {project.name}
                  </Link>
                  <p className="text-[10.5px] text-navy-500">
                    {label(project.category)} · {label(project.stage)}
                  </p>
                </li>
              ))}
              {openProjects.length === 0 ? (
                <li className="px-4 py-3 text-[11.5px] text-navy-500">No paid projects published yet.</li>
              ) : null}
            </ul>
          </Card>
          <p className="text-[10.5px] leading-4 text-navy-500">
            Compensation labels describe what a project states publicly. The platform does not verify payment, and unpaid work is
            only lawful where the arrangement genuinely qualifies (for example volunteering or a recognised internship).
          </p>
        </aside>
      </div>
    </div>
  );
}
