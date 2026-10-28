"use server";

import { runServerAction } from "@/lib/actions";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { bool, file, int, list, optional, str } from "@/lib/form";
import { saveUploadedFile } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import {
  addFeedback,
  addJourneyStep,
  approveJourney,
  createJourney,
  createResource,
  draftJourneyFromTask,
  publishJourney,
  recordProgress,
} from "@/services/learning";
import {
  decideStory,
  generateStoryboard,
  grantConsent,
  publishStory,
  renderStoryboard,
  revokeConsent,
  moveScene,
  submitStoryForReview,
  updateScene,
} from "@/services/stories";
import { createPost } from "@/services/social";
import type { ResourceFormat, ResourceLevel, Visibility } from "@/lib/types";

/**
 * The Create → New Teaching flow: a focused form that still lands in the same
 * `learning_resources` record as the full studio editor.
 */
export async function createTeachingAction(formData: FormData) {
  const returnTo = str(formData, "returnTo", "/create/teaching");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`resource:${user.id}`, 12, 3_600_000);

    let coverImageId: string | null = null;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }

    const { id } = createResource(user.id, {
      title: str(formData, "title"),
      summary: optional(formData, "summary"),
      body: optional(formData, "body"),
      previewBody: optional(formData, "previewBody"),
      topic: optional(formData, "topic"),
      outcomes: list(formData, "outcomes", 10),
      level: str(formData, "level", "beginner") as ResourceLevel,
      format: str(formData, "format", "article") as ResourceFormat,
      durationMinutes: int(formData, "durationMinutes", 0) || undefined,
      priceCents: 0,
      projectId: optional(formData, "projectId") ?? null,
      coverImageId,
      publish: bool(formData, "publish"),
    });

    return {
      path: `/learn/${id}?notice=${bool(formData, "publish") ? "Teaching+published." : "Draft+saved."}`,
      revalidate: ["/learn", "/studio"],
    };
  });
}

/**
 * Share a Learning: a reflection post, optionally about a resource the learner
 * actually opened. Completion is only recorded when the learner ticks the box —
 * nothing here guesses that they finished anything.
 */
export async function createReflectionAction(formData: FormData) {
  await runServerAction("/create/learning", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`reflection:${user.id}`, 20, 3_600_000);

    const resourceId = optional(formData, "resourceId") ?? null;
    const completed = bool(formData, "markCompleted");
    const publish = bool(formData, "publish");
    const learned = str(formData, "body");
    const takeaways = optional(formData, "takeaways");
    const title = str(formData, "title");
    if (title.trim().length < 3) throw new AppError("Give the learning a title of at least 3 characters.");

    let imageId: string | null = null;
    const upload = file(formData, "image");
    if (upload) {
      const stored = await saveUploadedFile(upload, { ownerId: user.id, visibility: "public" });
      imageId = stored.id;
    }

    const postId = createPost(user.id, {
      title,
      topic: optional(formData, "topic"),
      linkUrl: optional(formData, "linkUrl"),
      // The lesson itself and what it changed stay separate in the entry rather
      // than being flattened into one undifferentiated block of text.
      body: takeaways ? `${learned}\n\nKey takeaways:\n${takeaways}` : learned,
      kind: "lesson",
      resourceId,
      imageId,
      altText: optional(formData, "altText"),
      visibility: str(formData, "visibility", "public") as Visibility,
      publish,
    });

    if (resourceId && completed) recordProgress(user.id, resourceId, null, true);

    // A published reflection opens where it now lives; a draft goes to the
    // author's profile, which is the only place it is visible.
    return {
      path: publish
        ? `/posts/${postId}?notice=Learning+shared.`
        : `/u/${user.username}?tab=posts&notice=Learning+saved+as+a+draft.`,
      revalidate: ["/create/learning", "/home", `/u/${user.username}`, "/learn"],
    };
  });
}

