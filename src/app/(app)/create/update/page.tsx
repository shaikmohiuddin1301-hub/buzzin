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
            Updates go through the same verification as other published content.
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

          <Field label="Title" htmlFor="title" hint="Required for a project update; used as the update heading.">
            <Input id="title" name="title" maxLength={140} placeholder="First prototype assembled" />
          </Field>

          <Field label="Update" htmlFor="body" required>
            <Textarea id="body" name="body" rows={6} required maxLength={5000} placeholder="What changed, what you learned, what is next." />
          </Field>

          <Field label="Who can see it" htmlFor="visibility" hint="Private updates stay inside the project team.">
            <Select id="visibility" name="visibility" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Project team / only me</option>
            </Select>
          </Field>

          <div className="border-t border-navy-100 pt-4">
            <SubmitButton name="publish" value="on" pendingLabel="Sharing…">
              Share update
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
