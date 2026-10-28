import Link from "next/link";
import { createReflectionAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { listResources } from "@/services/learning";
import { sharesLearningHistory } from "@/services/profileContent";

export const metadata = { title: "Share a learning" };

export default async function NewLearningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const resources = listResources({ limit: 50 });
  const shares = sharesLearningHistory(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Create"
        title="Share a learning"
        description="Something you worked out, read or tried. It can stay a private note, or become a public entry in the learning feed."
      />

      <Flash error={error} notice={notice} />

      <Card className="p-5">
        <form action={createReflectionAction} encType="multipart/form-data" className="space-y-4">
          <Field label="Learning title" htmlFor="title" required hint="Name the lesson, not the topic: “Why our sensor drifted in the cold”.">
            <Input id="title" name="title" required minLength={3} maxLength={140} placeholder="Why our first sensor enclosure drifted" />
          </Field>

          <Field label="What did you learn?" htmlFor="body" required hint="Concrete and specific beats a summary of the resource.">
            <Textarea
              id="body"
              name="body"
              rows={6}
              required
              maxLength={3500}
              placeholder="I assumed the sensor would drift with temperature, but two weeks of readings showed the bigger error came from the enclosure."
            />
          </Field>

          <Field
            label="Explanation and key takeaways"
            htmlFor="takeaways"
            hint="Optional. What you tried, what surprised you, and what someone else should do differently."
          >
            <Textarea id="takeaways" name="takeaways" rows={5} maxLength={1500} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Topic" htmlFor="topic" hint="Optional. Free text, so it can match how people search.">
              <Input id="topic" name="topic" maxLength={80} placeholder="Sensor calibration" />
            </Field>
            <Field label="Supporting link" htmlFor="linkUrl" hint="Optional. A design note, a dataset or a source.">
              <Input id="linkUrl" name="linkUrl" type="url" placeholder="https://…" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supporting image" htmlFor="image" hint="Optional. PNG, JPEG or WebP.">
              <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
            </Field>
            <Field label="Image description" htmlFor="altText" hint="Describe the image for people who cannot see it.">
              <Input id="altText" name="altText" maxLength={400} placeholder="A sensor board on a workbench with a readings chart." />
            </Field>
          </div>

          <Field label="Related learning" htmlFor="resourceId" hint="Optional. Links your entry to the material it came from.">
            <Select id="resourceId" name="resourceId" defaultValue="">
              <option value="">No specific resource</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                </option>
              ))}
            </Select>
          </Field>

          <Checkbox
            name="markCompleted"
            label="I completed this learning"
            description="Only tick this if you actually finished it. Completion is recorded from your confirmation, not inferred from opening a page."
          />

          <Field label="Who can see this" htmlFor="visibility" hint="Private entries never appear in the feed or on your profile for others.">
            <Select id="visibility" name="visibility" defaultValue="public">
              <option value="public">Public</option>
              <option value="private">Only me</option>
            </Select>
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-200 pt-4">
            <SubmitButton name="publish" value="on" pendingLabel="Sharing…">
              Publish learning
            </SubmitButton>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <Link href={`/u/${user.username}?tab=posts`} className="text-[12px] text-navy-500 underline">
              Cancel
            </Link>
          </div>

          <p className="text-[10.5px] leading-4 text-navy-400">
            Only what you write here is published. Your full learning history is controlled separately in Settings →
            Privacy ({shares ? "currently shown on your profile" : "private by default"}).
          </p>
        </form>
      </Card>

      <div className="mt-4">
        <Alert tone="info" title="A learning entry is a post">
          It appears on your profile and, when public, in the learning feed. Drafts are visible only to you.
        </Alert>
      </div>
    </div>
  );
}
