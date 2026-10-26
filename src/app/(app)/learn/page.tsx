import Link from "next/link";
import { ResourceCard, StoryCard } from "@/components/cards";
import { Reveal } from "@/components/client/reveal";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Progress,
  Select,
  Stat,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { learningTopics, listResources, myLearning } from "@/services/learning";
import { publishedStories } from "@/services/stories";
import { entitlementsForUser } from "@/services/commerce";
import { RESOURCE_FORMATS, RESOURCE_LEVELS, label } from "@/lib/types";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Learn" };

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();

  const q = typeof query.q === "string" ? query.q : "";
  const format = typeof query.format === "string" ? query.format : "";
  const level = typeof query.level === "string" ? query.level : "";
  const price = typeof query.price === "string" ? (query.price as "free" | "paid") : undefined;
  const topic = typeof query.topic === "string" ? query.topic : "";

  const resources = listResources({ q, format, level, price, topic, limit: 30 });
  const courses = listResources({ format: "course", limit: 4 });
  const topics = learningTopics();
  const stories = publishedStories(3);
  const learning = myLearning(user.id);
  const entitlements = entitlementsForUser(user.id);

  return (
    <div>
      <PageHeader
        title="Learning centre"
        description="Practical material built from real project work: what was tried, what failed, and what it cost. Sources are linked."
        actions={
          <>
            <ButtonLink href="/explore?tab=learning" variant="secondary" size="sm">
              Explore view
            </ButtonLink>
            <ButtonLink href="/studio" size="sm">
              Publish material
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="In progress" value={learning.inProgress.length} hint="Resources you have started" />
        <Stat label="Access granted" value={entitlements.length} hint="Premium access (no payment taken)" />
        <Stat label="Published resources" value={resources.length} hint="Matching current filters" />
        <Stat label="Free previews" value="Required" hint="Every paid resource has a free sample" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <Card className="mb-4 p-4">
            <form action="/learn" className="grid gap-2 sm:grid-cols-5">
              <Field label="Search" htmlFor="learn-q" className="sm:col-span-2">
                <Input id="learn-q" name="q" defaultValue={q} placeholder="Topic, title or skill" />
              </Field>
              <Field label="Format" htmlFor="learn-format">
                <Select id="learn-format" name="format" defaultValue={format}>
                  <option value="">Any</option>
                  {RESOURCE_FORMATS.map((item) => (
                    <option key={item} value={item}>{label(item)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Level" htmlFor="learn-level">
                <Select id="learn-level" name="level" defaultValue={level}>
                  <option value="">Any</option>
                  {RESOURCE_LEVELS.map((item) => (
                    <option key={item} value={item}>{label(item)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Price" htmlFor="learn-price">
                <Select id="learn-price" name="price" defaultValue={price ?? ""}>
                  <option value="">All</option>
                  <option value="free">Free</option>
                  <option value="paid">Premium</option>
                </Select>
              </Field>
              <div className="sm:col-span-5">
                <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-700">
                  Apply
                </button>
              </div>
            </form>
            {topics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-navy-100 pt-3">
                <Link href="/learn" className="rounded-md bg-navy-100 px-2 py-1 text-[11px] font-medium text-navy-700">
                  All topics
                </Link>
                {topics.map((item) => (
                  <Link
                    key={item.topic}
                    href={`/learn?topic=${encodeURIComponent(item.topic)}`}
                    className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                      topic === item.topic ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-700 hover:bg-navy-100"
                    }`}
                  >
                    {item.topic} ({item.count})
                  </Link>
                ))}
              </div>
            ) : null}
          </Card>

          {resources.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              description="Try a different topic or clear the filters. New material appears as creators publish from completed work."
            />
          ) : (
            <div className="grid gap-3">
              {resources.map((resource, index) => (
                <Reveal key={resource.id} delay={Math.min(index * 45, 180)}>
                  <ResourceCard resource={resource} />
                </Reveal>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Structured courses</h2>
            {courses.length === 0 ? (
              <p className="mt-1.5 text-[11.5px] text-navy-500">No published courses yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {courses.map((course) => (
                  <li key={course.id}>
                    <Link href={`/learn/${course.id}`} className="text-[12px] font-medium text-navy-900 hover:underline">
                      {course.title}
                    </Link>
                    <p className="text-[10px] text-navy-400">
                      {course.creatorName} · {label(course.level)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/courses" className="mt-2 inline-block text-[10.5px] font-medium text-brand-700 hover:underline">
              Public course catalogue →
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Continue learning</h2>
            {learning.inProgress.length === 0 ? (
              <p className="mt-1.5 text-[11.5px] text-navy-500">Nothing started yet. Mark a lesson complete to track progress.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {learning.inProgress.slice(0, 5).map((item) => (
                  <li key={item.resource.id}>
                    <Link href={`/learn/${item.resource.id}`} className="text-[12px] font-medium text-navy-900 hover:underline">
                      {item.resource.title}
                    </Link>
                    <Progress value={item.pct} label={`${item.pct}% · updated ${relativeTime(item.updatedAt)}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Animated stories</h2>
            <div className="mt-2 space-y-2">
              {stories.map((story) => (
                <StoryCard key={story.board.id} board={story.board} projectName={story.projectName} />
              ))}
              {stories.length === 0 ? <p className="text-[11.5px] text-navy-500">No published stories yet.</p> : null}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Your access</h2>
            {entitlements.length === 0 ? (
              <p className="mt-1.5 text-[11.5px] leading-5 text-navy-500">
                No premium access yet. Payments are disabled in this build; creators grant access directly.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {entitlements.slice(0, 5).map((row) => (
                  <li key={row.entitlement.id}>
                    <Link href={`/learn/${row.resource.id}`} className="text-[11.5px] font-medium text-brand-700 hover:underline">
                      {row.resource.title}
                    </Link>
                    <p className="text-[10px] text-navy-400">granted {relativeTime(row.entitlement.grantedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="rounded-lg border border-navy-200 bg-surface p-3">
            <p className="text-[10.5px] leading-4 text-navy-500">
              Media has captions and transcripts where the creator supplied them. No audio autoplays. Progress and feedback are
              visible only to you and the creator.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
