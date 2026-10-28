import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Download, Sparkles, Wand2 } from "lucide-react";
import { getDb } from "@/db/client";
import { storyboards } from "@/db/schema";
import {
  decideStoryAction,
  generateStoryAction,
  moveSceneAction,
  publishStoryAction,
  renderStoryAction,
  submitStoryAction,
  updateSceneAction,
} from "@/app/actions/learning";
import { SubmitButton } from "@/components/client/submit-button";
import { StoryPlayer } from "@/components/client/story-player";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Flash,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import { projectDetail } from "@/services/projects";
import { collectSources, consentedUsers, storyboardDetail, storyboardsForProject } from "@/services/stories";

export const dynamic = "force-dynamic";

export default async function ProjectStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const detail = projectDetail(projectId, user);
  if (!detail) notFound();

  const project = detail.project;
  const boards = storyboardsForProject(projectId, user);
  const selectedId = typeof query.board === "string" ? query.board : boards[0]?.id;
  const board = selectedId ? storyboardDetail(selectedId, user) : null;
  const canManage = detail.access.canManageStory;

  const sources = canManage ? collectSources(projectId, user) : [];
  const consented = consentedUsers(projectId);

  const approvalHistory = board?.approvals ?? [];
  const sceneRows = board?.scenes ?? [];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href={`/projects/${projectId}`} className="hover:underline">{project.name}</Link> /{" "}
        <span className="text-navy-700">Story</span>
      </nav>

      <PageHeader
        eyebrow="AI project story"
        title="Turn approved documentation into an explainer"
        description="Narration is composed only from approved records, every scene keeps its source link, and nothing can be published without a recorded approval."
        actions={
          <>
            <ButtonLink href={`/projects/${projectId}?tab=learning`} variant="ghost" size="sm">
              Project learning
            </ButtonLink>
            <ButtonLink href={`/projects/${projectId}`} variant="secondary" size="sm">
              Back to project
            </ButtonLink>
          </>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Provider</p>
          <p className="mt-1 text-[13px] font-medium text-navy-900">Local deterministic provider</p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-navy-500">
            No hosted model is called. Swappable behind the same interface.
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Eligible sources</p>
          <p className="mt-1 text-[13px] font-medium text-navy-900">{sources.length}</p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-navy-500">
            Public work logs, completed milestones, public updates, approved deliverables.
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Consented contributors</p>
          <p className="mt-1 text-[13px] font-medium text-navy-900">{consented.length}</p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-navy-500">
            Entries from non-consenting contributors are excluded with a warning.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          {!board ? (
            <EmptyState
              icon={<Sparkles size={22} aria-hidden="true" />}
              title="No storyboard yet"
              description={
                canManage
                  ? "Generate a draft from the project's approved documentation. You will be able to edit narration, reorder scenes and regenerate the animation before anyone sees it."
                  : "The project owner has not generated a story yet."
              }
              action={
                canManage ? (
                  <form action={generateStoryAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <SubmitButton pendingLabel="Generating storyboard…">
                      <Wand2 size={14} aria-hidden="true" /> Generate draft storyboard
                    </SubmitButton>
                  </form>
                ) : undefined
              }
            />
          ) : (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={board.board.status} />
                      <Badge tone="neutral">v{board.board.version}</Badge>
                      <Badge tone={board.board.visibility === "public" ? "success" : "neutral"}>{label(board.board.visibility)}</Badge>
                      <Badge tone={board.board.aiGenerated ? "brand" : "info"}>
                        {board.board.aiGenerated ? "AI narration (local)" : "Human written"}
                      </Badge>
                    </div>
                    <h2 className="mt-2 text-[16px] font-semibold text-navy-950">{board.board.title}</h2>
                    <p className="mt-0.5 max-w-2xl text-[12.5px] leading-6 text-navy-600">{board.board.summary}</p>
                  </div>
                  <div className="text-right text-[11px] text-navy-500">
                    <p>Updated {relativeTime(board.board.updatedAt)}</p>
                    {board.board.approvedAt ? <p>Approved {formatDate(board.board.approvedAt)}</p> : null}
                  </div>
                </div>

                {board.unsupported.length > 0 ? (
                  <div className="mt-3">
                    <Alert tone="warning" title={`${board.unsupported.length} scene(s) need review`}>
                      Claims that cannot be traced to a source are flagged and block submission for review.
                    </Alert>
                  </div>
                ) : null}

                {sceneRows.length > 0 ? (
                  <div className="mt-4">
                    <StoryPlayer
                      title={board.board.title}
                      scenes={sceneRows.map((scene) => ({
                        id: scene.id,
                        title: scene.title,
                        narration: scene.narration,
                        visualDescription: scene.visualDescription,
                        durationSeconds: scene.durationSeconds,
                        sourceLabel: scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : "Opening card (no source)",
                        contributors: (scene.contributors ?? []).map((person) => person.name),
                        factStatus: scene.factStatus,
                        aiGenerated: scene.aiGenerated,
                      }))}
                    />
                  </div>
                ) : null}
              </Card>

              <Card>
                <div className="border-b border-navy-200 px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-navy-950">Scenes</h2>
                  <p className="text-[12px] text-navy-500">Each scene records its source and its fact status. Editing narration marks it human-authored.</p>
                </div>
                <ol className="divide-y divide-navy-200">
                  {sceneRows.map((scene, index) => (
                    <li key={scene.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full ink-surface text-[10px] font-semibold text-white">
                            {index + 1}
                          </span>
                          <p className="text-[13px] font-semibold text-navy-900">{scene.title}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={scene.factStatus} />
                          <Badge tone="neutral">{scene.durationSeconds}s</Badge>
                          {canManage ? (
                            <>
                              <form action={moveSceneAction}>
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="storyboardId" value={board.board.id} />
                                <input type="hidden" name="sceneId" value={scene.id} />
                                <input type="hidden" name="direction" value="up" />
                                <SubmitButton size="sm" variant="ghost" disabled={index === 0} aria-label="Move scene up">
                                  ↑
                                </SubmitButton>
                              </form>
                              <form action={moveSceneAction}>
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="storyboardId" value={board.board.id} />
                                <input type="hidden" name="sceneId" value={scene.id} />
                                <input type="hidden" name="direction" value="down" />
                                <SubmitButton size="sm" variant="ghost" disabled={index === sceneRows.length - 1} aria-label="Move scene down">
                                  ↓
                                </SubmitButton>
                              </form>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <p className="mt-1.5 text-[12.5px] leading-6 text-navy-700">{scene.narration}</p>

                      <p className="mt-1 text-[10.5px] text-navy-500">
                        {scene.sourceType ? `Source: ${scene.sourceType.replace("_", " ")}` : "Opening card"}
                        {(scene.contributors ?? []).length > 0
                          ? ` · Contributors: ${(scene.contributors ?? []).map((person) => person.name).join(", ")}`
                          : ""}
                      </p>

                      {canManage ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-medium text-navy-600 hover:text-navy-900">Edit narration</summary>
                          <form action={updateSceneAction} className="mt-2 space-y-2">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="storyboardId" value={board.board.id} />
                            <input type="hidden" name="sceneId" value={scene.id} />
                            <Field label="Title" htmlFor={`scene-title-${scene.id}`}>
                              <Input id={`scene-title-${scene.id}`} name="title" defaultValue={scene.title} />
                            </Field>
                            <Field label="Narration" htmlFor={`scene-narration-${scene.id}`} hint="Do not add claims that are not in the source record.">
                              <Textarea id={`scene-narration-${scene.id}`} name="narration" defaultValue={scene.narration} rows={4} />
                            </Field>
                            <Field label="Duration (seconds)" htmlFor={`scene-duration-${scene.id}`}>
                              <Input
                                id={`scene-duration-${scene.id}`}
                                name="durationSeconds"
                                type="number"
                                min={3}
                                max={30}
                                defaultValue={scene.durationSeconds}
                              />
                            </Field>
                            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                              Save scene
                            </SubmitButton>
                          </form>
                        </details>
                      ) : null}
                    </li>
                  ))}
                  {sceneRows.length === 0 ? (
                    <li className="px-5 py-5 text-[13px] text-navy-500">
                      No scenes. Add approved documentation, milestones or updates and regenerate.
                    </li>
                  ) : null}
                </ol>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-4">
          {boards.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Storyboards</h2>
              <ul className="mt-2 space-y-1.5">
                {boards.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/projects/${projectId}/story?board=${row.id}`}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11.5px]",
                        row.id === board?.board.id ? "bg-brand-50 font-medium text-brand-800" : "text-navy-700 hover:bg-navy-50",
                      )}
                    >
                      <span className="truncate">{row.title}</span>
                      <StatusBadge status={row.status} />
                    </Link>
                  </li>
                ))}
              </ul>
              {canManage ? (
                <form action={generateStoryAction} className="mt-3 border-t border-navy-200 pt-3">
                  <input type="hidden" name="projectId" value={projectId} />
                  <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="Generating…">
                    Generate a new storyboard
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          ) : null}

          {board ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Render &amp; review</h2>

              {board.animation ? (
                <div className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600">
                  <p className="flex items-center gap-1 font-medium">
                    <CheckCircle2 size={12} aria-hidden="true" /> Animated explainer ready
                  </p>
                  <a href={`/api/files/${board.animation.fileId}`} className="mt-1 inline-flex items-center gap-1 underline" download>
                    <Download size={11} aria-hidden="true" /> Download SVG animation
                  </a>
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
                  No rendered animation yet. Rendering produces a real animated SVG built from these scenes.
                </p>
              )}

              {canManage ? (
                <div className="mt-2 space-y-2">
                  <form action={renderStoryAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="storyboardId" value={board.board.id} />
                    <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="Rendering…">
                      {board.animation ? "Re-render animation" : "Render animated explainer"}
                    </SubmitButton>
                  </form>

                  {board.board.status === "draft" ? (
                    <form action={submitStoryAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="storyboardId" value={board.board.id} />
                      <SubmitButton size="sm" className="w-full" pendingLabel="Submitting…" disabled={board.unsupported.length > 0}>
                        Submit for review
                      </SubmitButton>
                    </form>
                  ) : null}

                  {board.board.status === "in_review" && board.canReview ? (
                    <div className="space-y-2">
                      <form action={decideStoryAction} className="space-y-2">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="storyboardId" value={board.board.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <Field label="Approval note" htmlFor="approve-note">
                          <Textarea id="approve-note" name="note" rows={2} placeholder="I checked every scene against its source." />
                        </Field>
                        <SubmitButton size="sm" variant="positive" className="w-full" pendingLabel="…">
                          Approve
                        </SubmitButton>
                      </form>
                      <form action={decideStoryAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="storyboardId" value={board.board.id} />
                        <input type="hidden" name="decision" value="changes_requested" />
                        <input type="hidden" name="note" value="Changes requested from the story editor." />
                        <SubmitButton size="sm" variant="caution" className="w-full" pendingLabel="…">
                          Request changes
                        </SubmitButton>
                      </form>
                    </div>
                  ) : null}

                  {board.canPublish ? (
                    <form action={publishStoryAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="storyboardId" value={board.board.id} />
                      <SubmitButton size="sm" className="w-full" pendingLabel="Publishing…">
                        Publish story
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-3 border-t border-navy-200 pt-2 text-[10.5px] leading-4 text-navy-500">
                Publication requires: approved status, a rendered animation, and project-owner approval. Authors cannot approve
                their own story.
              </p>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Approval history</h2>
            {approvalHistory.length === 0 ? (
              <p className="mt-1.5 text-[11.5px] text-navy-500">No reviews recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {approvalHistory.map((row) => (
                  <li key={row.approval.id} className="rounded-md bg-navy-50 p-2 text-[11px] text-navy-700">
                    <p className="font-medium">{row.approverName} — {label(row.approval.decision)}</p>
                    <p className="text-[10px] text-navy-500">{formatDate(row.approval.createdAt, { time: true })}</p>
                    {row.approval.note ? <p className="mt-0.5">{row.approval.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {sources.length > 0 ? (
            <Card className="p-4">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Source material</h2>
              <ul className="mt-2 space-y-1.5">
                {sources.slice(0, 12).map((source) => {
                  const missingConsent = source.contributors.some((person) => !consented.includes(person.userId));
                  return (
                    <li key={`${source.kind}-${source.id}`} className="flex items-start gap-2 text-[11px] leading-4">
                      <span aria-hidden="true" className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", missingConsent ? "bg-amber-500" : "bg-emerald-500")} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-800">{source.title}</span>
                        <span className="text-navy-500">
                          {source.kind.replace("_", " ")} · {formatDate(source.at)}
                          {missingConsent ? " · consent missing" : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[10px] text-navy-400">
                Team-only entries are never included, even for the project owner.
              </p>
            </Card>
          ) : null}

          <div className="rounded-lg border border-navy-200 bg-surface p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-800">
              <AlertTriangle size={12} aria-hidden="true" className="text-amber-600" /> Safeguards in force
            </p>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-navy-600">
              <li>No invented events, results or metrics</li>
              <li>Per-contributor consent required</li>
              <li>Team-only records excluded</li>
              <li>Unsupported claims block review</li>
              <li>No likeness or voice synthesis</li>
              <li>Approval recorded before publication</li>
            </ul>
          </div>

          <Link href="/community-guidelines#enforcement" className="block text-[11px] text-navy-500 underline">
            How stories are moderated
          </Link>
        </aside>
      </div>
    </div>
  );
}
