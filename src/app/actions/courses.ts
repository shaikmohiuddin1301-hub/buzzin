"use server";

import { runServerAction } from "@/lib/actions";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { bool, file, int, optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { saveUploadedFile } from "@/lib/storage";
import type { CourseVisibility, ResourceLevel } from "@/lib/types";
import {
  addCourseCollaborator,
  addCourseModule,
  addLesson,
  courseProgressFor,
  createCourse,
  enrolInCourse,
  moveCourseModule,
  moveLesson,
  removeCourseCollaborator,
  removeCourseModule,
  removeLesson,
  setCourseStatus,
  updateCourse,
  updateCourseModule,
  updateLesson,
} from "@/services/learning";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function editorPath(id: string): string {
  return UUID.test(id) ? `/studio/courses/${id}` : "/studio?tab=courses";
}

function lines(form: FormData, key: string, max = 10): string[] {
  const value = str(form, key);
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, max);
}

function skills(form: FormData): string[] {
  const value = str(form, "skills");
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

export async function createCourseAction(formData: FormData) {
  await runServerAction("/studio/courses/new", async () => {
    const user = await requireUserOrThrow();
    rateLimit(`course:${user.id}`, 10, 3_600_000);

    let coverImageId: string | null = null;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }

    const { id } = createCourse(user.id, {
      title: str(formData, "title"),
      summary: optional(formData, "summary"),
      body: optional(formData, "body"),
      category: optional(formData, "category"),
      skills: skills(formData),
      outcomes: lines(formData, "outcomes"),
      audience: optional(formData, "audience"),
      level: str(formData, "level", "beginner") as ResourceLevel,
      visibility: str(formData, "visibility", "public") as CourseVisibility,
      previewVideoUrl: optional(formData, "previewVideoUrl"),
      attribution: optional(formData, "attribution"),
      estimatedMinutes: int(formData, "estimatedMinutes", 0) || null,
      projectId: optional(formData, "projectId") ?? null,
      coverImageId,
    });

    return {
      path: `/studio/courses/${id}?notice=Course+draft+created.+Add+a+module+and+your+first+lesson.`,
      revalidate: ["/studio", "/studio?tab=courses", "/learn"],
    };
  });
}

export async function updateCourseAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    let coverImageId: string | null | undefined;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    } else if (bool(formData, "removeCover")) {
      coverImageId = null;
    }

    updateCourse(resourceId, user.id, {
      title: str(formData, "title"),
      summary: optional(formData, "summary") ?? null,
      body: optional(formData, "body") ?? null,
      category: optional(formData, "category") ?? null,
      skills: skills(formData),
      outcomes: lines(formData, "outcomes"),
      audience: optional(formData, "audience") ?? null,
      level: str(formData, "level", "beginner") as ResourceLevel,
      visibility: str(formData, "visibility", "public") as CourseVisibility,
      previewVideoUrl: optional(formData, "previewVideoUrl") ?? null,
      attribution: optional(formData, "attribution") ?? null,
      estimatedMinutes: int(formData, "estimatedMinutes", 0) || null,
      projectId: optional(formData, "projectId") ?? null,
      coverImageId,
    });

    return {
      path: `${editorPath(resourceId)}?notice=Course+details+saved.`,
      revalidate: [editorPath(resourceId), "/studio", `/learn/${resourceId}`, `/courses/${resourceId}`],
    };
  });
}

export async function setCourseStatusAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  const status = str(formData, "status", "draft");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    if (status !== "published" && status !== "unpublished" && status !== "archived") {
      throw new AppError("Unknown course status.");
    }
    if (status === "published") assertEmailVerified(user);
    setCourseStatus(resourceId, user.id, status);
    const notice =
      status === "published"
        ? "Course+published."
        : status === "unpublished"
          ? "Course+unpublished.+Learners+keep+their+progress+but+the+course+is+hidden+from+discovery."
          : "Course+archived.";
    return {
      path: `${editorPath(resourceId)}?notice=${notice}`,
      revalidate: [editorPath(resourceId), "/studio", "/learn", `/learn/${resourceId}`, `/courses/${resourceId}`],
    };
  });
}

export async function addModuleAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    addCourseModule(resourceId, user.id, {
      title: str(formData, "title"),
      description: optional(formData, "description") ?? null,
    });
    return {
      path: `${editorPath(resourceId)}?notice=Module+added.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`],
    };
  });
}

export async function updateModuleAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    updateCourseModule(str(formData, "moduleId"), user.id, {
      title: str(formData, "title"),
      description: optional(formData, "description") ?? null,
    });
    return {
      path: `${editorPath(resourceId)}?notice=Module+saved.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`],
    };
  });
}

export async function removeModuleAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    removeCourseModule(str(formData, "moduleId"), user.id);
    return {
      path: `${editorPath(resourceId)}?notice=Module+removed.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`],
    };
  });
}

