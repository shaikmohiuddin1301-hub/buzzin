import Link from "next/link";
import { createPostAction } from "@/app/actions/social";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { projectsForUser } from "@/services/projects";

export const metadata = { title: "New post" };

export default async function NewPostPage({
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
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="New post"
        description="One image and a caption is enough. Posts appear on your profile and, when public, in the feed."
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email to publish">
            You can save a draft now. Publishing requires a verified email address.
          </Alert>
        </div>
      ) : null}

      <Card className="p-5">
        <form action={createPostAction} encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="returnTo" value={`/u/${user.username}?tab=posts`} />
          <input type="hidden" name="kind" value="general" />

          <Field label="Caption" htmlFor="body" required hint="What is this, and what should people notice?">
            <Textarea id="body" name="body" rows={5} required maxLength={5000} placeholder="The first working prototype of the sensor housing." />
          </Field>

          <Field label="Photo" htmlFor="image" hint="PNG, JPEG or WebP. One image per post for now; carousels are not supported yet.">
            <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
          </Field>

          <Field label="Alt text" htmlFor="altText" hint="Describe the image for people who cannot see it.">
            <Input id="altText" name="altText" maxLength={400} placeholder="A grey sensor housing on a workbench next to a laptop." />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link a project" htmlFor="projectId" hint="Optional. The post will link to it.">
              <Select id="projectId" name="projectId" defaultValue="">
                <option value="">No project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Who can see it" htmlFor="visibility">
              <Select id="visibility" name="visibility" defaultValue="public">
                <option value="public">Public — appears in the feed</option>
                <option value="private">Only me</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
            <SubmitButton name="publish" value="on" pendingLabel="Publishing…">
              Publish post
            </SubmitButton>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <Link href={`/u/${user.username}?tab=posts`} className="text-[12px] text-navy-500 underline">
              Cancel
            </Link>
          </div>
          <p className="text-[10.5px] leading-4 text-navy-400">
            Drafts are visible only to you. Posts stay editable by deleting and reposting until an edit history exists.
          </p>
        </form>
      </Card>
    </div>
  );
}
