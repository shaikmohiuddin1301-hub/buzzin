import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { courseEnrollments } from "@/db/schema";
import { getProjectAccess } from "@/lib/authz";
import { saveMedia } from "@/lib/storage";
import { acceptedWorkForUser } from "@/services/profileContent";
import { postsByAuthor } from "@/services/social";
import {
  addCourseCollaborator,
  addCourseModule,
  addLesson,
  courseAnalytics,
  courseEditorData,
  courseProgressFor,
  courseSummariesForCreator,
  createCourse,
  enrolInCourse,
  listResources,
  moveCourseModule,
  moveLesson,
  recordProgress,
  removeCourseCollaborator,
  removeLesson,
  resourcesForCreator,
  resourceDetail,
  setCourseStatus,
  updateCourse,
  updateCourseModule,
  updateLesson,
} from "@/services/learning";
import { makeProject, makeUser } from "./helpers";

async function publishedCourse(creatorId: string, options: { lessons?: number; projectId?: string | null } = {}) {
  const label = `Course ${Math.random().toString(36).slice(2, 8)}`;
  const { id } = createCourse(creatorId, {
    title: label,
    summary: "A practical course built from a real project, with clear outcomes and credited external material.",
    body: "You will build a small, complete thing and explain the decisions along the way.",
    category: "software",
    skills: ["TypeScript", "Testing"],
    outcomes: ["Build a small working feature", "Explain a trade-off in writing"],
    audience: "Developers who can read basic code.",
    level: "beginner",
    visibility: "public",
    estimatedMinutes: 90,
    projectId: options.projectId ?? null,
  });
  const moduleId = addCourseModule(id, creatorId, { title: "Foundations", description: "The minimum useful version." });
  const lessonCount = options.lessons ?? 2;
  const lessonIds: string[] = [];
  for (let index = 0; index < lessonCount; index += 1) {
    lessonIds.push(
      addLesson(id, moduleId, creatorId, {
        title: `Lesson ${index + 1}`,
        body: `Lesson body ${index + 1}. Do the work, then compare your result.`,
        durationMinutes: 20,
        isFreePreview: index === 0,
        exerciseInstructions: index === 0 ? "Write a short note explaining what you built." : null,
      }),
    );
  }
  setCourseStatus(id, creatorId, "published");
  return { id, moduleId, lessonIds };
}

describe("course creation and structure", () => {
  it("saves a draft with optional details missing and keeps it private", async () => {
    const creator = await makeUser();
    const { id } = createCourse(creator.id, {
      title: "A course with only the essentials",
      visibility: "public",
    });

    const draft = courseEditorData(id, creator)!;
    expect(draft.resource.status).toBe("draft");
    expect(draft.course?.visibility).toBe("public");
    expect(draft.curriculum).toHaveLength(0);
    expect(resourceDetail(id, null)).toBeNull();
    expect(listResources({ q: "only the essentials" })).toHaveLength(0);

    updateCourse(id, creator.id, {
      title: "A course with only the essentials",
      summary: "Now it has a description.",
      outcomes: ["One real outcome"],
    });
    expect(courseEditorData(id, creator)!.course?.outcomes).toEqual(["One real outcome"]);
  });

  it("adds, edits and reorders modules and lessons", async () => {
    const creator = await makeUser();
    const { id, moduleId, lessonIds } = await publishedCourse(creator.id, { lessons: 3 });

    const secondModule = addCourseModule(id, creator.id, {
      title: "Putting it together",
      description: "A larger exercise.",
    });
    moveCourseModule(secondModule, creator.id, "up");
    let data = courseEditorData(id, creator)!;
    expect(data.curriculum.map((module) => module.title)).toEqual(["Putting it together", "Foundations"]);

    updateCourseModule(moduleId, creator.id, { title: "Foundations, revised", description: "Updated description." });
    updateLesson(lessonIds[1]!, creator.id, {
      title: "Lesson two, revised",
      body: "A clearer explanation.",
      exerciseInstructions: "Try the exercise again with a smaller example.",
      exerciseHint: "Start with one field.",
    });
    moveLesson(lessonIds[1]!, creator.id, "up");

    data = courseEditorData(id, creator)!;
    const foundations = data.curriculum.find((module) => module.id === moduleId)!;
    expect(foundations.description).toBe("Updated description.");
    expect(foundations.lessons.map((lesson) => lesson.title)).toEqual([
      "Lesson two, revised",
      "Lesson 1",
      "Lesson 3",
    ]);
    expect(data.exercises.find((exercise) => exercise.lessonId === lessonIds[1])?.instructions).toContain("smaller example");

    removeLesson(lessonIds[2]!, creator.id);
    expect(courseEditorData(id, creator)!.curriculum.find((module) => module.id === moduleId)!.lessons).toHaveLength(2);
  });

  it("stores YouTube and external resource links with attribution and rejects unsafe links", async () => {
    const creator = await makeUser();
    const { id, moduleId } = await publishedCourse(creator.id, { lessons: 1 });

    const lessonId = addLesson(id, moduleId, creator.id, {
      title: "Watch the original walkthrough",
      body: "Watch first, then adapt the idea to your own project.",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      externalUrl: "https://www.instagram.com/p/Cabcdefghij/",
      externalLabel: "Instagram carousel",
      externalAuthor: "Example Educator",
    });
    const lesson = courseEditorData(id, creator)!.curriculum.flatMap((module) => module.lessons).find((row) => row.id === lessonId)!;
    expect(lesson.videoUrl).toContain("youtube.com/watch");
    expect(lesson.externalUrl).toContain("instagram.com");
    expect(lesson.externalAuthor).toBe("Example Educator");

    expect(() =>
      addLesson(id, moduleId, creator.id, {
        title: "Unsafe embed",
        videoUrl: "javascript:alert(1)",
      }),
    ).toThrow(/http\(s\)/i);
    expect(() =>
      addLesson(id, moduleId, creator.id, {
        title: "Unsafe resource",
        externalUrl: "data:text/html,hello",
      }),
    ).toThrow(/http\(s\)/i);
  });
});

