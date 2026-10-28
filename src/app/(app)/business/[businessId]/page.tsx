import Link from "next/link";
import { notFound } from "next/navigation";
import { addBusinessMemberAction, removeBusinessMemberAction, updateBusinessAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  DefinitionList,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Stat,
  Tabs,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { BUSINESS_ROLES, label } from "@/lib/types";
import { businessAnalytics, businessDetail } from "@/services/business";
import { projectsForBusiness } from "@/services/projects";

export const dynamic = "force-dynamic";

export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const viewer = await getCurrentUser();

  const detail = businessDetail(businessId, viewer?.id ?? null);
  if (!detail) notFound();

  const { business, members, portfolio, isMember, role } = detail;
  const canManage = role === "owner" || role === "admin";
  const tab = typeof query.tab === "string" ? query.tab : "overview";
  const analytics = isMember ? businessAnalytics(businessId, viewer!.id) : null;
  const projects = projectsForBusiness(businessId);

  return (
    <div>
      <PageHeader
        title={business.name}
        description={business.description ?? "No description yet."}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={business.visibility === "public" ? "success" : "neutral"}>{business.visibility}</Badge>
            {business.website ? (
              <ButtonLink href={business.website} size="sm" variant="secondary">
                Website
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={tab}
        items={[
          { id: "overview", label: "Overview", href: `/business/${businessId}` },
          { id: "team", label: "Team", href: `/business/${businessId}?tab=team`, count: members.length },
          { id: "analytics", label: "Analytics", href: `/business/${businessId}?tab=analytics` },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Card>
              <div className="border-b border-navy-200 px-5 py-3.5">
                <h2 className="text-[13px] font-semibold text-navy-900">Public project portfolio</h2>
                <p className="text-[11px] text-navy-500">Only published projects attached to this organisation appear here.</p>
              </div>
              <ul className="divide-y divide-navy-200">
                {portfolio.map((project) => (
                  <li key={project.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/projects/${project.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                        {project.name}
                      </Link>
                      <Badge tone="brand">{label(project.category)}</Badge>
                      <Badge tone="neutral">{label(project.stage)}</Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-5 text-navy-600">{project.shortDescription}</p>
                    <p className="mt-0.5 text-[10.5px] text-navy-400">
                      {project.viewCount} views · published {project.publishedAt ? formatDate(project.publishedAt) : "—"}
                    </p>
                  </li>
                ))}
                {portfolio.length === 0 ? (
                  <li className="p-5">
                    <EmptyState
                      title="No published projects"
                      description={canManage ? "Attach a project to this organisation when creating or editing it." : undefined}
                    />
                  </li>
                ) : null}
              </ul>
            </Card>

            {canManage ? (
              <Card className="p-5">
                <h2 className="text-[13px] font-semibold text-navy-900">Business settings</h2>
                <form action={updateBusinessAction} className="mt-2 space-y-3">
                  <input type="hidden" name="businessId" value={businessId} />
                  <Field label="Name" htmlFor="name">
                    <Input id="name" name="name" defaultValue={business.name} maxLength={120} />
                  </Field>
                  <Field label="Description" htmlFor="description">
                    <Textarea id="description" name="description" rows={3} defaultValue={business.description ?? ""} maxLength={2000} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Industry" htmlFor="industry">
                      <Input id="industry" name="industry" defaultValue={business.industry ?? ""} maxLength={80} />
                    </Field>
                    <Field label="Website" htmlFor="website">
                      <Input id="website" name="website" type="url" defaultValue={business.website ?? ""} />
                    </Field>
                  </div>
                  <Field label="Visibility" htmlFor="visibility" hint="Switching to private hides the profile and its projects from discovery.">
                    <Select id="visibility" name="visibility" defaultValue={business.visibility}>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </Select>
                  </Field>
                  <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
                </form>
              </Card>
            ) : null}
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Organisation</h2>
              <DefinitionList
                items={[
                  { term: "Industry", value: business.industry ?? "—" },
                  { term: "Visibility", value: business.visibility },
                  { term: "Team members", value: String(members.length) },
                  { term: "Projects", value: String(projects.length) },
                  { term: "Created", value: formatDate(business.createdAt) },
                  { term: "Your role", value: role ? role.replace(/_/g, " ") : "not a member" },
                ]}
              />
            </Card>
            <Alert tone="info" title="Organisation permissions">
              Only the owner and organisation admins can edit the profile, add or remove team members and see analytics. Everyone
              else sees the public portfolio.
            </Alert>
          </aside>
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <div className="border-b border-navy-200 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Team</h2>
            </div>
            <ul className="divide-y divide-navy-200">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={member.displayName} size={28} src={member.avatarFileId ? `/api/files/${member.avatarFileId}` : null} />
                    <div>
                      <Link href={`/u/${member.username}`} className="text-[12.5px] font-medium text-navy-900 hover:underline">
                        {member.displayName}
                      </Link>
                      <p className="text-[10.5px] text-navy-500">{member.role.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  {canManage && member.role !== "owner" ? (
                    <form action={removeBusinessMemberAction}>
                      <input type="hidden" name="businessId" value={businessId} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…" confirmMessage="Remove this person from the organisation?">
                        Remove
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          {canManage ? (
            <aside className="space-y-4">
              <Card className="p-4">
                <h2 className="text-[13px] font-semibold text-navy-900">Add a team member</h2>
                <form action={addBusinessMemberAction} className="mt-2 space-y-2">
                  <input type="hidden" name="businessId" value={businessId} />
                  <Field label="Username" htmlFor="username">
                    <Input id="username" name="username" required placeholder="ada" />
                  </Field>
                  <Field label="Role" htmlFor="role">
                    <Select id="role" name="role" defaultValue="member">
                      {BUSINESS_ROLES.filter((entry) => entry !== "owner").map((entry) => (
                        <option key={entry} value={entry}>
                          {label(entry)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton className="w-full" size="sm" pendingLabel="Adding…">
                    Add member
                  </SubmitButton>
                </form>
              </Card>
            </aside>
          ) : null}
        </div>
      ) : null}

      {tab === "analytics" ? (
        analytics ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Projects" value={analytics.projects} hint="Published and linked to this organisation" />
            <Stat label="Project views" value={analytics.views} hint="Recorded by the platform" />
            <Stat label="Followers" value={analytics.followers} hint="Across all organisation projects" />
            <Stat label="Tracked events" value={analytics.events} hint="Views and interactions on project pages" />
            <div className="sm:col-span-2 xl:col-span-4">
              <Alert tone="info" title="Platform analytics, not audited results">
                These numbers come from this platform only. They are not externally verified commercial metrics and must not be
                presented as revenue or market performance.
              </Alert>
            </div>
          </div>
        ) : (
          <Alert tone="warning" title="Members only">
            Business analytics are visible only to organisation members with an administrative role.
          </Alert>
        )
      ) : null}
    </div>
  );
}
