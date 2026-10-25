import Link from "next/link";
import { Building2 } from "lucide-react";
import { createBusinessAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listBusinesses } from "@/services/social";
import { userBusinesses } from "@/services/business";
import { projectsForBusiness } from "@/services/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Businesses" };

export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const mine = userBusinesses(user.id);
  const directory = listBusinesses("").slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Business accounts"
        description="Represent an organisation, publish project stories, manage a team and see platform analytics for your projects."
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <div className="border-b border-navy-100 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Organisations you belong to</h2>
            </div>
            <ul className="divide-y divide-navy-100">
              {mine.map((entry) => {
                const projects = projectsForBusiness(entry.business.id);
                return (
                  <li key={entry.business.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <Link href={`/business/${entry.business.id}`} className="text-[13px] font-semibold text-navy-900 hover:underline">
                        {entry.business.name}
                      </Link>
                      <p className="text-[11px] text-navy-500">
                        {entry.business.industry ?? "No industry set"} · {projects.length} project
                        {projects.length === 1 ? "" : "s"} · your role: {entry.role.replace(/_/g, " ")}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-navy-400">Created {formatDate(entry.business.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={entry.business.visibility === "public" ? "success" : "neutral"}>{entry.business.visibility}</Badge>
                      <ButtonLink href={`/business/${entry.business.id}`} size="sm" variant="secondary">
                        Open
                      </ButtonLink>
                    </div>
                  </li>
                );
              })}
              {mine.length === 0 ? (
                <li className="p-5">
                  <EmptyState
                    title="No business account yet"
                    description="Create one to attach projects to an organisation and invite teammates."
                  />
                </li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <div className="border-b border-navy-100 px-5 py-3.5">
              <h2 className="text-[13px] font-semibold text-navy-900">Public business directory</h2>
            </div>
            <ul className="grid gap-2 p-4 sm:grid-cols-2">
              {directory.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/business/${entry.id}`}
                    className="flex items-start gap-2 rounded-lg border border-navy-200 p-2.5 hover:border-navy-300"
                  >
                    <Building2 size={14} className="mt-0.5 text-navy-400" aria-hidden="true" />
                    <span>
                      <span className="block text-[12px] font-medium text-navy-900">{entry.name}</span>
                      <span className="block text-[10.5px] text-navy-500">{entry.industry ?? "Organisation"}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {directory.length === 0 ? <li className="text-[12px] text-navy-500">No public business profiles yet.</li> : null}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-navy-900">Create a business account</h2>
            <form action={createBusinessAction} className="mt-2 space-y-3">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required maxLength={120} />
              </Field>
              <Field label="Description" htmlFor="description">
                <Textarea id="description" name="description" rows={3} maxLength={2000} />
              </Field>
              <Field label="Industry" htmlFor="industry">
                <Input id="industry" name="industry" maxLength={80} placeholder="Civic technology" />
              </Field>
              <Field label="Website" htmlFor="website">
                <Input id="website" name="website" type="url" placeholder="https://example.com" />
              </Field>
              <Field label="Visibility" htmlFor="visibility" hint="Private organisations are only visible to their team.">
                <Select id="visibility" name="visibility" defaultValue="public">
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </Select>
              </Field>
              <SubmitButton className="w-full" pendingLabel="Creating…">
                Create organisation
              </SubmitButton>
            </form>
          </Card>

          <Alert tone="info" title="What business analytics are">
            Views, follows and interest requests recorded by this platform. They are not externally audited commercial results
            and should not be presented as such.
          </Alert>
        </aside>
      </div>
    </div>
  );
}