describe("course publication and discovery", () => {
  it("refuses to publish an empty course, then publishes and unpublishes correctly", async () => {
    const creator = await makeUser();
    const visitor = await makeUser();
    const { id } = createCourse(creator.id, { title: "An empty course that should not go live" });
    expect(() => setCourseStatus(id, creator.id, "published")).toThrow(/at least one module/i);

    const moduleId = addCourseModule(id, creator.id, { title: "Start here" });
    addLesson(id, moduleId, creator.id, { title: "The first lesson", body: "Read this." });
    setCourseStatus(id, creator.id, "published");

    expect(listResources({ q: "empty course" }).map((row) => row.id)).toContain(id);
    const anonymous = resourceDetail(id, null)!;
    expect(anonymous.course?.visibility).toBe("public");
    expect(anonymous.courseProgress?.totalLessons).toBe(1);
    // Publishing creates a feed pointer; it is visible while the course is live.
    expect(postsByAuthor(creator.id, visitor.id, 50).some((post) => post.resourceId === id)).toBe(true);

    updateCourse(id, creator.id, { title: "An empty course that should not go live, revised" });
    expect(listResources({ q: "revised" }).map((row) => row.id)).toContain(id);

    setCourseStatus(id, creator.id, "unpublished");
    expect(listResources({ q: "revised" }).map((row) => row.id)).not.toContain(id);
    expect(resourceDetail(id, null)).toBeNull();
    expect(resourceDetail(id, creator)?.resource.status).toBe("unpublished");
    // The post record remains, but a visitor no longer sees a pointer to a dead course.
    expect(postsByAuthor(creator.id, visitor.id, 50).some((post) => post.resourceId === id)).toBe(false);
    expect(postsByAuthor(creator.id, creator.id, 50).some((post) => post.resourceId === id)).toBe(true);

    setCourseStatus(id, creator.id, "archived");
    expect(courseEditorData(id, creator)?.resource.status).toBe("archived");
  });

  it("keeps private and link-only courses out of discovery but handles direct links correctly", async () => {
    const creator = await makeUser();
    const stranger = await makeUser();

    const { id: privateId } = createCourse(creator.id, {
      title: "A private paid client course",
      visibility: "private",
    });
    const privateModule = addCourseModule(privateId, creator.id, { title: "Private module" });
    addLesson(privateId, privateModule, creator.id, { title: "Private lesson", body: "Confidential." });
    setCourseStatus(privateId, creator.id, "published");

    expect(listResources({ q: "private paid client" })).toHaveLength(0);
    expect(resourceDetail(privateId, null)).toBeNull();
    expect(resourceDetail(privateId, stranger)).toBeNull();
    expect(resourceDetail(privateId, creator)).not.toBeNull();
    expect(() => enrolInCourse(privateId, stranger.id)).toThrow(/private/i);

    const { id: linkOnlyId } = createCourse(creator.id, {
      title: "A link-only course for a workshop cohort",
      visibility: "invite_only",
    });
    const linkModule = addCourseModule(linkOnlyId, creator.id, { title: "Cohort module" });
    addLesson(linkOnlyId, linkModule, creator.id, { title: "Cohort lesson", body: "Shared by link." });
    setCourseStatus(linkOnlyId, creator.id, "published");

    expect(listResources({ q: "link-only course" })).toHaveLength(0);
    expect(resourceDetail(linkOnlyId, null)).not.toBeNull();
  });

  it("connects published courses to the creator profile data", async () => {
    const creator = await makeUser();
    const { id } = await publishedCourse(creator.id);
    const listed = resourcesForCreator(creator.id).find((resource) => resource.id === id)!;
    expect(listed.status).toBe("published");
    expect(listed.courseVisibility).toBe("public");
  });
});