export async function createResourceAction(formData: FormData) {
  await runServerAction("/studio", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`resource:${user.id}`, 12, 3_600_000);

    const moduleCount = Math.min(3, Math.max(0, int(formData, "moduleCount", 1)));
    const curriculum = {
      modules: Array.from({ length: moduleCount }).flatMap((_, moduleIndex) => {
        const title = str(formData, `moduleTitle${moduleIndex}`);
        if (!title) return [];
        const lessonCount = Math.min(4, Math.max(0, int(formData, `lessonCount${moduleIndex}`, 1)));
        return [
          {
            title,
            lessons: Array.from({ length: lessonCount }).flatMap((__, lessonIndex) => {
              const lessonTitle = str(formData, `lessonTitle${moduleIndex}-${lessonIndex}`);
              if (!lessonTitle) return [];
              return [
                {
                  title: lessonTitle,
                  body: optional(formData, `lessonBody${moduleIndex}-${lessonIndex}`),
                  isFreePreview: bool(formData, `lessonFree${moduleIndex}-${lessonIndex}`),
                  durationMinutes: int(formData, `lessonMinutes${moduleIndex}-${lessonIndex}`, 15),
                  exercise: optional(formData, `lessonExercise${moduleIndex}-${lessonIndex}`),
                },
              ];
            }),
          },
        ];
      }),
    };

    const { id } = createResource(user.id, {
      title: str(formData, "title"),
      summary: optional(formData, "summary"),
      body: optional(formData, "body"),
      previewBody: optional(formData, "previewBody"),
      topic: optional(formData, "topic"),
      level: str(formData, "level", "beginner") as ResourceLevel,
      format: str(formData, "format", "article") as ResourceFormat,
      durationMinutes: int(formData, "durationMinutes", 0) || undefined,
      priceCents: Math.round(Number(str(formData, "price", "0")) * 100),
      projectId: optional(formData, "projectId") ?? null,
      journeyId: optional(formData, "journeyId") ?? null,
      storyboardId: optional(formData, "storyboardId") ?? null,
      transcript: optional(formData, "transcript"),
      curriculum,
      publish: bool(formData, "publish"),
    });

    return {
      path: `/learn/${id}?notice=${bool(formData, "publish") ? "Resource+published." : "Draft+saved."}`,
      revalidate: ["/learn", "/studio"],
    };
  });
}

export async function createJourneyAction(formData: FormData) {
  const projectId = optional(formData, "projectId") ?? null;
  const taskId = optional(formData, "taskId") ?? null;
  await runServerAction(taskId ? `/tasks/${taskId}/learning-journey` : "/studio", async () => {
    const user = await requireUserOrThrow();
    const id = createJourney(user.id, {
      projectId,
      taskId,
      title: str(formData, "title"),
      summary: optional(formData, "summary"),
      visibility: "private",
    });
    return { path: `/learn/journeys/${id}?notice=Journey+started.`, revalidate: ["/studio"] };
  });
}

export async function addJourneyStepAction(formData: FormData) {
  const journeyId = str(formData, "journeyId");
  await runServerAction(`/learn/journeys/${journeyId}`, async () => {
    const user = await requireUserOrThrow();
    addJourneyStep(journeyId, user.id, {
      title: str(formData, "title"),
      body: str(formData, "body"),
      kind: str(formData, "kind", "context"),
      sourceType: (optional(formData, "sourceType") as never) ?? null,
      sourceId: optional(formData, "sourceId") ?? null,
    });
    return { path: `/learn/journeys/${journeyId}?notice=Step+added.`, revalidate: [`/learn/journeys/${journeyId}`] };
  });
}

export async function publishJourneyAction(formData: FormData) {
  const journeyId = str(formData, "journeyId");
  await runServerAction(`/learn/journeys/${journeyId}`, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    publishJourney(journeyId, user.id);
    return { path: `/learn/journeys/${journeyId}?notice=Journey+published.`, revalidate: ["/learn", `/learn/journeys/${journeyId}`] };
  });
}

export async function approveJourneyAction(formData: FormData) {
  const journeyId = str(formData, "journeyId");
  await runServerAction(`/learn/journeys/${journeyId}`, async () => {
    const user = await requireUserOrThrow();
    approveJourney(journeyId, user);
    return { path: `/learn/journeys/${journeyId}?notice=Journey+approved.`, revalidate: [`/learn/journeys/${journeyId}`] };
  });
}

