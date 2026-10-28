import Link from "next/link";
import { createTeachingAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { projectsForUser } from "@/services/projects";
import { RESOURCE_FORMATS, RESOURCE_LEVELS, label } from "@/lib/types";

export const metadata = { title: "New teaching" };

export default async function NewTeachingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const { owned, contributed } = projectsForUser(user.id);
  const projectOptions = [...owned, ...contributed];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Create"
        title="New teaching"
        description="Turn something you know into a tutorial, guide or explainer. Published teaching appears in Learning and on your profile."
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can save this as a draft; publishing needs a verified email address.
          </Alert>
        </div>
      ) : null}

      <Card className="p-5">
        <form action={createTeachingAction} encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="returnTo" value="/create/teaching" />

          <Field label="Title" htmlFor="title" required>
            <Input id="title" name="title" required maxLength={160} placeholder="Reading a river gauge in ten minutes" />
          </Field>

          <Field label="Summary" htmlFor="summary" hint="One or two sentences shown in Learning cards.">
            <Textarea id="summary" name="summary" rows={2} maxLength={400} />
          </Field>

          <Field label="Main content" htmlFor="body" hint="Plain text or Markdown. Keep confidential project material out of public teaching.">
            <Textarea id="body" name="body" rows={12} maxLength={20000} />
          </Field>

          <Field
            label="Learning objectives and key takeaways"
            htmlFor="outcomes"
            hint="Optional. One per line, each starting with a verb: Explain…, Build…, Choose…. They appear at the top of the published teaching."
          >
            <Textarea
              id="outcomes"
              name="outcomes"
              rows={4}
              maxLength={1200}
              placeholder={"Explain how a river gauge measures flow\nChoose the right sensor for a field site"}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Topic" htmlFor="topic" hint="Optional. Free text.">
              <Input id="topic" name="topic" maxLength={60} placeholder="Hydrology" />
            </Field>
            <Field label="Format" htmlFor="format">
              <Select id="format" name="format" defaultValue="article">
                {RESOURCE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {label(format)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Level" htmlFor="level">
              <Select id="level" name="level" defaultValue="beginner">
                {RESOURCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {label(level)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minutes" htmlFor="durationMinutes">
              <Input id="durationMinutes" name="durationMinutes" type="number" min={0} max={600} defaultValue={10} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link a project" htmlFor="projectId" hint="Optional. The teaching will credit the project.">
              <Select id="projectId" name="projectId" defaultValue="">
                <option value="">Standalone</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cover image" htmlFor="cover" hint="PNG, JPEG or WebP.">
              <Input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-200 pt-4">
            <SubmitButton name="publish" value="on" pendingLabel="Publishing…">
              Publish teaching
            </SubmitButton>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <Link href="/create" className="text-[12px] text-navy-500 underline">
              Cancel
            </Link>
          </div>
          <p className="text-[10.5px] leading-4 text-navy-400">
            Teachings are free to read. Paid products remain in the creator studio and are not part of this flow.
          </p>
        </form>
      </Card>
    </div>
  );
}