describe("learner enrolment and progress", () => {
  it("enrols once, persists progress and computes completion from lesson records", async () => {
    const creator = await makeUser();
    const learner = await makeUser();
    const other = await makeUser();
    const { id, lessonIds } = await publishedCourse(creator.id, { lessons: 2 });

    const first = enrolInCourse(id, learner.id);
    const second = enrolInCourse(id, learner.id);
    expect(second.id).toBe(first.id);
    const rows = getDb()
      .select()
      .from(courseEnrollments)
      .where(and(eq(courseEnrollments.resourceId, id), eq(courseEnrollments.userId, learner.id)))
      .all();
    expect(rows).toHaveLength(1);

    recordProgress(learner.id, id, lessonIds[0]!, true);
    const halfway = resourceDetail(id, learner)!;
    expect(halfway.progressPct).toBe(50);
    expect(halfway.courseProgress?.completedLessons).toBe(1);
    expect(halfway.enrollment?.status).toBe("active");

    // A fresh read is the same persisted state a new session sees.
    expect(courseProgressFor(learner.id, id).pct).toBe(50);
    expect(resourceDetail(id, learner)!.progressPct).toBe(50);
    // Another learner has their own progress and cannot see this learner's rows.
    expect(resourceDetail(id, other)!.progressPct).toBe(0);
    expect(resourceDetail(id, other)!.progress).toHaveLength(0);

    recordProgress(learner.id, id, lessonIds[1]!, true);
    const complete = resourceDetail(id, learner)!;
    expect(complete.progressPct).toBe(100);
    expect(complete.enrollment?.status).toBe("completed");
    expect(complete.nextLessonId).toBeNull();

    recordProgress(learner.id, id, lessonIds[1]!, false);
    expect(resourceDetail(id, learner)!.progressPct).toBe(50);
    expect(resourceDetail(id, learner)!.enrollment?.status).toBe("active");
  });

  it("refuses progress on a lesson from another course or without course access", async () => {
    const creator = await makeUser();
    const otherCreator = await makeUser();
    const learner = await makeUser();
    const { id, lessonIds } = await publishedCourse(creator.id, { lessons: 2 });
    const otherCourse = await publishedCourse(otherCreator.id, { lessons: 1 });

    expect(() => recordProgress(learner.id, id, otherCourse.lessonIds[0]!, true)).toThrow(/does not belong/i);

    const { id: privateId } = createCourse(creator.id, {
      title: "A private course unknown to the learner",
      visibility: "private",
    });
    const moduleId = addCourseModule(privateId, creator.id, { title: "Secret" });
    const privateLesson = addLesson(privateId, moduleId, creator.id, { title: "Secret lesson", body: "Secret." });
    setCourseStatus(privateId, creator.id, "published");
    expect(() => recordProgress(learner.id, privateId, privateLesson, true)).toThrow(/private/i);

    const draftCourse = await publishedCourse(creator.id, { lessons: 1 });
    setCourseStatus(draftCourse.id, creator.id, "unpublished");
    expect(() => recordProgress(learner.id, draftCourse.id, draftCourse.lessonIds[0]!, true)).toThrow(/not published/i);
  });

  it("reports honest analytics and separates course completion from accepted work", async () => {
    const creator = await makeUser();
    const learner = await makeUser();
    const project = makeProject(creator.id, {
      name: "Private practice project for a course",
      visibility: "private",
      publish: false,
    });
    const { id, lessonIds } = await publishedCourse(creator.id, { lessons: 2, projectId: project.id });

    let analytics = courseAnalytics(creator.id);
    expect(analytics.totals.learners).toBe(0);
    expect(analytics.totals.completions).toBe(0);

    enrolInCourse(id, learner.id);
    recordProgress(learner.id, id, lessonIds[0]!, true);
    analytics = courseAnalytics(creator.id);
    expect(analytics.totals.learners).toBe(1);
    expect(analytics.totals.completions).toBe(0);
    expect(courseSummariesForCreator(creator.id).find((row) => row.resource.id === id)?.stats.averagePct).toBe(50);

    recordProgress(learner.id, id, lessonIds[1]!, true);
    analytics = courseAnalytics(creator.id);
    expect(analytics.totals.completions).toBe(1);
    expect(analytics.averagePct).toBe(100);

    // Enrolling and finishing a course does not create a project contribution,
    // and a private practice project stays private.
    expect(acceptedWorkForUser(learner.id)).toHaveLength(0);
    expect(getProjectAccess(project.id, learner)).toMatchObject({ canView: false, isMember: false });

    // Course completion never invents accepted work for the creator either.
    expect(acceptedWorkForUser(creator.id)).toHaveLength(0);
  });
});

