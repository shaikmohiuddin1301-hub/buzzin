import { describe, expect, it } from "vitest";
import { createResource, listResources, myLearning, recordProgress, resourceDetail, addFeedback } from "@/services/learning";
import { createProduct, grantAccess, publishProduct, revokeAccess } from "@/services/commerce";
import { reputationSummary } from "@/lib/reputation";
import { makeUser } from "./helpers";

async function freeResource(creatorId: string) {
  return createResource(creatorId, {
    title: "Shipping a first prototype in a weekend",
    summary: "A practical walkthrough of scoping, building and testing a first prototype.",
    body: "Start with the smallest version that answers your question.",
    previewBody: "Preview text",
    topic: "Product",
    level: "beginner",
    format: "article",
    durationMinutes: 20,
    priceCents: 0,
    publish: true,
  });
}

describe("publishing learning content", () => {
  it("publishes free material that appears in discovery with its body readable", async () => {
    const creator = await makeUser();
    const { id } = await freeResource(creator.id);

    const listed = listResources({ q: "prototype" });
    expect(listed.map((row) => row.id)).toContain(id);

    const anonymous = resourceDetail(id, null)!;
    // Free material is readable without an account or an entitlement.
    expect(anonymous.body).toContain("smallest version");
    expect(anonymous.premium).toBe(false);

    expect(reputationSummary(creator.id).totals.teaching).toBeGreaterThan(0);
  });

  it("keeps drafts out of public discovery", async () => {
    const creator = await makeUser();
    const { id } = createResource(creator.id, {
      title: "Unfinished thoughts on testing",
      level: "beginner",
      format: "article",
      priceCents: 0,
      publish: false,
    });

    expect(listResources({ q: "Unfinished thoughts" }).map((row) => row.id)).not.toContain(id);
    expect(resourceDetail(id, null)).toBeNull();
    expect(resourceDetail(id, creator)).not.toBeNull();
  });

  it("insists on a free preview for anything paid", async () => {
    const creator = await makeUser();
    expect(() =>
      createResource(creator.id, {
        title: "Premium design systems course",
        level: "advanced",
        format: "course",
        priceCents: 4900,
        publish: true,
      }),
    ).toThrow(/free preview/i);
  });

  it("only lets project members publish material sourced from a project", async () => {
    const { makeProject } = await import("./helpers");
    const owner = await makeUser();
    const stranger = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    expect(() =>
      createResource(stranger.id, {
        title: "Borrowed project teach-in",
        level: "beginner",
        format: "article",
        priceCents: 0,
        projectId,
        publish: true,
      }),
    ).toThrow(/project team/i);
  });
});

describe("premium entitlements", () => {
  it("withholds paid bodies from the server response until access is granted", async () => {
    const creator = await makeUser();
    const learner = await makeUser();

    const { id: resourceId } = createResource(creator.id, {
      title: "Deep dive: designing a reputation system",
      summary: "A paid walkthrough of evidence-based reputation design.",
      body: "PAID-CONTENT-THAT-MUST-NOT-LEAK",
      previewBody: "In this course we look at contribution, expertise, teaching and influence.",
      level: "advanced",
      format: "course",
      priceCents: 2500,
      currency: "GBP",
      curriculum: {
        modules: [
          {
            title: "Fundamentals",
            lessons: [
              { title: "Why one score fails", body: "Free preview lesson body.", isFreePreview: true },
              { title: "Evidence trails", body: "Paid lesson body." },
            ],
          },
        ],
      },
      publish: true,
    });

    const productId = createProduct(creator.id, {
      title: "Reputation system deep dive",
      resourceId,
      priceCents: 2500,
      refundPolicy: "Full refund within 14 days, no questions asked.",
      format: "course",
      publish: true,
    });
    publishProduct(productId, creator.id);

    const before = resourceDetail(resourceId, learner)!;
    expect(before.premium).toBe(true);
    expect(before.entitled).toBe(false);
    expect(before.body).toBeNull();
    // Only the free preview lesson is returned; paid lessons are not sent at all.
    const lessonsBefore = before.curriculum.flatMap((module) => module.lessons);
    expect(lessonsBefore).toHaveLength(1);
    expect(lessonsBefore[0]!.isFreePreview).toBe(true);
    expect(lessonsBefore[0]!.body).toContain("Free preview");

    const { entitlementId } = grantAccess({
      productId,
      buyerEmailOrUsername: learner.email,
      grantedBy: creator.id,
      note: "Test grant - payments disabled in this build.",
    });

    const after = resourceDetail(resourceId, learner)!;
    expect(after.entitled).toBe(true);
    expect(after.body).toBe("PAID-CONTENT-THAT-MUST-NOT-LEAK");
    expect(myLearning(learner.id).purchased.map((row) => row.id)).toContain(resourceId);

    revokeAccess(entitlementId, creator.id, "Refund issued in test mode");
    expect(resourceDetail(resourceId, learner)!.body).toBeNull();
  });

  it("stops another creator granting or revoking access", async () => {
    const creator = await makeUser();
    const rival = await makeUser();
    const learner = await makeUser();

    const { id: resourceId } = createResource(creator.id, {
      title: "Another paid course about analytics",
      body: "Paid body",
      previewBody: "Preview body",
      level: "intermediate",
      format: "course",
      priceCents: 1500,
      publish: true,
    });
    const productId = createProduct(creator.id, {
      title: "Analytics course",
      resourceId,
      priceCents: 1500,
      refundPolicy: "14-day refund policy.",
      format: "course",
      publish: true,
    });

    expect(() =>
      grantAccess({ productId, buyerEmailOrUsername: learner.email, grantedBy: rival.id }),
    ).toThrow(/only the creator/i);

    const { entitlementId } = grantAccess({ productId, buyerEmailOrUsername: learner.email, grantedBy: creator.id });
    expect(() => revokeAccess(entitlementId, rival.id, "Not mine to revoke")).toThrow(/only the creator/i);
  });

  it("refuses a paid product without a refund policy", async () => {
    const creator = await makeUser();
    expect(() =>
      createProduct(creator.id, {
        title: "Course without terms",
        priceCents: 900,
        refundPolicy: "",
        format: "course",
        publish: true,
      }),
    ).toThrow(/refund policy/i);
  });
});

describe("learner activity", () => {
  it("tracks lesson completion and accepts feedback from learners only", async () => {
    const creator = await makeUser();
    const learner = await makeUser();
    const { id: resourceId } = await freeResource(creator.id);

    recordProgress(learner.id, resourceId, null, true);
    expect(myLearning(learner.id).inProgress.map((row) => row.resource.id)).toContain(resourceId);

    addFeedback(learner.id, resourceId, 5, "Clear and practical.");
    const detail = resourceDetail(resourceId, learner)!;
    expect(detail.feedback).toHaveLength(1);
    expect(detail.averageRating).toBe(5);

    expect(() => addFeedback(creator.id, resourceId, 5, "Self praise")).toThrow(/cannot rate your own/i);
    expect(() => addFeedback(learner.id, resourceId, 9)).toThrow(/between 1 and 5/i);
  });
});
