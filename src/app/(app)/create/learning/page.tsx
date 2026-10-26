import Link from "next/link";
import { createReflectionAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Checkbox, Field, Flash, PageHeader, Select, Textarea } from "@/components/ui";
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
        description="A reflection on something you built, read or tried. It can stay a private note, or become a public post."
      />

      <Flash error={error} notice={notice} />

      <Card className="p-5">
        <form action={createReflectionAction} className="space-y-4">
          <Field label="What did you learn?" htmlFor="body" required hint="Concrete and specific beats a summary of the resource.">
            <Textarea
              id="body"
              name="body"
              rows={7}
              required
              maxLength={5000}
              placeholder="I assumed the sensor would drift with temperature, but the first two weeks showed the bigger error came from the enclosure."
            />
          </Field>

          <Field label="Related learning" htmlFor="resourceId" hint="Optional. Links your reflection to the material it came from.">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who can see this" htmlFor="visibility" hint="Private reflections never appear in the feed.">
              <Select id="visibility" name="visibility" defaultValue="public">
                <option value="public">Public</option>
                <option value="private">Only me</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <SubmitButton name="publish" value="on" className="w-full" pendingLabel="Sharing…">
                Share reflection
              </SubmitButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-3">
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save as draft
            </SubmitButton>
            <Link href="/settings?tab=privacy" className="text-[11.5px] text-navy-500 underline">
              Learning history is {shares ? "shown on your profile" : "private by default"}
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-4">
        <Alert tone="info" title="Your completed learning stays private unless you opt in">
          Sharing a reflection publishes only what you write here. Your full learning history is controlled separately in
          Settings → Privacy.
        </Alert>
      </div>
    </div>
  );
}
