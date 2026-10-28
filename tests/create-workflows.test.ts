import { describe, expect, it } from "vitest";
import { createPost, feed, postsByAuthor } from "@/services/social";
import { postProjectUpdate, projectDetail } from "@/services/projects";
import { createResource, listResources, resourceDetail } from "@/services/learning";
import { makeProject, makeUser } from "./helpers";

describe("Share a learning", () => {
  it("keeps the lesson, topic and supporting link on a published entry", async () => {
    const learner = await makeUser();
    const title = "The enclosure caused the sensor drift";

    const postId = createPost(learner.id, {
      title,
      topic: "Sensor calibration",
      linkUrl: "https://example.test/field-notes",
      body: "Two weeks of readings showed the bigger error came from the enclosure.\n\nKey takeaways:\nVent the housing.",
      kind: "lesson",
      publish: true,
    });

    const learningFeed = feed(null, "learning");
    const entry = learningFeed.find((post) => post.id === postId);
    expect(entry).toBeTruthy();
    expect(entry?.title).toBe(title);
    expect(entry?.topic).toBe("Sensor calibration");
    expect(entry?.linkUrl).toBe("https://example.test/field-notes");
    expect(entry?.body).toContain("Key takeaways");
  });

  it("saves a draft without putting it in the public learning feed", async () => {
    const learner = await makeUser();
    const postId = createPost(learner.id, {
      title: "A draft lesson",
      body: "Not ready to share yet.",
      kind: "lesson",
      publish: false,
    });

    expect(feed(null, "learning").map((post) => post.id)).not.toContain(postId);
    // The author still sees their own draft on their profile.
    expect(postsByAuthor(learner.id, learner.id).map((post) => post.id)).toContain(postId);
  });

  it("rejects a supporting link that is not a web address", async () => {
    const learner = await makeUser();
    expect(() =>
      createPost(learner.id, {
        title: "Broken link",
        body: "This should not be stored.",
        linkUrl: "field notes",
        publish: true,
      }),
    ).toThrow(/http/);
  });
});

describe("Share an update", () => {
  it("stores progress and a milestone on a published project update", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const title = "The first enclosure is waterproof";

    postProjectUpdate(projectId, owner, {
      title,
      body: "We assembled the first prototype and recorded a week of readings.",
      visibility: "public",
      progressPercent: 40,
      milestone: "Working prototype",
      linkUrl: "https://example.test/readings",
    });

    const detail = projectDetail(projectId, owner)!;
    const update = detail.updates.find((row) => row.title === title)!;
    expect(update.progressPercent).toBe(40);
    expect(update.milestone).toBe("Working prototype");
    expect(update.linkUrl).toBe("https://example.test/readings");
    expect(update.status).toBe("published");

    // A published public project update is mirrored into the feed for discovery.
    const mirrored = feed(null, "updates").find((post) => post.title === title);
    expect(mirrored).toBeTruthy();
    expect(mirrored?.projectId).toBe(projectId);
  });

  it("keeps a draft update inside the project and out of the public feed", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const title = "Draft: enclosure revision two";

    postProjectUpdate(projectId, owner, {
      title,
      body: "Still checking the seal before anyone sees this.",
      visibility: "public",
      publish: false,
    });

    expect(projectDetail(projectId, owner)!.updates.map((row) => row.title)).toContain(title);
    expect(feed(null, "updates").map((post) => post.title)).not.toContain(title);

    const stranger = await makeUser();
    expect(projectDetail(projectId, stranger)!.updates.map((row) => row.title)).not.toContain(title);
  });

  it("rejects progress outside 0–100", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    expect(() =>
      postProjectUpdate(projectId, owner, {
        title: "Impossible progress",
        body: "This should not be stored because the number is invalid.",
        visibility: "public",
        progressPercent: 140,
      }),
    ).toThrow(/0 and 100/);
  });
});

describe("New teaching", () => {
  it("publishes objectives that appear on the resource and in discovery", async () => {
    const teacher = await makeUser();
    const title = "Reading a river gauge in ten minutes";

    const { id } = createResource(teacher.id, {
      title,
      summary: "A practical walkthrough of measuring flow from a gauge board.",
      body: "Start by finding the zero mark on the board.",
      topic: "Hydrology",
      outcomes: ["Explain how a river gauge measures flow", "Choose the right sensor for a field site"],
      level: "beginner",
      format: "article",
      durationMinutes: 10,
      priceCents: 0,
      publish: true,
    });

    const detail = resourceDetail(id, null)!;
    expect(detail.resource.title).toBe(title);
    expect(detail.resource.outcomes).toEqual([
      "Explain how a river gauge measures flow",
      "Choose the right sensor for a field site",
    ]);
    expect(listResources({ q: "river gauge" }).map((resource) => resource.id)).toContain(id);
    // Publishing teaching also creates a feed pointer rather than a second copy.
    expect(feed(null, "learning").some((post) => post.body.startsWith(title))).toBe(true);
  });

  it("keeps an unpublished teaching draft out of discovery", async () => {
    const teacher = await makeUser();
    const { id } = createResource(teacher.id, {
      title: "Draft teaching about flood marks",
      summary: "Not ready for learners yet.",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: false,
    });

    expect(listResources({ q: "flood marks" }).map((resource) => resource.id)).not.toContain(id);
    expect(resourceDetail(id, null)).toBeNull();
    expect(resourceDetail(id, teacher)?.resource.status).toBe("draft");
  });
});