describe("course permissions", () => {
  it("stops another creator editing or publishing, and supports owner-managed co-editors", async () => {
    const owner = await makeUser();
    const rival = await makeUser();
    const coEditor = await makeUser();
    const { id, moduleId } = await publishedCourse(owner.id, { lessons: 1 });

    expect(() => updateCourse(id, rival.id, { title: "Stolen course" })).toThrow(/creator or co-editors/i);
    expect(() => addCourseModule(id, rival.id, { title: "Rival module" })).toThrow(/creator or co-editors/i);
    expect(() => setCourseStatus(id, rival.id, "unpublished")).toThrow(/creator/i);
    expect(courseEditorData(id, rival)).toBeNull();

    addCourseCollaborator(id, owner.id, coEditor.username);
    expect(courseEditorData(id, coEditor)).not.toBeNull();
    updateCourse(id, coEditor.id, { summary: "An improved summary written by a co-editor." });
    addCourseModule(id, coEditor.id, { title: "A co-editor's module" });
    expect(() => setCourseStatus(id, coEditor.id, "unpublished")).toThrow(/creator can publish/i);

    removeCourseCollaborator(id, owner.id, coEditor.id);
    expect(courseEditorData(id, coEditor)).toBeNull();
    expect(() => updateCourse(id, coEditor.id, { title: "No longer allowed" })).toThrow(/creator or co-editors/i);
  });

  it("refuses a project link the editor cannot see", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const privateProject = makeProject(outsider.id, {
      name: "Someone else's private project",
      visibility: "private",
      publish: false,
    });
    const { id } = createCourse(owner.id, { title: "A course with an invalid practice project" });
    expect(() => updateCourse(id, owner.id, { projectId: privateProject.id })).toThrow(/cannot see/i);
  });
});

describe("upload validation", () => {
  it("accepts a real PDF and refuses mismatched bytes or disallowed types", async () => {
    const user = await makeUser();
    const pdf = await saveMedia({
      buffer: Buffer.from("%PDF-1.4\nsmall test"),
      filename: "worksheet.pdf",
      mimeType: "application/pdf",
      ownerId: user.id,
      visibility: "private",
    });
    expect(pdf.mimeType).toBe("application/pdf");

    await expect(
      saveMedia({
        buffer: Buffer.from("<html>not a pdf</html>"),
        filename: "fake.pdf",
        mimeType: "application/pdf",
        ownerId: user.id,
      }),
    ).rejects.toThrow(/contents do not match/i);

    await expect(
      saveMedia({
        buffer: Buffer.from("<html>script</html>"),
        filename: "page.html",
        mimeType: "text/html",
        ownerId: user.id,
      }),
    ).rejects.toThrow(/not allowed/i);
  });
});
