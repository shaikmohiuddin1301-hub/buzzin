import { describe, expect, it } from "vitest";
import { makeProject, makeTask, makeUser } from "./helpers";
import { createPost, feed, postDetail, postsByAuthor } from "@/services/social";
import { acceptedWorkForUser, learningHistoryFor, sharesLearningHistory } from "@/services/profileContent";
import { createResource, recordProgress } from "@/services/learning";
import { assignContributor, reviewSubmission, submitWork } from "@/services/tasks";
import { updatePreferences } from "@/services/users";

describe("posts and visibility", () => {
  it("keeps drafts out of feeds and other people's profile views", async () => {
    const author = await makeUser();
    const viewer = await makeUser();

    const draftId = createPost(author.id, { body: "A draft thought about the sensor housing.", publish: false });
    const publishedId = createPost(author.id, { body: "The sensor housing prototype is assembled.", publish: true });

    expect(feed({ id: viewer.id }, "for_you", { limit: 50 }).map((post) => post.id)).toContain(publishedId);
    expect(feed({ id: viewer.id }, "for_you", { limit: 50 }).map((post) => post.id)).not.toContain(draftId);

    expect(postsByAuthor(author.id, author.id, 50).map((post) => post.id)).toEqual(
      expect.arrayContaining([draftId, publishedId]),
    );
    expect(postsByAuthor(author.id, viewer.id, 50).map((post) => post.id)).not.toContain(draftId);
  });

  it("hides private posts from everyone except the author", async () => {
    const author = await makeUser();
    const viewer = await makeUser();
    const privateId = createPost(author.id, {
      body: "Notes from the workshop that are not ready to share.",
      visibility: "private",
      publish: true,
    });

    expect(feed({ id: viewer.id }, "for_you", { limit: 50 }).map((post) => post.id)).not.toContain(privateId);
    expect(postDetail(privateId, { id: viewer.id })).toBeNull();
    expect(postDetail(privateId, { id: author.id })?.post.id).toBe(privateId);
    expect(postsByAuthor(author.id, viewer.id, 50)).toHaveLength(0);
  });

  it("refuses an image that does not belong to the author", async () => {
    const author = await makeUser();
    expect(() =>
      createPost(author.id, { body: "Attaching something that is not mine.", imageId: "00000000-0000-0000-0000-000000000000" }),
    ).toThrow(/not yours/i);
  });
});

describe("accepted work on profiles", () => {
  it("uses the attribution record and its approved deliverable", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id, { title: "Assemble the first housing" });
    assignContributor(taskId, owner, contributor.id);

    const submissionId = submitWork(taskId, contributor.id, {
      note: "Housing assembled and pressure tested.",
      files: [{ title: "Assembly photos", url: "https://example.test/photos" }],
    });
    reviewSubmission(submissionId, owner, "accepted");

    const records = acceptedWorkForUser(contributor.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.projectName).toBeTruthy();
    expect(records[0]!.verificationMethod).toBe("owner_confirmed");
    expect(records[0]!.deliverable?.title).toBe("Assembly photos");

    expect(acceptedWorkForUser((await makeUser()).id)).toHaveLength(0);
  });
});

describe("learning history privacy", () => {
  it("records completion and only shares it after an explicit opt-in", async () => {
    const learner = await makeUser();
    const creator = await makeUser();
    const { id: resourceId } = createResource(creator.id, {
      title: "Reading a river gauge",
      summary: "How to read a gauge without a hydrology degree.",
      body: "Start with the staff gauge.",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: true,
    });

    recordProgress(learner.id, resourceId, null, true);

    const history = learningHistoryFor(learner.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.resourceId).toBe(resourceId);
    expect(history[0]!.creatorName).toBeTruthy();

    expect(sharesLearningHistory(learner.id)).toBe(false);
    updatePreferences(learner.id, { shareLearningHistory: true });
    expect(sharesLearningHistory(learner.id)).toBe(true);
  });

  it("does not list a resource the learner only opened", async () => {
    const learner = await makeUser();
    const creator = await makeUser();
    const { id: resourceId } = createResource(creator.id, {
      title: "Fieldnotes on enclosure design",
      level: "intermediate",
      format: "article",
      priceCents: 0,
      publish: true,
    });

    recordProgress(learner.id, resourceId, null, false);
    expect(learningHistoryFor(learner.id)).toHaveLength(0);
  });
});

