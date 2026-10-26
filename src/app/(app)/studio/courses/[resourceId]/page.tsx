import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Link2,
  Plus,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import {
  addCollaboratorAction,
  addLessonAction,
  addModuleAction,
  moveLessonAction,
  moveModuleAction,
  removeCollaboratorAction,
  removeLessonAction,
  removeModuleAction,
  setCourseStatusAction,
  updateCourseAction,
  updateLessonAction,
  updateModuleAction,
} from "@/app/actions/courses";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getMedia } from "@/lib/storage";
import { COURSE_CATEGORIES, COURSE_VISIBILITIES, RESOURCE_LEVELS, label } from "@/lib/types";
import { courseEditorData } from "@/services/learning";
import { projectsForUser } from "@/services/projects";

export const dynamic = "force-dynamic";

export default async function CourseBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { resourceId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const data = courseEditorData(resourceId, user);
  if (!data || !data.course) notFound();

  const { resource, course, curriculum, exercises, collaborators, stats, isOwner } = data;
  const projects = projectsForUser(user.id);
  const projectOptions = [...projects.owned, ...projects.contributed];
  const exerciseFor = new Map(exercises.map((exercise) => [exercise.lessonId, exercise]));
  const lessonCount = curriculum.reduce((sum, module) => sum + module.lessons.length, 0);

  return (
    <div>
      <Link href="/studio?tab=courses" className="mb-3 inline-flex items-center gap-1 text-[12px] text-navy-500 hover:underline">
        <ArrowLeft size={12} aria-hidden="true" /> All courses
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Course builder</Badge>
            <StatusBadge status={resource.status} />
            <Badge tone={course.visibility === "public" ? "success" : course.visibility === "private" ? "warning" : "neutral"}>
              {course.visibility === "invite_only" ? "Link only" : label(course.visibility)}
            </Badge>
          </span>
        }
        title={resource.title}
        description={resource.summary ?? "Add a short description so learners know what this course is for."}
        meta={
          <>
            <span>{curriculum.length} modules</span>
            <span>{lessonCount} lessons</span>
            <span>Updated {formatDate(resource.updatedAt)}</span>
            <Link href={`/learn/${resource.id}`} className="font-medium text-brand-700 hover:underline">
              Learner view →
            </Link>
          </>
        }
        actions={
          <>
            <ButtonLink href={`/learn/${resource.id}`} variant="secondary" size="sm">
              <Eye size={14} aria-hidden="true" /> Preview
            </ButtonLink>
            {resource.status === "published" ? (
              <>
                <ButtonLink href={`/courses/${resource.id}`} variant="ghost" size="sm">
                  <ExternalLink size={13} aria-hidden="true" /> Public page
                </ButtonLink>
                <form action={setCourseStatusAction}>
                  <input type="hidden" name="resourceId" value={resource.id} />
                  <input type="hidden" name="status" value="unpublished" />
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Unpublishing…">
                    Unpublish
                  </SubmitButton>
                </form>
              </>
            ) : (
              <form action={setCourseStatusAction}>
                <input type="hidden" name="resourceId" value={resource.id} />
                <input type="hidden" name="status" value="published" />
                <SubmitButton size="sm" pendingLabel="Publishing…" disabled={!user.emailVerifiedAt}>
                  <CheckCircle2 size={14} aria-hidden="true" /> Publish
                </SubmitButton>
              </form>
            )}
            {isOwner && resource.status !== "archived" ? (
              <form action={setCourseStatusAction}>
                <input type="hidden" name="resourceId" value={resource.id} />
                <input type="hidden" name="status" value="archived" />
                <SubmitButton size="sm" variant="ghost" pendingLabel="Archiving…">
                  Archive
                </SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <Flash error={error} notice={notice} />

      {!user.emailVerifiedAt ? (
        <div className="mb-4">
          <Alert tone="warning" title="Publishing needs a verified email">
            You can keep editing and previewing; verification is only required when you publish.
          </Alert>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Enrolled learners" value={stats.learners} hint="Persisted enrolments" />
        <Stat label="Completed" value={stats.completions} hint={`${stats.averagePct}% average progress`} />
        <Stat label="Lessons" value={lessonCount} hint={`${curriculum.length} modules`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Course outline"
              description="Ordered modules and lessons. Use the arrows to reorder; keyboards and screen readers get the same controls."
              action={
                <Badge tone={lessonCount > 0 ? "success" : "warning"}>
                  {lessonCount > 0 ? "Ready to publish" : "Add a lesson first"}
                </Badge>
              }
            />
            {curriculum.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<BookOpen size={22} aria-hidden="true" />}
                  title="No modules yet"
                  description="A course is a sequence of modules, each containing lessons. Start with one module and one lesson."
                />
              </div>
            ) : (
              <div className="divide-y divide-navy-100">
                {curriculum.map((module, moduleIndex) => (
                  <section key={module.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-brand-700">Module {moduleIndex + 1}</p>
                        <h3 className="mt-0.5 text-[14px] font-semibold text-navy-950">{module.title}</h3>
                        {module.description ? <p className="mt-1 text-[12px] leading-5 text-navy-500">{module.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <form action={moveModuleAction}>
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <input type="hidden" name="moduleId" value={module.id} />
                          <input type="hidden" name="direction" value="up" />
                          <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Move ${module.title} up`}>
                            <ArrowUp size={13} aria-hidden="true" />
                          </SubmitButton>
                        </form>
                        <form action={moveModuleAction}>
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <input type="hidden" name="moduleId" value={module.id} />
                          <input type="hidden" name="direction" value="down" />
                          <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Move ${module.title} down`}>
                            <ArrowDown size={13} aria-hidden="true" />
                          </SubmitButton>
                        </form>
                        <form action={removeModuleAction}>
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <input type="hidden" name="moduleId" value={module.id} />
                          <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Remove ${module.title}`}>
                            <Trash2 size={13} aria-hidden="true" />
                          </SubmitButton>
                        </form>
                      </div>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11.5px] font-medium text-brand-700 hover:underline">
                        Edit module details
                      </summary>
                      <form action={updateModuleAction} className="mt-3 space-y-3 rounded-lg border border-navy-100 p-3">
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <input type="hidden" name="moduleId" value={module.id} />
                        <Field label="Module title" htmlFor={`module-title-${module.id}`}>
                          <Input id={`module-title-${module.id}`} name="title" defaultValue={module.title} required maxLength={160} />
                        </Field>
                        <Field label="Module description" htmlFor={`module-desc-${module.id}`}>
                          <Textarea id={`module-desc-${module.id}`} name="description" rows={2} defaultValue={module.description ?? ""} maxLength={600} />
                        </Field>
                        <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
                          Save module
                        </SubmitButton>
                      </form>
                    </details>

                    <ul className="mt-3 space-y-2">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const exercise = exerciseFor.get(lesson.id);
                        const media = lesson.mediaId ? getMedia(lesson.mediaId) : null;
                        return (
                          <li key={lesson.id} className="rounded-xl border border-navy-100 bg-navy-50/30 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10.5px] font-semibold text-navy-400">{moduleIndex + 1}.{lessonIndex + 1}</span>
                                  <p className="text-[12.5px] font-semibold text-navy-900">{lesson.title}</p>
                                  {lesson.isFreePreview ? <Badge tone="success">Free preview</Badge> : null}
                                  {lesson.videoUrl ? (
                                    <Badge tone="neutral">
                                      <Video size={10} aria-hidden="true" /> Video link
                                    </Badge>
                                  ) : null}
                                  {lesson.externalUrl ? (
                                    <Badge tone="neutral">
                                      <Link2 size={10} aria-hidden="true" /> Resource
                                    </Badge>
                                  ) : null}
                                  {lesson.durationMinutes ? (
                                    <span className="inline-flex items-center gap-1 text-[10.5px] text-navy-400">
                                      <Clock size={10} aria-hidden="true" /> {lesson.durationMinutes} min
                                    </span>
                                  ) : null}
                                </div>
                                {lesson.body ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-[11.5px] leading-5 text-navy-500">{lesson.body}</p> : null}
                                <p className="mt-1 text-[10.5px] text-navy-400">
                                  {[media ? `Uploaded: ${media.filename}` : null, exercise ? "Exercise included" : null, lesson.projectId ? "Project practice linked" : null]
                                    .filter(Boolean)
                                    .join(" · ") || "No media or exercise yet"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <form action={moveLessonAction}>
                                  <input type="hidden" name="resourceId" value={resource.id} />
                                  <input type="hidden" name="lessonId" value={lesson.id} />
                                  <input type="hidden" name="direction" value="up" />
                                  <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Move ${lesson.title} up`}>
                                    <ArrowUp size={12} aria-hidden="true" />
                                  </SubmitButton>
                                </form>
                                <form action={moveLessonAction}>
                                  <input type="hidden" name="resourceId" value={resource.id} />
                                  <input type="hidden" name="lessonId" value={lesson.id} />
                                  <input type="hidden" name="direction" value="down" />
                                  <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Move ${lesson.title} down`}>
                                    <ArrowDown size={12} aria-hidden="true" />
                                  </SubmitButton>
                                </form>
                                <form action={removeLessonAction}>
                                  <input type="hidden" name="resourceId" value={resource.id} />
                                  <input type="hidden" name="lessonId" value={lesson.id} />
                                  <SubmitButton size="sm" variant="ghost" pendingLabel="…" aria-label={`Remove ${lesson.title}`}>
                                    <Trash2 size={12} aria-hidden="true" />
                                  </SubmitButton>
                                </form>
                              </div>
                            </div>

                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11.5px] font-medium text-brand-700 hover:underline">
                                Edit lesson
                              </summary>
                              <form action={updateLessonAction} encType="multipart/form-data" className="mt-3 space-y-3 rounded-lg border border-navy-100 bg-surface p-3">
                                <input type="hidden" name="resourceId" value={resource.id} />
                                <input type="hidden" name="lessonId" value={lesson.id} />
                                <Field label="Lesson title" htmlFor={`lesson-title-${lesson.id}`}>
                                  <Input id={`lesson-title-${lesson.id}`} name="title" defaultValue={lesson.title} required maxLength={160} />
                                </Field>
                                <Field label="Lesson content" htmlFor={`lesson-body-${lesson.id}`} hint="Original explanation in plain text or Markdown-style formatting.">
                                  <Textarea id={`lesson-body-${lesson.id}`} name="body" rows={8} defaultValue={lesson.body ?? ""} maxLength={12000} />
                                </Field>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Duration (minutes)" htmlFor={`lesson-minutes-${lesson.id}`}>
                                    <Input id={`lesson-minutes-${lesson.id}`} name="durationMinutes" type="number" min={1} max={1000} defaultValue={lesson.durationMinutes ?? ""} />
                                  </Field>
                                  <label className="flex items-center gap-2 pt-7 text-[12px] text-navy-700">
                                    <input type="checkbox" name="isFreePreview" defaultChecked={lesson.isFreePreview} className="h-4 w-4 rounded border-navy-300 text-brand-600" />
                                    Free preview lesson
                                  </label>
                                </div>
                                <Field label="External video link" htmlFor={`lesson-video-${lesson.id}`} hint="YouTube embeds where allowed; Instagram and other links open on the original platform with attribution.">
                                  <Input id={`lesson-video-${lesson.id}`} name="videoUrl" type="url" defaultValue={lesson.videoUrl ?? ""} maxLength={500} />
                                </Field>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <Field label="Resource link" htmlFor={`lesson-external-${lesson.id}`}>
                                    <Input id={`lesson-external-${lesson.id}`} name="externalUrl" type="url" defaultValue={lesson.externalUrl ?? ""} maxLength={500} />
                                  </Field>
                                  <Field label="Link label" htmlFor={`lesson-external-label-${lesson.id}`}>
                                    <Input id={`lesson-external-label-${lesson.id}`} name="externalLabel" defaultValue={lesson.externalLabel ?? ""} maxLength={160} />
                                  </Field>
                                  <Field label="Original author" htmlFor={`lesson-external-author-${lesson.id}`}>
                                    <Input id={`lesson-external-author-${lesson.id}`} name="externalAuthor" defaultValue={lesson.externalAuthor ?? ""} maxLength={160} />
                                  </Field>
                                </div>
                                <Field label="Uploaded file" htmlFor={`lesson-file-${lesson.id}`} hint={media ? `Current: ${media.filename}. Uploading replaces it.` : "PDF, video, audio, text or image. Files are private and served only to authorised learners."}>
                                  <Input id={`lesson-file-${lesson.id}`} name="attachment" type="file" accept="application/pdf,text/plain,text/markdown,video/mp4,audio/mpeg,audio/webm,audio/wav,image/png,image/jpeg,image/webp" />
                                </Field>
                                {media ? (
                                  <label className="flex items-center gap-2 text-[11.5px] text-navy-600">
                                    <input type="checkbox" name="removeAttachment" className="h-4 w-4 rounded border-navy-300 text-brand-600" />
                                    Remove the current uploaded file
                                  </label>
                                ) : null}
                                <Field label="Practice project" htmlFor={`lesson-project-${lesson.id}`} hint="Optional. The learner is sent to the project, and its normal permissions still apply.">
                                  <Select id={`lesson-project-${lesson.id}`} name="projectId" defaultValue={lesson.projectId ?? ""}>
                                    <option value="">No project</option>
                                    {projectOptions.map((project) => (
                                      <option key={project.id} value={project.id}>
                                        {project.name}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                                <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Practical exercise</p>
                                  <div className="mt-2 space-y-3">
                                    <Field label="Exercise title" htmlFor={`lesson-ex-title-${lesson.id}`}>
                                      <Input id={`lesson-ex-title-${lesson.id}`} name="exerciseTitle" defaultValue={exercise?.title ?? ""} maxLength={160} placeholder="Practice" />
                                    </Field>
                                    <Field label="Instructions" htmlFor={`lesson-ex-instructions-${lesson.id}`}>
                                      <Textarea id={`lesson-ex-instructions-${lesson.id}`} name="exerciseInstructions" rows={3} defaultValue={exercise?.instructions ?? ""} maxLength={4000} />
                                    </Field>
                                    <Field label="Hint (optional)" htmlFor={`lesson-ex-hint-${lesson.id}`}>
                                      <Input id={`lesson-ex-hint-${lesson.id}`} name="exerciseHint" defaultValue={exercise?.hint ?? ""} maxLength={600} />
                                    </Field>
                                    <p className="text-[10.5px] text-navy-500">Clear the instructions to remove the exercise.</p>
                                  </div>
                                </div>
                                <SubmitButton size="sm" pendingLabel="Saving…">
                                  Save lesson
                                </SubmitButton>
                              </form>
                            </details>
                          </li>
                        );
                      })}
                    </ul>

                    <details className="mt-3">
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">
                        <Plus size={13} aria-hidden="true" /> Add a lesson
                      </summary>
                      <form action={addLessonAction} encType="multipart/form-data" className="mt-3 space-y-3 rounded-lg border border-dashed border-navy-200 p-3">
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <input type="hidden" name="moduleId" value={module.id} />
                        <Field label="Lesson title" htmlFor={`new-lesson-title-${module.id}`} required>
                          <Input id={`new-lesson-title-${module.id}`} name="title" required maxLength={160} />
                        </Field>
                        <Field label="Lesson content" htmlFor={`new-lesson-body-${module.id}`}>
                          <Textarea id={`new-lesson-body-${module.id}`} name="body" rows={5} maxLength={12000} />
                        </Field>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Duration (minutes)" htmlFor={`new-lesson-minutes-${module.id}`}>
                            <Input id={`new-lesson-minutes-${module.id}`} name="durationMinutes" type="number" min={1} max={1000} />
                          </Field>
                          <label className="flex items-center gap-2 pt-7 text-[12px] text-navy-700">
                            <input type="checkbox" name="isFreePreview" className="h-4 w-4 rounded border-navy-300 text-brand-600" />
                            Free preview
                          </label>
                          <Field label="External video" htmlFor={`new-lesson-video-${module.id}`}>
                            <Input id={`new-lesson-video-${module.id}`} name="videoUrl" type="url" maxLength={500} placeholder="YouTube/Instagram link" />
                          </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="Resource link" htmlFor={`new-lesson-external-${module.id}`}>
                            <Input id={`new-lesson-external-${module.id}`} name="externalUrl" type="url" maxLength={500} />
                          </Field>
                          <Field label="Link label" htmlFor={`new-lesson-external-label-${module.id}`}>
                            <Input id={`new-lesson-external-label-${module.id}`} name="externalLabel" maxLength={160} />
                          </Field>
                          <Field label="Original author" htmlFor={`new-lesson-external-author-${module.id}`}>
                            <Input id={`new-lesson-external-author-${module.id}`} name="externalAuthor" maxLength={160} />
                          </Field>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Upload a file" htmlFor={`new-lesson-file-${module.id}`} hint="PDF, video, audio, text or image">
                            <Input id={`new-lesson-file-${module.id}`} name="attachment" type="file" accept="application/pdf,text/plain,text/markdown,video/mp4,audio/mpeg,audio/webm,audio/wav,image/png,image/jpeg,image/webp" />
                          </Field>
                          <Field label="Practice project" htmlFor={`new-lesson-project-${module.id}`}>
                            <Select id={`new-lesson-project-${module.id}`} name="projectId" defaultValue="">
                              <option value="">No project</option>
                              {projectOptions.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Practical exercise</p>
                          <div className="mt-2 space-y-3">
                            <Field label="Exercise title" htmlFor={`new-lesson-ex-title-${module.id}`}>
                              <Input id={`new-lesson-ex-title-${module.id}`} name="exerciseTitle" maxLength={160} placeholder="Practice" />
                            </Field>
                            <Field label="Instructions" htmlFor={`new-lesson-ex-instructions-${module.id}`}>
                              <Textarea id={`new-lesson-ex-instructions-${module.id}`} name="exerciseInstructions" rows={3} maxLength={4000} />
                            </Field>
                            <Field label="Hint (optional)" htmlFor={`new-lesson-ex-hint-${module.id}`}>
                              <Input id={`new-lesson-ex-hint-${module.id}`} name="exerciseHint" maxLength={600} />
                            </Field>
                          </div>
                        </div>
                        <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">
                          Add lesson
                        </SubmitButton>
                      </form>
                    </details>
                  </section>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Course details" description="Everything except the title is optional while drafting." />
            <form action={updateCourseAction} encType="multipart/form-data" className="space-y-4 p-5">
              <input type="hidden" name="resourceId" value={resource.id} />
              <Field label="Course title" htmlFor="course-title" required>
                <Input id="course-title" name="title" defaultValue={resource.title} required minLength={4} maxLength={160} />
              </Field>
              <Field label="Short description" htmlFor="course-summary" hint="Shown on cards and in search.">
                <Textarea id="course-summary" name="summary" rows={2} defaultValue={resource.summary ?? ""} maxLength={600} />
              </Field>
              <Field label="Full description" htmlFor="course-body">
                <Textarea id="course-body" name="body" rows={6} defaultValue={resource.body ?? ""} maxLength={20000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Category" htmlFor="course-category">
                  <Select id="course-category" name="category" defaultValue={course.category ?? ""}>
                    <option value="">No category</option>
                    {COURSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {label(category)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Level" htmlFor="course-level">
                  <Select id="course-level" name="level" defaultValue={resource.level}>
                    {RESOURCE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {label(level)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estimated minutes" htmlFor="course-minutes">
                  <Input id="course-minutes" name="estimatedMinutes" type="number" min={1} max={10000} defaultValue={course.estimatedMinutes ?? ""} />
                </Field>
              </div>
              <Field label="Skills taught" htmlFor="course-skills" hint="Comma-separated.">
                <Input id="course-skills" name="skills" defaultValue={(course.skills ?? []).join(", ")} maxLength={400} />
              </Field>
              <Field label="Learning outcomes" htmlFor="course-outcomes" hint="One per line. These appear on the learner-facing course page.">
                <Textarea id="course-outcomes" name="outcomes" rows={4} defaultValue={(course.outcomes ?? []).join("\n")} maxLength={2000} />
              </Field>
              <Field label="Who is this for?" htmlFor="course-audience">
                <Textarea id="course-audience" name="audience" rows={2} defaultValue={course.audience ?? ""} maxLength={400} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Visibility" htmlFor="course-visibility" hint="Private hides the course even when published.">
                  <Select id="course-visibility" name="visibility" defaultValue={course.visibility}>
                    {COURSE_VISIBILITIES.map((visibility) => (
                      <option key={visibility} value={visibility}>
                        {visibility === "invite_only" ? "Link only (unlisted)" : label(visibility)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Practice project" htmlFor="course-project">
                  <Select id="course-project" name="projectId" defaultValue={resource.projectId ?? ""}>
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
                <Field label="Cover image" htmlFor="course-cover" hint={resource.coverImageId ? "Uploading replaces the current cover." : "PNG, JPEG, WebP or GIF."}>
                  <Input id="course-cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                </Field>
                <Field label="Preview video link" htmlFor="course-preview-video" hint="Stays on the original platform; never rehosted.">
                  <Input id="course-preview-video" name="previewVideoUrl" type="url" defaultValue={course.previewVideoUrl ?? ""} maxLength={500} />
                </Field>
              </div>
              {resource.coverImageId ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${resource.coverImageId}`} alt="" className="h-16 w-24 rounded-lg object-cover" />
                  <label className="flex items-center gap-2 text-[11.5px] text-navy-600">
                    <input type="checkbox" name="removeCover" className="h-4 w-4 rounded border-navy-300 text-brand-600" />
                    Remove cover image
                  </label>
                </div>
              ) : null}
              <Field label="Attribution" htmlFor="course-attribution" hint="Credit third-party material and permissions. Never present external work as your own.">
                <Textarea id="course-attribution" name="attribution" rows={2} defaultValue={course.attribution ?? ""} maxLength={600} />
              </Field>
              <SubmitButton pendingLabel="Saving…">Save course details</SubmitButton>
            </form>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
              <Users size={14} aria-hidden="true" /> Co-editors
            </h2>
            <p className="mt-1 text-[11.5px] leading-5 text-navy-500">
              Co-editors can edit details and structure. Only you can publish, unpublish, archive or add editors.
            </p>
            <ul className="mt-3 space-y-2">
              {collaborators.map((person) => (
                <li key={person.userId} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-navy-900">{person.displayName}</p>
                    <Link href={`/u/${person.username}`} className="text-[10.5px] text-navy-500 hover:underline">
                      @{person.username}
                    </Link>
                  </div>
                  {isOwner ? (
                    <form action={removeCollaboratorAction}>
                      <input type="hidden" name="resourceId" value={resource.id} />
                      <input type="hidden" name="collaboratorId" value={person.userId} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                        Remove
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
              {collaborators.length === 0 ? <li className="text-[11.5px] text-navy-500">No co-editors yet.</li> : null}
            </ul>
            {isOwner ? (
              <form action={addCollaboratorAction} className="mt-3 space-y-2 border-t border-navy-100 pt-3">
                <input type="hidden" name="resourceId" value={resource.id} />
                <Field label="Add by username" htmlFor="collaborator-username">
                  <Input id="collaborator-username" name="username" placeholder="username" maxLength={40} />
                </Field>
                <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">
                  Add co-editor
                </SubmitButton>
              </form>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
              <Plus size={14} aria-hidden="true" /> Add a module
            </h2>
            <form action={addModuleAction} className="mt-3 space-y-3">
              <input type="hidden" name="resourceId" value={resource.id} />
              <Field label="Module title" htmlFor="new-module-title" required>
                <Input id="new-module-title" name="title" required maxLength={160} placeholder="Getting started" />
              </Field>
              <Field label="Description" htmlFor="new-module-description">
                <Textarea id="new-module-description" name="description" rows={2} maxLength={600} />
              </Field>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">
                Add module
              </SubmitButton>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-navy-950">Sharing and external content</h2>
            <p className="mt-1.5 text-[11.5px] leading-5 text-navy-600">
              Public URL:
              <br />
              <Link href={`/courses/${resource.id}`} className="break-all font-medium text-brand-700 hover:underline">
                /courses/{resource.id}
              </Link>
            </p>
            <p className="mt-2 text-[10.5px] leading-4 text-navy-500">
              YouTube videos embed on YouTube's own player. Instagram and other links open the original post. Linked
              material is not hosted by BuildTogether and remains the property of its creator.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
