import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Lock,
  Users,
} from "lucide-react";
import { Avatar, Badge, ButtonLink, Card, SkillTag, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { externalHost, externalProvider, providerLabel, youtubeEmbedUrl } from "@/lib/external";
import { label } from "@/lib/types";
import { resourceDetail } from "@/services/learning";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const detail = resourceDetail(resourceId, null);
  return {
    title: detail?.resource.title ?? "Course",
    description: detail?.resource.summary ?? undefined,
  };
}

export default async function PublicCoursePage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const viewer = await getCurrentUser();
  if (viewer) redirect(`/learn/${resourceId}`);

  const detail = resourceDetail(resourceId, null);
  if (!detail || !detail.course) notFound();

  const { resource, course, creator, curriculum, previewBody } = detail;
  const lessonCount = curriculum.reduce((sum, module) => sum + module.lessons.length, 0);
  const previewEmbed = youtubeEmbedUrl(course.previewVideoUrl);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <Link href="/courses" className="mb-4 inline-flex items-center gap-1 text-[12px] text-navy-500 hover:underline">
        <ArrowLeft size={12} aria-hidden="true" /> All courses
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="relative aspect-[16/8] ink-card">
              {resource.coverImageId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${resource.coverImageId}`} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[12px] font-semibold uppercase tracking-[0.24em] text-white/55">
                  {label(course.category ?? "course")}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand" className="bg-white/15 text-white">
                    <GraduationCap size={11} aria-hidden="true" /> Course
                  </Badge>
                  <Badge tone="neutral" className="bg-white/90">
                    {label(resource.level)}
                  </Badge>
                  {resource.priceCents === 0 ? <Badge tone="success">Free</Badge> : <Badge tone="warning">Access by creator</Badge>}
                  {course.visibility === "invite_only" ? <Badge tone="neutral" className="bg-white/90">Link only</Badge> : null}
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{resource.title}</h1>
                {resource.summary ? <p className="mt-1 max-w-2xl text-[13px] leading-6 text-white/80">{resource.summary}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[12px] text-navy-600 sm:px-5">
              {creator ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={creator.displayName} size={22} src={creator.avatarFileId ? `/api/files/${creator.avatarFileId}` : null} />
                  <span className="font-medium text-navy-800">{creator.displayName}</span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <BookOpen size={12} aria-hidden="true" /> {curriculum.length} modules · {lessonCount} lessons
              </span>
              {course.estimatedMinutes ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" /> {course.estimatedMinutes} min estimated
                </span>
              ) : null}
              <StatusBadge status={resource.status} />
            </div>
          </Card>

          {previewEmbed || course.previewVideoUrl ? (
            <Card className="overflow-hidden">
              <div className="border-b border-navy-200 px-5 py-4">
                <h2 className="text-[14px] font-semibold text-navy-950">Preview</h2>
              </div>
              {previewEmbed ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={previewEmbed}
                    title={`${resource.title} preview`}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <div className="p-5">
                  <a
                    href={course.previewVideoUrl!}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-blue-600 underline"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    Open {providerLabel(externalProvider(course.previewVideoUrl))} preview
                    {externalHost(course.previewVideoUrl) ? ` on ${externalHost(course.previewVideoUrl)}` : ""}
                  </a>
                </div>
              )}
            </Card>
          ) : null}

          {course.outcomes && course.outcomes.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">What you will learn</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2 text-[12.5px] leading-5 text-navy-700">
                    <CheckCircle2 size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {detail.body ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">About this course</h2>
              <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-navy-700">{detail.body}</div>
            </Card>
          ) : null}

          {previewBody ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Free preview</h2>
              <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-navy-700">{previewBody}</div>
            </Card>
          ) : null}

          <Card>
            <div className="border-b border-navy-200 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-navy-950">Course outline</h2>
              <p className="text-[11.5px] text-navy-500">Lesson titles are public. Full lesson content requires an account and enrolment.</p>
            </div>
            {curriculum.length === 0 ? (
              <p className="px-5 py-5 text-[12px] text-navy-500">This course has no published modules yet.</p>
            ) : (
              <ol className="divide-y divide-navy-200">
                {curriculum.map((module, moduleIndex) => (
                  <li key={module.id} className="px-5 py-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-navy-600">Module {moduleIndex + 1}</p>
                    <h3 className="mt-0.5 text-[13px] font-semibold text-navy-950">{module.title}</h3>
                    {module.description ? <p className="mt-1 text-[11.5px] leading-5 text-navy-500">{module.description}</p> : null}
                    <ul className="mt-2 space-y-1.5">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex items-center gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
                          <span className="text-[10px] text-navy-400" aria-hidden="true">
                            ▸
                          </span>
                          <span className="min-w-0 flex-1 text-[12px] text-navy-800">{lesson.title}</span>
                          {lesson.isFreePreview ? <Badge tone="success">Free preview</Badge> : <Lock size={11} aria-hidden="true" className="text-navy-400" />}
                          {lesson.durationMinutes ? <span className="text-[10px] text-navy-400">{lesson.durationMinutes} min</span> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Start this course</h2>
            <p className="mt-1 text-[11.5px] leading-5 text-navy-600">
              {resource.priceCents === 0
                ? "Free in this build. Sign in or create an account to enrol and save your progress."
                : "Access is granted by the creator. Payments are disabled in this build, so no price is charged."}
            </p>
            <div className="mt-4 space-y-2">
              <ButtonLink href="/auth/sign-in" className="w-full" size="sm">
                Sign in to start <ArrowRight size={13} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/auth/sign-up" variant="secondary" className="w-full" size="sm">
                Create a free account
              </ButtonLink>
            </div>
            <p className="mt-3 border-t border-navy-200 pt-3 text-[10px] leading-4 text-navy-500">
              Enrolment is explicit. BuildTogether never enrols you automatically and never shares your progress publicly
              without permission.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Course details</h2>
            <dl className="mt-2 space-y-2 text-[11.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Level</dt>
                <dd className="font-medium text-navy-800">{label(resource.level)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Modules</dt>
                <dd className="font-medium text-navy-800">{curriculum.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Lessons</dt>
                <dd className="font-medium text-navy-800">{lessonCount}</dd>
              </div>
              {course.category ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-navy-500">Category</dt>
                  <dd className="font-medium text-navy-800">{label(course.category)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Access</dt>
                <dd className="font-medium text-navy-800">{resource.priceCents === 0 ? "Free" : "Creator-granted"}</dd>
              </div>
            </dl>
            {course.skills && course.skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-navy-200 pt-3">
                {course.skills.map((skill) => (
                  <SkillTag key={skill} name={skill} />
                ))}
              </div>
            ) : null}
          </Card>

          {course.audience ? (
            <Card className="p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Who it is for</h2>
              <p className="mt-1 whitespace-pre-line text-[11.5px] leading-5 text-navy-600">{course.audience}</p>
            </Card>
          ) : null}

          {course.attribution ? (
            <Card className="p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Attribution</h2>
              <p className="mt-1 text-[11px] leading-5 text-navy-600">{course.attribution}</p>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
              <Users size={12} aria-hidden="true" /> Learning, not certification
            </h2>
            <p className="mt-1.5 text-[10.5px] leading-4 text-navy-500">
              Completing lessons records progress. It does not create an accepted contribution, certify professional
              competence or grant permission to publish project work.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Share this course</h2>
            <p className="mt-1 break-all text-[10.5px] leading-4 text-navy-500">/courses/{resource.id}</p>
          </Card>

        </aside>
      </div>
    </div>
  );
}
