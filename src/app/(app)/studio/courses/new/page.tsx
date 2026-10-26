import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { createCourseAction } from "@/app/actions/courses";
import { SubmitButton } from "@/components/client/submit-button";
import { Alert, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { COURSE_CATEGORIES, COURSE_VISIBILITIES, RESOURCE_LEVELS, label } from "@/lib/types";
import { projectsForUser } from "@/services/projects";

export const metadata = { title: "New course" };

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const projects = projectsForUser(user.id);
  const projectOptions = [...projects.owned, ...projects.contributed];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/studio?tab=courses" className="mb-3 inline-flex items-center gap-1 text-[12px] text-navy-500 hover:underline">
        <ArrowLeft size={12} aria-hidden="true" /> Back to your courses
      </Link>

      <PageHeader
        eyebrow="Creator studio"
        title="Create a course"
        description="Start with the promise: what will someone be able to do after finishing? You can save a draft now and build the modules next."
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Verify your email before publishing">
            You can build and preview the course now. Publishing needs a verified email address.
          </Alert>
        </div>
      ) : null}

      <Card className="p-5">
        <form action={createCourseAction} encType="multipart/form-data" className="space-y-5">
          <Field label="Course title" htmlFor="title" required hint="Be specific about the outcome, not the topic.">
            <Input id="title" name="title" required minLength={4} maxLength={160} placeholder="Build and publish your first data dashboard" />
          </Field>

          <Field
            label="Short description"
            htmlFor="summary"
            hint="One or two sentences shown on course cards. You can change it later."
          >
            <Textarea id="summary" name="summary" rows={2} maxLength={600} />
          </Field>

          <Field
            label="Full description"
            htmlFor="body"
            hint="Optional. What the course covers, how it is structured and what learners need before starting."
          >
            <Textarea id="body" name="body" rows={6} maxLength={20000} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" htmlFor="category">
              <Select id="category" name="category" defaultValue="">
                <option value="">No category</option>
                {COURSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {label(category)}
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
            <Field label="Estimated minutes" htmlFor="estimatedMinutes" hint="Optional">
              <Input id="estimatedMinutes" name="estimatedMinutes" type="number" min={1} max={10000} />
            </Field>
          </div>

          <Field
            label="Skills taught"
            htmlFor="skills"
            hint="Comma-separated. These are course skills, not a claim of professional certification."
          >
            <Input id="skills" name="skills" maxLength={400} placeholder="Data modelling, SQL, Dashboard design" />
          </Field>

          <Field
            label="Learning outcomes"
            htmlFor="outcomes"
            hint="One per line. Start each with a verb: “Build…”, “Explain…”, “Debug…”. Optional while drafting."
          >
            <Textarea id="outcomes" name="outcomes" rows={4} maxLength={2000} />
          </Field>

          <Field label="Who is this for?" htmlFor="audience" hint="Optional. Prior knowledge, role or context helps people decide.">
            <Textarea id="audience" name="audience" rows={2} maxLength={400} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Visibility"
              htmlFor="visibility"
              hint="Public is listed in Learning; link-only is shareable but unlisted; private is for you and co-editors."
            >
              <Select id="visibility" name="visibility" defaultValue="public">
                {COURSE_VISIBILITIES.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {visibility === "invite_only" ? "Link only (unlisted)" : label(visibility)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link a practice project" htmlFor="projectId" hint="Optional. Learners can practise the skills in a real project.">
              <Select id="projectId" name="projectId" defaultValue="">
                <option value="">No project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cover image" htmlFor="cover" hint="PNG, JPEG, WebP or GIF.">
              <Input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </Field>
            <Field label="Preview video link" htmlFor="previewVideoUrl" hint="Optional YouTube, Vimeo or Instagram link. It stays on the original platform.">
              <Input id="previewVideoUrl" name="previewVideoUrl" type="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" />
            </Field>
          </div>

          <Field
            label="Attribution"
            htmlFor="attribution"
            hint="Credit anyone whose material you reference or teach alongside. This is never used to imply you own external videos."
          >
            <Textarea id="attribution" name="attribution" rows={2} maxLength={600} placeholder="Course notes adapted from… with permission. External videos remain the property of their creators." />
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
            <SubmitButton pendingLabel="Creating…">
              <BookOpen size={15} aria-hidden="true" /> Create course draft
            </SubmitButton>
            <p className="text-[11px] leading-5 text-navy-500">
              Courses are free in this build. Payments are not enabled and no price is shown.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
