"use server";

import { runServerAction } from "@/lib/actions";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { bool, int, optional, str } from "@/lib/form";
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
import type { ResourceFormat, ResourceLevel } from "@/lib/types";

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
  await runServerAction(`/learn/${resourceId}`, async () => {
    const user = await requireUserOrThrow();
    recordProgress(user.id, resourceId, optional(formData, "lessonId") ?? null, bool(formData, "completed"));
    return { path: `/learn/${resourceId}?notice=Progress+saved.`, revalidate: [`/learn/${resourceId}`, "/learn"] };
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