export async function draftJourneyFromTaskAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}/learning-journey`, async () => {
    const user = await requireUserOrThrow();
    const { journeyId, skipped } = draftJourneyFromTask(taskId, user.id);
    const note = skipped > 0 ? `Draft+created.+${skipped}+entries+were+skipped+because+they+are+not+approved+for+public+use.` : "Draft+created+from+approved+documentation.";
    return { path: `/learn/journeys/${journeyId}?notice=${note}`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function recordProgressAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  const lessonId = optional(formData, "lessonId") ?? null;
  await runServerAction(`/learn/${resourceId}`, async () => {
    const user = await requireUserOrThrow();
    recordProgress(user.id, resourceId, lessonId, bool(formData, "completed"));
    return {
      path: lessonId
        ? `/learn/${resourceId}/lessons/${lessonId}?notice=Progress+saved.`
        : `/learn/${resourceId}?notice=Progress+saved.`,
      revalidate: [`/learn/${resourceId}`, ...(lessonId ? [`/learn/${resourceId}/lessons/${lessonId}`] : []), "/learn", "/studio"],
    };
  });
}

export async function feedbackAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(`/learn/${resourceId}`, async () => {
    const user = await requireUserOrThrow();
    addFeedback(user.id, resourceId, int(formData, "rating", 5), optional(formData, "body"));
    return { path: `/learn/${resourceId}?notice=Thanks+for+the+feedback.`, revalidate: [`/learn/${resourceId}`] };
  });
}

/* --------------------------------- stories --------------------------------- */

export async function generateStoryAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}/story`, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    const { id, warnings } = await generateStoryboard(projectId, user);
    const note = warnings.length
      ? `Storyboard+drafted+with+${warnings.length}+warning(s)+—+review+the+source+list.`
      : "Storyboard+drafted+from+approved+documentation.";
    return { path: `/projects/${projectId}/story?board=${id}&notice=${note}`, revalidate: [`/projects/${projectId}/story`] };
  });
}

export async function renderStoryAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`render:${user.id}`, 10, 3_600_000);
    await renderStoryboard(storyboardId, user);
    return {
      path: `/projects/${projectId}/story?board=${storyboardId}&notice=Animated+explainer+rendered.`,
      revalidate: [`/projects/${projectId}/story`],
    };
  });
}

export async function updateSceneAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story?board=${storyboardId}`, async () => {
    const user = await requireUserOrThrow();
    updateScene(str(formData, "sceneId"), user, {
      title: optional(formData, "title"),
      narration: optional(formData, "narration"),
      durationSeconds: int(formData, "durationSeconds", 0) || undefined,
    });
    return { path: `/projects/${projectId}/story?board=${storyboardId}&notice=Scene+updated.`, revalidate: [`/projects/${projectId}/story`] };
  });
}

export async function moveSceneAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story?board=${storyboardId}`, async () => {
    const user = await requireUserOrThrow();
    moveScene(str(formData, "sceneId"), user, str(formData, "direction", "up") as "up" | "down");
    return { path: `/projects/${projectId}/story?board=${storyboardId}`, revalidate: [`/projects/${projectId}/story`] };
  });
}

export async function submitStoryAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story?board=${storyboardId}`, async () => {
    const user = await requireUserOrThrow();
    submitStoryForReview(storyboardId, user);
    return { path: `/projects/${projectId}/story?board=${storyboardId}&notice=Sent+for+review.`, revalidate: [`/projects/${projectId}/story`] };
  });
}

export async function decideStoryAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story?board=${storyboardId}`, async () => {
    const user = await requireUserOrThrow();
    decideStory(
      storyboardId,
      user,
      str(formData, "decision", "approved") as "approved" | "changes_requested" | "rejected",
      optional(formData, "note"),
    );
    return { path: `/projects/${projectId}/story?board=${storyboardId}&notice=Review+recorded.`, revalidate: [`/projects/${projectId}/story`] };
  });
}

export async function publishStoryAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const storyboardId = str(formData, "storyboardId");
  await runServerAction(`/projects/${projectId}/story?board=${storyboardId}`, async () => {
    const user = await requireUserOrThrow();
    await publishStory(storyboardId, user);
    return { path: `/projects/${projectId}/story?board=${storyboardId}&notice=Story+published.`, revalidate: [`/projects/${projectId}/story`, "/learn"] };
  });
}

export async function consentAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    const scope = str(formData, "scope", "public_story") as "public_story" | "voice" | "likeness";
    if (bool(formData, "grant")) grantConsent(user.id, projectId, scope);
    else revokeConsent(user.id, projectId, scope);
    return { path: `/projects/${projectId}?tab=team&notice=Consent+preference+updated.`, revalidate: [`/projects/${projectId}`] };
  });
}

