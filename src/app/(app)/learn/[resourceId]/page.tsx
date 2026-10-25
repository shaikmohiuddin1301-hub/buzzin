import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { BookOpen, CheckCircle2, Clock, Lock, PlayCircle, Star } from "lucide-react";
import { getDb } from "@/db/client";
import { creatorProducts, storyScenes } from "@/db/schema";
import { feedbackAction, recordProgressAction } from "@/app/actions/learning";
import { requestAccessAction } from "@/app/actions/commerce";
import { commentAction, reactAction, saveAction } from "@/app/actions/social";
import { SubmitButton } from "@/components/client/submit-button";
import { CommentThread } from "@/components/comments";
import { ReportForm } from "@/components/report-form";
import { StoryPlayer } from "@/components/client/story-player";
import { AudioPlayer, VideoPlayer } from "@/components/media";
import {
  Alert,
  Avatar,
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
  StatusBadge,
  Textarea,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, money, relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import { resourceDetail } from "@/services/learning";
import { listComments, reactionState } from "@/services/social";
import { getMedia, signedMediaUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ResourcePage({
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
  const detail = resourceDetail(resourceId, user);
  if (!detail) notFound();

  const { resource, creator, entitled, premium, body, previewBody, curriculum, exercises, feedback, averageRating, journey } = detail;
  const returnTo = `/learn/${resourceId}`;
  const comments = listComments("resource", resourceId, user);
  const reactions = reactionState(user.id, "resource", resourceId);

  const db = getDb();
  const product = db.select().from(creatorProducts).where(eq(creatorProducts.resourceId, resourceId)).get();
  const storyboardScenes = resource.storyboardId
    ? db.select().from(storyScenes).where(eq(storyScenes.storyboardId, resource.storyboardId)).orderBy(asc(storyScenes.orderIndex)).all()
    : [];
  const video = resource.videoFileId ? getMedia(resource.videoFileId) : null;
  const completedLessonIds = detail.progress.filter((row) => row.completed).map((row) => row.lessonId);
  const overall = detail.progress.length ? Math.max(...detail.progress.map((row) => row.progressPct)) : 0;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href="/learn" className="hover:underline">Learn</Link> /{" "}
        {resource.projectId ? (
          <>
            <Link href={`/projects/${resource.projectId}`} className="hover:underline">Project</Link> /{" "}
          </>
        ) : null}
        <span className="text-navy-700">{resource.title}</span>
      </nav>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{label(resource.format)}</Badge>
            <Badge tone="neutral">{label(resource.level)}</Badge>
            {premium ? (
              <Badge tone={entitled ? "success" : "warning"}>{entitled ? "Premium · access granted" : `Premium · ${money(resource.priceCents, resource.currency)}`}</Badge>
            ) : (
              <Badge tone="success">Free</Badge>
            )}
            {resource.durationMinutes ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-navy-500">
                <Clock size={11} aria-hidden="true" /> {resource.durationMinutes} min
              </span>
            ) : null}
          </span>
        }
        title={resource.title}
        description={resource.summary ?? undefined}
        meta={
          <>
            {creator ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={creator.displayName} size={20} src={creator.avatarFileId ? `/api/files/${creator.avatarFileId}` : null} />
                <Link href={`/u/${creator.username}`} className="font-medium text-navy-700 hover:underline">
                  {creator.displayName}
                </Link>
              </span>
            ) : null}
            <span>Published {formatDate(resource.publishedAt)}</span>
            {feedback.length > 0 ? (
              <span className="flex items-center gap-1">
                <Star size={12} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                {averageRating.toFixed(1)} ({feedback.length})
              </span>
            ) : null}
            {resource.topic ? <span>Topic: {resource.topic}</span> : null}
          </>
        }
        actions={
          <>
            <form action={saveAction}>
              <input type="hidden" name="targetType" value="resource" />
              <input type="hidden" name="targetId" value={resourceId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                Save
              </SubmitButton>
            </form>
            <form action={reactAction}>
              <input type="hidden" name="targetType" value="resource" />
              <input type="hidden" name="targetId" value={resourceId} />
              <input type="hidden" name="kind" value="insight" />
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                {reactions.mine ? "Marked useful" : "Mark useful"} ({reactions.count})
              </SubmitButton>
            </form>
            <ReportForm targetType="resource" targetId={resourceId} returnTo={returnTo} />
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          {storyboardScenes.length > 0 ? (
            <StoryPlayer
              title={resource.title}
              scenes={storyboardScenes.map((scene) => ({
                id: scene.id,
                title: scene.title,
                narration: scene.narration,
                visualDescription: scene.visualDescription,
                durationSeconds: scene.durationSeconds,
                sourceLabel: scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : null,
                contributors: (scene.contributors ?? []).map((person) => person.name),
                factStatus: scene.factStatus,
                aiGenerated: scene.aiGenerated,
              }))}
            />
          ) : null}

          {video ? (
            <VideoPlayer
              src={signedMediaUrl(video.id)}
              title={resource.title}
              transcript={detail.transcript}
              captionsSrc={resource.captions ? signedMediaUrl(video.id) : null}
            />
          ) : null}

          {!entitled && premium ? (
            <Card className="border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <Lock size={18} aria-hidden="true" className="mt-0.5 text-amber-700" />
                <div>
                  <h2 className="text-[14px] font-semibold text-amber-900">This is premium material</h2>
                  <p className="mt-1 text-[12.5px] leading-6 text-amber-900">
                    You can read the preview{curriculum.some((module) => module.lessons.some((lesson) => lesson.isFreePreview)) ? " and any free-preview lessons" : ""}.
                    The full body, transcript and exercises are withheld by the server until you have access.
                  </p>
                  <p className="mt-2 text-[11.5px] leading-5 text-amber-800">
                    <strong>Payments are disabled in this build.</strong> No charge is made. Requesting access sends a message
                    to the creator, who grants it manually from their studio.
                  </p>
                  {product ? (
                    <form action={requestAccessAction} className="mt-3 space-y-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="resourceId" value={resourceId} />
                      <Field label="Note to the creator (optional)" htmlFor="access-note">
                        <Textarea id="access-note" name="note" rows={2} maxLength={600} placeholder="Why you want access / what you plan to use it for." />
                      </Field>
                      <SubmitButton size="sm" pendingLabel="Sending…">
                        Request access
                      </SubmitButton>
                    </form>
                  ) : (
                    <p className="mt-2 text-[11.5px] text-amber-800">No product is linked yet, so access cannot be requested.</p>
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {previewBody && (!entitled || premium) ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Free preview</h2>
              <div className="prose-bt mt-2 whitespace-pre-line text-[13.5px]">{previewBody}</div>
            </Card>
          ) : null}

          {body ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">The material</h2>
              <div className="prose-bt mt-2 whitespace-pre-line text-[13.5px]">{body}</div>
            </Card>
          ) : null}

          {curriculum.length > 0 ? (
            <Card>
              <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-navy-950">Curriculum</h2>
                  <p className="text-[12px] text-navy-500">{curriculum.reduce((sum, module) => sum + module.lessons.length, 0)} lessons</p>
                </div>
                {detail.progress.length > 0 ? <span className="text-[11px] text-navy-500">{overall}% complete</span> : null}
              </div>
              <div className="divide-y divide-navy-100">
                {curriculum.map((module, moduleIndex) => (
                  <section key={module.id} className="px-5 py-4">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">
                      Module {moduleIndex + 1} · {module.title}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {module.lessons.map((lesson) => {
                        const completed = completedLessonIds.includes(lesson.id);
                        return (
                          <li key={lesson.id} className="rounded-lg border border-navy-100 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {completed ? (
                                  <CheckCircle2 size={14} aria-hidden="true" className="text-emerald-600" />
                                ) : (
                                  <PlayCircle size={14} aria-hidden="true" className="text-navy-400" />
                                )}
                                <p className="text-[12.5px] font-medium text-navy-900">{lesson.title}</p>
                                {lesson.isFreePreview ? <Badge tone="success">Free preview</Badge> : null}
                                {lesson.durationMinutes ? <span className="text-[10.5px] text-navy-400">{lesson.durationMinutes} min</span> : null}
                              </div>
                              <form action={recordProgressAction}>
                                <input type="hidden" name="resourceId" value={resourceId} />
                                <input type="hidden" name="lessonId" value={lesson.id} />
                                <input type="hidden" name="completed" value={completed ? "false" : "true"} />
                                <SubmitButton size="sm" variant={completed ? "ghost" : "secondary"} pendingLabel="…">
                                  {completed ? "Mark incomplete" : "Mark complete"}
                                </SubmitButton>
                              </form>
                            </div>
                            {lesson.body ? (
                              <p className="mt-1.5 whitespace-pre-line text-[12px] leading-6 text-navy-600">{lesson.body}</p>
                            ) : (
                              <p className="mt-1.5 text-[11.5px] text-amber-700">Lesson content is withheld until you have access.</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </Card>
          ) : null}

          {exercises.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Exercises</h2>
              <ul className="mt-2 space-y-3">
                {exercises.map((exercise) => (
                  <li key={exercise.id} className="rounded-lg bg-navy-50 p-3">
                    <p className="text-[12.5px] font-semibold text-navy-900">{exercise.title}</p>
                    <p className="mt-0.5 whitespace-pre-line text-[12px] leading-5 text-navy-600">{exercise.instructions}</p>
                    {exercise.hint ? <p className="mt-1 text-[11px] text-navy-500">Hint: {exercise.hint}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {journey ? (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-navy-950">Built from a learning journey</h2>
              <p className="mt-1 text-[12.5px] text-navy-600">{journey.title}</p>
              <ButtonLink href={`/learn/journeys/${journey.id}`} size="sm" variant="secondary" className="mt-2">
                Open the journey
              </ButtonLink>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Learner discussion</h2>
            <div className="mt-3">
              <CommentThread comments={comments} targetType="resource" targetId={resourceId} returnTo={returnTo} canComment />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[14px] font-semibold text-navy-950">Feedback</h2>
            {feedback.length > 0 ? (
              <ul className="mt-2 space-y-3">
                {feedback.map((item) => (
                  <li key={item.id} className="rounded-lg border border-navy-100 p-3">
                    <div className="flex items-center gap-2">
                      <Star size={12} aria-hidden="true" className="fill-amber-400 text-amber-400" />
                      <span className="text-[12px] font-semibold text-navy-900">{item.rating}/5</span>
                      <Link href={`/u/${item.authorUsername}`} className="text-[11.5px] text-navy-600 hover:underline">
                        {item.authorName}
                      </Link>
                      <span className="text-[10.5px] text-navy-400">{relativeTime(item.createdAt)}</span>
                    </div>
                    {item.body ? <p className="mt-1 text-[12px] leading-5 text-navy-700">{item.body}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] text-navy-500">No feedback yet.</p>
            )}
            {!detail.isOwner ? (
              <form action={feedbackAction} className="mt-4 space-y-2 border-t border-navy-100 pt-3">
                <input type="hidden" name="resourceId" value={resourceId} />
                <Field label="Your rating" htmlFor="rating">
                  <Select id="rating" name="rating" defaultValue="5">
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating} — {rating === 5 ? "excellent" : rating === 4 ? "good" : rating === 3 ? "okay" : rating === 2 ? "weak" : "poor"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="What was useful? What was missing?" htmlFor="feedback-body">
                  <Textarea id="feedback-body" name="body" rows={3} maxLength={2000} />
                </Field>
                <SubmitButton size="sm" pendingLabel="Sending…">
                  Submit feedback
                </SubmitButton>
                <p className="text-[10.5px] text-navy-500">
                  Feedback from learners counts toward teaching quality. Reciprocal rating schemes are a moderation matter.
                </p>
              </form>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">About this resource</h2>
            <dl className="mt-2 space-y-2 text-[11.5px]">
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Format</dt>
                <dd className="font-medium text-navy-800">{label(resource.format)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Level</dt>
                <dd className="font-medium text-navy-800">{label(resource.level)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Price</dt>
                <dd className="font-medium text-navy-800">{premium ? money(resource.priceCents, resource.currency) : "Free"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Transcript</dt>
                <dd className="font-medium text-navy-800">{detail.transcript ? "Available" : "Not supplied"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-navy-500">Status</dt>
                <dd>
                  <StatusBadge status={resource.status} />
                </dd>
              </div>
            </dl>
            {premium && product ? (
              <p className="mt-3 rounded-md bg-navy-50 px-2 py-1.5 text-[10.5px] leading-4 text-navy-600">
                Refund policy: {product.refundPolicy}
              </p>
            ) : null}
          </Card>

          {overall > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Your progress</h2>
              <div className="mt-2">
                <Progress value={overall} label={`${overall}% complete`} />
              </div>
            </Card>
          ) : null}

          {detail.transcript && entitled ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Transcript</h2>
              <details className="mt-1">
                <summary className="cursor-pointer text-[11.5px] text-navy-700">Read transcript</summary>
                <p className="mt-2 whitespace-pre-line text-[11.5px] leading-5 text-navy-600">{detail.transcript}</p>
              </details>
            </Card>
          ) : null}

          {resource.projectId ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Source project</h2>
              <ButtonLink href={`/projects/${resource.projectId}`} size="sm" variant="secondary" className="mt-2">
                Open project
              </ButtonLink>
            </Card>
          ) : null}

          {exercises.length === 0 && premium && !entitled ? (
            <div className="rounded-lg border border-navy-200 bg-white p-3 text-[10.5px] leading-4 text-navy-500">
              Exercises are withheld until access is granted — the server does not send them to unentitled clients.
            </div>
          ) : null}

          <div className="rounded-lg border border-navy-200 bg-white p-3 text-[10.5px] leading-4 text-navy-500">
            <p className="flex items-center gap-1.5 font-semibold text-navy-700">
              <BookOpen size={11} aria-hidden="true" /> Honest labelling
            </p>
            <p className="mt-1">
              Creator claims and results are not independently audited. Ratings come from learners with access. No audio
              autoplays.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
