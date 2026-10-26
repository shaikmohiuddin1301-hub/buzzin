import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Link2,
  PlayCircle,
} from "lucide-react";
import { enrolCourseAction } from "@/app/actions/courses";
import { recordProgressAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { AudioPlayer, AttachmentLink, VideoPlayer } from "@/components/media";
import { Alert, Badge, ButtonLink, Card, Flash, Progress } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { externalHost, externalProvider, providerLabel, youtubeEmbedUrl } from "@/lib/external";
import { getMedia, signedMediaUrl } from "@/lib/storage";
import { lessonDetail } from "@/services/learning";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string; lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { resourceId, lessonId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const data = lessonDetail(resourceId, lessonId, user);
  if (!data) notFound();

  const { detail, lesson, module, exercise, prev, next, project, projectAccess, completed } = data;
  const { resource, course, courseProgress } = detail;
  const media = lesson.mediaId ? getMedia(lesson.mediaId) : null;
  const mediaUrl = media ? signedMediaUrl(media.id) : null;
  const videoEmbed = lesson.videoUrl ? youtubeEmbedUrl(lesson.videoUrl) : null;
  const lessonIndex = data.index + 1;
  const totalLessons = courseProgress?.totalLessons ?? 0;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-[12px] text-navy-500">
        <Link href="/learn" className="hover:underline">
          Learning
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/learn/${resourceId}`} className="hover:underline">
          {resource.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-navy-700">Lesson {lessonIndex}</span>
      </nav>

      <Flash error={error} notice={notice} />

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
          <GraduationCap size={13} aria-hidden="true" />
          Module · {module.title}
          {courseProgress ? (
            <span className="font-medium normal-case tracking-normal text-navy-500">
              {courseProgress.completedLessons} of {courseProgress.totalLessons} lessons complete
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-[28px]">{lesson.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-navy-500">
              {lesson.durationMinutes ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" /> {lesson.durationMinutes} min
                </span>
              ) : null}
              {lesson.isFreePreview ? <Badge tone="success">Free preview</Badge> : null}
              {completed ? <Badge tone="success">Completed</Badge> : null}
              {media ? <span>{media.filename}</span> : null}
              {lesson.videoUrl ? <span>External video</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/learn/${resourceId}`} size="sm" variant="secondary">
              <ArrowLeft size={13} aria-hidden="true" /> Course overview
            </ButtonLink>
            <form action={recordProgressAction}>
              <input type="hidden" name="resourceId" value={resourceId} />
              <input type="hidden" name="lessonId" value={lesson.id} />
              <input type="hidden" name="completed" value={completed ? "false" : "true"} />
              <SubmitButton size="sm" variant={completed ? "secondary" : "primary"} pendingLabel="Saving…">
                {completed ? (
                  "Mark incomplete"
                ) : (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" /> Mark complete
                  </>
                )}
              </SubmitButton>
            </form>
          </div>
        </div>
        {courseProgress && totalLessons > 0 ? (
          <div className="mt-4 max-w-xl">
            <Progress value={courseProgress.pct} label={`${courseProgress.pct}% of the course complete`} />
          </div>
        ) : null}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {videoEmbed ? (
            <Card className="overflow-hidden">
              <div className="aspect-video bg-black">
                <iframe
                  src={videoEmbed}
                  title={lesson.title}
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  className="h-full w-full"
                />
              </div>
              <p className="px-4 py-2.5 text-[10.5px] leading-4 text-navy-500">
                Embedded from YouTube's privacy-enhanced player. The video remains the property of its creator and is not
                hosted by BuildTogether.
              </p>
            </Card>
          ) : null}

          {lesson.videoUrl && !videoEmbed ? (
            <Card className="p-5">
              <h2 className="text-[13px] font-semibold text-navy-950">Video from the original platform</h2>
              <a
                href={lesson.videoUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 underline"
              >
                <ExternalLink size={13} aria-hidden="true" />
                Open {providerLabel(externalProvider(lesson.videoUrl))} video{externalHost(lesson.videoUrl) ? ` on ${externalHost(lesson.videoUrl)}` : ""}
              </a>
              <p className="mt-1 text-[10.5px] leading-4 text-navy-500">
                This link cannot be embedded here. It opens on the original platform, where its creator's terms and
                permissions apply.
              </p>
            </Card>
          ) : null}

          {media && mediaUrl ? (
            <Card className="overflow-hidden">
              <div className="border-b border-navy-100 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-navy-950">Lesson file</h2>
              </div>
              <div className="p-4">
                {media.mimeType.startsWith("video/") ? (
                  <VideoPlayer src={mediaUrl} title={media.filename} />
                ) : media.mimeType.startsWith("audio/") ? (
                  <AudioPlayer src={mediaUrl} title={media.filename} />
                ) : (
                  <AttachmentLink
                    fileId={media.id}
                    filename={media.filename}
                    mimeType={media.mimeType}
                    sizeBytes={media.sizeBytes}
                    signed={mediaUrl}
                  />
                )}
              </div>
            </Card>
          ) : null}

          {lesson.body ? (
            <Card className="p-5">
              <div className="prose-bt whitespace-pre-line text-[13.5px] leading-7">{lesson.body}</div>
            </Card>
          ) : (
            <Alert tone="info" title="No written notes for this lesson">
              The lesson may be delivered through the video or resource above. Your completion is recorded only when you mark
              it complete.
            </Alert>
          )}

          {lesson.externalUrl ? (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-navy-950">
                <Link2 size={14} aria-hidden="true" /> Resource from {providerLabel(externalProvider(lesson.externalUrl))}
              </h2>
              <a
                href={lesson.externalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-2 block rounded-lg border border-navy-200 bg-navy-50/40 p-3 transition hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-brand-700">
                  <ExternalLink size={13} aria-hidden="true" />
                  {lesson.externalLabel || externalHost(lesson.externalUrl) || "Open resource"}
                </span>
                <span className="mt-1 block text-[10.5px] leading-4 text-navy-500">
                  {externalHost(lesson.externalUrl)}
                  {lesson.externalAuthor ? ` · by ${lesson.externalAuthor}` : ""} · opens outside BuildTogether
                </span>
              </a>
              <p className="mt-2 text-[10.5px] leading-4 text-navy-500">
                This resource is not hosted by BuildTogether. Credit and rights remain with its original creator.
                {lesson.externalAuthor ? ` Attributed to ${lesson.externalAuthor}.` : ""}
              </p>
            </Card>
          ) : null}

          {exercise ? (
            <Card className="p-5">
              <h2 className="text-[13px] font-semibold text-navy-950">Practice exercise</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-navy-900">{exercise.title}</p>
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-6 text-navy-700">{exercise.instructions}</p>
              {exercise.hint ? <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-600">Hint: {exercise.hint}</p> : null}
              <p className="mt-3 border-t border-navy-100 pt-2 text-[10.5px] leading-4 text-navy-500">
                Completing the exercise here does not create an accepted contribution. Submit work through the relevant
                project task if you want it reviewed and recorded.
              </p>
            </Card>
          ) : null}

          <nav aria-label="Lesson navigation" className="flex flex-wrap items-center justify-between gap-2">
            {prev ? (
              <ButtonLink href={`/learn/${resourceId}/lessons/${prev.id}`} variant="secondary" size="sm">
                <ArrowLeft size={13} aria-hidden="true" /> {prev.title}
              </ButtonLink>
            ) : (
              <span />
            )}
            {next ? (
              <ButtonLink href={`/learn/${resourceId}/lessons/${next.id}`} size="sm">
                {next.title} <ArrowRight size={13} aria-hidden="true" />
              </ButtonLink>
            ) : (
              <ButtonLink href={`/learn/${resourceId}`} size="sm" variant="secondary">
                Back to course overview
              </ButtonLink>
            )}
          </nav>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Course</h2>
            <Link href={`/learn/${resourceId}`} className="mt-1 block text-[13px] font-semibold text-navy-950 hover:underline">
              {resource.title}
            </Link>
            <p className="mt-1 text-[11px] text-navy-500">
              Lesson {lessonIndex} of {totalLessons} · {module.title}
            </p>
            {!detail.enrollment ? (
              <form action={enrolCourseAction} className="mt-3">
                <input type="hidden" name="resourceId" value={resourceId} />
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="Enrolling…">
                  Enrol to track progress
                </SubmitButton>
                <p className="mt-1 text-[10px] leading-4 text-navy-500">
                  Marking the lesson complete also creates your enrolment. No payment is taken.
                </p>
              </form>
            ) : (
              <p className="mt-2 rounded-lg bg-navy-50 px-2 py-1.5 text-[10.5px] text-navy-600">
                Enrolled {relativeTime(detail.enrollment.enrolledAt)}. Your progress is visible only to you and the creator.
              </p>
            )}
            <ButtonLink href={`/learn/${resourceId}#discussion`} variant="ghost" size="sm" className="mt-2 w-full justify-start px-0">
              Ask a question in the course discussion
            </ButtonLink>
          </Card>

          {course ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">About this lesson</h2>
              <dl className="mt-2 space-y-2 text-[11.5px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-navy-500">Module</dt>
                  <dd className="text-right font-medium text-navy-800">{module.title}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-navy-500">Level</dt>
                  <dd className="font-medium text-navy-800">{resource.level}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-navy-500">Duration</dt>
                  <dd className="font-medium text-navy-800">{lesson.durationMinutes ? `${lesson.durationMinutes} min` : "Not stated"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-navy-500">Completion</dt>
                  <dd className="font-medium text-navy-800">{completed ? "Recorded" : "Not yet"}</dd>
                </div>
              </dl>
            </Card>
          ) : null}

          {project ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Practise this for real</h2>
              {projectAccess?.canView ? (
                <>
                  <p className="mt-1 text-[12px] font-medium text-navy-900">{project.name}</p>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-navy-500">
                    Tasks, reviews and accepted contributions are managed by the project team. Course completion does not
                    grant access or credit.
                  </p>
                  <ButtonLink href={`/projects/${project.id}`} size="sm" variant="secondary" className="mt-2">
                    Open project
                  </ButtonLink>
                </>
              ) : (
                <p className="mt-1 text-[10.5px] leading-4 text-navy-500">
                  This project is private to its team. Course access does not grant project access.
                </p>
              )}
            </Card>
          ) : null}

          {course && courseProgress ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Course progress</h2>
              <div className="mt-2">
                <Progress value={courseProgress.pct} label={`${courseProgress.completedLessons} of ${courseProgress.totalLessons} lessons complete`} />
              </div>
              <div className="mt-3 space-y-1 text-[10.5px] text-navy-500">
                <p className="flex items-center gap-1.5">
                  <BookOpen size={11} aria-hidden="true" /> Learning record only
                </p>
                <p className="flex items-center gap-1.5">
                  <PlayCircle size={11} aria-hidden="true" /> Progress saves after each completed lesson
                </p>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
