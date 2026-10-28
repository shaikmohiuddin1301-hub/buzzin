import Link from "next/link";
import { createUpdateAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { projectsForUser } from "@/services/projects";

export const metadata = { title: "Share an update" };

export default async function NewUpdatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const editable = projectsForUser(user.id).owned;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="Share an update"
        description="Progress, a milestone or an announcement. Attach it to a project you lead and it appears in that project's updates."
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can save a draft now. Publishing an update needs a verified email address.
          </Alert>
        </div>
      ) : null}

      <Card className="p-5">
        <form action={createUpdateAction} className="space-y-4">
          <Field label="Project" htmlFor="projectId" hint="Leave empty to post this on your profile only.">
            <Select id="projectId" name="projectId" defaultValue="">
              <option value="">My profile</option>
              {editable.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Update title" htmlFor="title" required hint="A short heading: “The first enclosure is waterproof”.">
            <Input id="title" name="title" required minLength={3} maxLength={140} placeholder="First prototype assembled" />
          </Field>

          <Field label="Update" htmlFor="body" required hint="What changed, what you learned, what is next.">
            <Textarea id="body" name="body" rows={6} required minLength={10} maxLength={5000} placeholder="We assembled the first prototype and recorded a week of readings." />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Progress" htmlFor="progressPercent" hint="Optional. 0–100.">
              <Input id="progressPercent" name="progressPercent" type="number" min={0} max={100} step={1} placeholder="40" />
            </Field>
            <Field label="Milestone" htmlFor="milestone" hint="Optional. Which milestone this reports on.">
              <Input id="milestone" name="milestone" maxLength={140} placeholder="Working prototype" />
            </Field>
            <Field label="Supporting link" htmlFor="linkUrl" hint="Optional. Sources, photos or notes.">
              <Input id="linkUrl" name="linkUrl" type="url" placeholder="https://…" />
            </Field>
          </div>

          <Field label="Who can see it" htmlFor="visibility" hint="Private updates stay inside the project team, or with you on a profile update.">
            <Select id="visibility" name="visibility" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Project team / only me</option>
            </Select>
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-200 pt-4">
            <SubmitButton name="publish" value="on" pendingLabel="Sharing…">
              Publish update
            </SubmitButton>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <Link href="/home" className="text-[12px] text-navy-500 underline">
              Cancel
            </Link>
          </div>

          <p className="text-[10.5px] leading-4 text-navy-400">
            A project update is filed in the project&apos;s Updates tab. A profile update appears on your profile and, when
            public, in the feed. Drafts are visible only to you and the project team.
          </p>
        </form>
      </Card>
    </div>
  );
}
