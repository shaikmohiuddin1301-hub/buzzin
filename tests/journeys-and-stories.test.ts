import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { learningJourneys, notifications } from "@/db/schema";
import { addWorkLogEntry, withdrawConsent } from "@/services/worklog";
import { approveJourney, draftJourneyFromTask, journeyDetail, publishJourney } from "@/services/learning";
import {
  generateStoryboard,
  publishStory,
  renderStoryboard,
  storyboardDetail,
  publishedStories,
  submitStoryForReview,
  decideStory,
} from "@/services/stories";
import { confirmScope, expressInterest, respondToInterest } from "@/services/tasks";
import { makeProject, makeTask, makeUser } from "./helpers";

/** Project with an assigned contributor and two public documentation entries. */
async function documentedTask() {
  const owner = await makeUser();
  const contributor = await makeUser();
  const { id: projectId } = makeProject(owner.id, { allowPublicDocs: true });
  const taskId = makeTask(projectId, owner.id);

  const eoiId = expressInterest(contributor.id, { projectId, taskId, intent: "help_task" });
  respondToInterest(eoiId, owner, "accepted");
  confirmScope(taskId, contributor.id);

  addWorkLogEntry(taskId, contributor.id, {
    kind: "decision",
    title: "Chose an event-sourced ledger",
    body: "We compared a mutable table with an append-only ledger and picked the ledger because audits matter more than query speed here.",
    visibility: "public",
  });
  addWorkLogEntry(taskId, contributor.id, {
    kind: "challenge",
    title: "Migration broke the seed data",
    body: "The first migration dropped a column the seed script still wrote to. We added a test that runs migrations before seeding.",
    visibility: "public",
  });

  return { owner, contributor, projectId, taskId };
}

describe("learning journeys", () => {
  it("drafts a cited journey from approved documentation", async () => {
    const { contributor, taskId } = await documentedTask();
    const { journeyId, skipped } = draftJourneyFromTask(taskId, contributor.id);

    const detail = journeyDetail(journeyId, contributor)!;
    expect(skipped).toBe(0);
    expect(detail.journey.visibility).toBe("private");
    expect(detail.steps).toHaveLength(2);
    expect(detail.steps.every((step) => step.sourceType === "work_log" && step.sourceId)).toBe(true);
  });

  it("never cites another contributor's unapproved notes, even for the project owner", async () => {
    const { owner, contributor, taskId } = await documentedTask();
    addWorkLogEntry(taskId, contributor.id, {
      kind: "note",
      title: "Landowner access changed",
      body: "We lost permission for the bank and paused the site rather than trespass. This is not approved for public use.",
      visibility: "public_pending",
    });

    const { journeyId, skipped } = draftJourneyFromTask(taskId, owner.id);
    const detail = journeyDetail(journeyId, owner)!;

    // The two public entries are cited; the contributor's private note is skipped
    // with a count rather than throwing halfway through the draft.
    expect(skipped).toBe(1);
    expect(detail.steps).toHaveLength(2);
    expect(detail.steps.map((step) => step.title)).not.toContain("Landowner access changed");
  });

  it("requires owner approval before a project-linked journey goes public", async () => {
    const { owner, contributor, taskId } = await documentedTask();
    const { journeyId } = draftJourneyFromTask(taskId, contributor.id);

    expect(() => publishJourney(journeyId, contributor.id)).toThrow(/owner must approve/i);

    // A stranger cannot approve or publish it either.
    const stranger = await makeUser();
    expect(() => approveJourney(journeyId, { id: stranger.id })).toThrow();
    expect(() => publishJourney(journeyId, stranger.id)).toThrow();

    approveJourney(journeyId, owner);

    // The approval notification must open the journey itself, not a resource page
    // that happens to share the `/learn/` prefix.
    const approval = getDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, contributor.id), eq(notifications.kind, "story_approval")))
      .get();
    expect(approval?.href).toBe(`/learn/journeys/${journeyId}`);

    publishJourney(journeyId, contributor.id);

    expect(getDb().select().from(learningJourneys).where(eq(learningJourneys.id, journeyId)).get()!.status).toBe("published");
    expect(journeyDetail(journeyId, null)).not.toBeNull();
  });

  it("refuses to publish a journey with fewer than two steps", async () => {
    const creator = await makeUser();
    const { createJourney, addJourneyStep } = await import("@/services/learning");
    const journeyId = createJourney(creator.id, { title: "Too short", visibility: "public" });
    addJourneyStep(journeyId, creator.id, { title: "Only step", body: "Nothing else yet." });
    expect(() => publishJourney(journeyId, creator.id)).toThrow(/at least two steps/i);
  });
});

describe("AI project story", () => {
  it("is restricted to the project owner", async () => {
    const { owner, contributor, projectId } = await documentedTask();
    await expect(generateStoryboard(projectId, { id: contributor.id })).rejects.toThrow();
    await expect(generateStoryboard(projectId, { id: owner.id })).resolves.toBeTruthy();
  });

  it("cites every scene to a source record and asks for review before publishing", async () => {
    const { owner, projectId } = await documentedTask();
    const { id: storyboardId, warnings } = await generateStoryboard(projectId, owner);
    expect(warnings).toEqual([]);

    const detail = storyboardDetail(storyboardId, owner)!;
    expect(detail.scenes.length).toBeGreaterThanOrEqual(3); // opening card + two entries
    const sourced = detail.scenes.filter((scene) => scene.sourceType === "work_log");
    expect(sourced).toHaveLength(2);
    expect(sourced.every((scene) => !!scene.sourceId)).toBe(true);
    expect(detail.scenes.every((scene) => scene.narration.length > 0)).toBe(true);

    // Not public yet, and outsiders cannot see the draft.
    const outsider = await makeUser();
    expect(storyboardDetail(storyboardId, outsider)).toBeNull();

    submitStoryForReview(storyboardId, owner);
    decideStory(storyboardId, owner, "approved", "Checked against the work log.");
    await expect(publishStory(storyboardId, owner)).rejects.toThrow(/render the animated explainer/i);

    await renderStoryboard(storyboardId, owner);
    await publishStory(storyboardId, owner);

    expect(publishedStories(20).some((row) => row.board.id === storyboardId)).toBe(true);
    expect(storyboardDetail(storyboardId, outsider)).not.toBeNull();
  });

  it("does not invent contributors: withdrawn consent removes their material", async () => {
    const { owner, contributor, projectId } = await documentedTask();
    const first = await generateStoryboard(projectId, owner);
    const before = storyboardDetail(first.id, owner)!.scenes.length;

    withdrawConsent(contributor.id, projectId);
    const second = await generateStoryboard(projectId, owner);
    const after = storyboardDetail(second.id, owner)!;

    expect(after.scenes.length).toBeLessThan(before);
    expect(after.scenes.filter((scene) => scene.sourceType === "work_log")).toHaveLength(0);
    // Withdrawal pulls the entries back to team scope, so the generator reports
    // that it no longer has approved material instead of narrating it anyway.
    expect(second.warnings.some((warning) => /not enough approved documentation/i.test(warning))).toBe(true);
  });

  it("cannot be approved before it is submitted for review", async () => {
    const { owner, projectId } = await documentedTask();
    const { id } = await generateStoryboard(projectId, owner);
    expect(() => decideStory(id, owner, "approved", "Looks fine")).toThrow(/not awaiting review/i);
  });
});