export async function moveModuleAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    moveCourseModule(str(formData, "moduleId"), user.id, str(formData, "direction", "up") as "up" | "down");
    return { path: editorPath(resourceId), revalidate: [editorPath(resourceId), `/learn/${resourceId}`] };
  });
}

export async function addLessonAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  const moduleId = str(formData, "moduleId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    let mediaId: string | null = null;
    const attachment = file(formData, "attachment");
    if (attachment) {
      const stored = await saveUploadedFile(attachment, { ownerId: user.id, visibility: "private" });
      mediaId = stored.id;
    }
    addLesson(resourceId, moduleId, user.id, {
      title: str(formData, "title"),
      body: optional(formData, "body") ?? null,
      isFreePreview: bool(formData, "isFreePreview"),
      durationMinutes: int(formData, "durationMinutes", 0) || null,
      mediaId,
      videoUrl: optional(formData, "videoUrl") ?? null,
      externalUrl: optional(formData, "externalUrl") ?? null,
      externalLabel: optional(formData, "externalLabel") ?? null,
      externalAuthor: optional(formData, "externalAuthor") ?? null,
      projectId: optional(formData, "projectId") ?? null,
      exerciseTitle: optional(formData, "exerciseTitle") ?? null,
      exerciseInstructions: optional(formData, "exerciseInstructions") ?? null,
      exerciseHint: optional(formData, "exerciseHint") ?? null,
    });
    return {
      path: `${editorPath(resourceId)}?notice=Lesson+added.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`],
    };
  });
}

export async function updateLessonAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  const lessonId = str(formData, "lessonId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    let mediaId: string | null | undefined;
    const attachment = file(formData, "attachment");
    if (attachment) {
      const stored = await saveUploadedFile(attachment, { ownerId: user.id, visibility: "private" });
      mediaId = stored.id;
    } else if (bool(formData, "removeAttachment")) {
      mediaId = null;
    }
    updateLesson(lessonId, user.id, {
      title: str(formData, "title"),
      body: optional(formData, "body") ?? null,
      isFreePreview: bool(formData, "isFreePreview"),
      durationMinutes: int(formData, "durationMinutes", 0) || null,
      mediaId,
      videoUrl: optional(formData, "videoUrl") ?? null,
      externalUrl: optional(formData, "externalUrl") ?? null,
      externalLabel: optional(formData, "externalLabel") ?? null,
      externalAuthor: optional(formData, "externalAuthor") ?? null,
      projectId: optional(formData, "projectId") ?? null,
      exerciseTitle: optional(formData, "exerciseTitle") ?? null,
      exerciseInstructions: str(formData, "exerciseInstructions"),
      exerciseHint: optional(formData, "exerciseHint") ?? null,
    });
    return {
      path: `${editorPath(resourceId)}?notice=Lesson+saved.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`, `/learn/${resourceId}/lessons/${lessonId}`],
    };
  });
}

export async function removeLessonAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    removeLesson(str(formData, "lessonId"), user.id);
    return {
      path: `${editorPath(resourceId)}?notice=Lesson+removed.`,
      revalidate: [editorPath(resourceId), `/learn/${resourceId}`],
    };
  });
}

export async function moveLessonAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    moveLesson(str(formData, "lessonId"), user.id, str(formData, "direction", "up") as "up" | "down");
    return { path: editorPath(resourceId), revalidate: [editorPath(resourceId), `/learn/${resourceId}`] };
  });
}

export async function enrolCourseAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(`/learn/${resourceId}`, async () => {
    const user = await requireUserOrThrow();
    enrolInCourse(resourceId, user.id);
    // Send the learner straight to the first unfinished lesson, or the first one
    // if they have not started.
    const progress = courseProgressFor(user.id, resourceId);
    const first = progress.nextLessonId;
    return {
      path: first
        ? `/learn/${resourceId}/lessons/${first}?notice=You+are+enrolled.`
        : `/learn/${resourceId}?notice=You+are+enrolled.`,
      revalidate: [`/learn/${resourceId}`, "/learn", "/studio"],
    };
  });
}

export async function addCollaboratorAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    const person = addCourseCollaborator(resourceId, user.id, str(formData, "username"));
    return {
      path: `${editorPath(resourceId)}?notice=${encodeURIComponent(`${person.displayName} can now edit this course.`)}`,
      revalidate: [editorPath(resourceId)],
    };
  });
}

export async function removeCollaboratorAction(formData: FormData) {
  const resourceId = str(formData, "resourceId");
  await runServerAction(editorPath(resourceId), async () => {
    const user = await requireUserOrThrow();
    removeCourseCollaborator(resourceId, user.id, str(formData, "collaboratorId"));
    return {
      path: `${editorPath(resourceId)}?notice=Co-editor+removed.`,
      revalidate: [editorPath(resourceId)],
    };
  });
}
