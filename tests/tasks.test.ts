import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tasks } from "@/db/schema";
import { createTask, confirmScope, listAttributions, reviewSubmission, submitWork } from "@/services/tasks";
import { expressInterest, respondToInterest } from "@/services/tasks";
import { listWorkLogEntries, addWorkLogEntry } from "@/services/worklog";
import { reputationSummary } from "@/lib/reputation";
import { makeProject, makeTask, makeUser, taskInput } from "./helpers";

function taskRow(taskId: string) {
  return getDb().select().from(tasks).where(eq(tasks.id, taskId)).get()!;
}

/** Runs the happy path up to an assigned, scope-confirmed in-progress task. */
async function assignedTask(options: { allowPublicDocs?: boolean } = {}) {
  const owner = await makeUser();
  const contributor = await makeUser();
  const { id: projectId } = makeProject(owner.id, { allowPublicDocs: options.allowPublicDocs ?? true });
  const taskId = makeTask(projectId, owner.id);

  const eoiId = expressInterest(contributor.id, {
    projectId,
    taskId,
    intent: "help_task",
    message: "I have done similar work before.",
  });
  respondToInterest(eoiId, owner, "accepted");
  confirmScope(taskId, contributor.id);

  return { owner, contributor, projectId, taskId };
}

describe("task creation", () => {
  it("only lets the project owner create tasks", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    expect(() => createTask(projectId, { id: other.id }, taskInput())).toThrow();
  });

  it("requires acceptance criteria and a stated return for unpaid work", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    expect(() => createTask(projectId, owner, taskInput({ acceptanceCriteria: "" }))).toThrow(/acceptance criteria/i);
    expect(() => createTask(projectId, owner, taskInput({ compensationType: "unpaid", compensationDetails: "" }))).toThrow(
      /unpaid contributors receive/i,
    );
  });

  it("keeps an unpublished task as a draft that outsiders cannot see", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = createTask(projectId, owner, taskInput({ publish: false }));

    expect(taskRow(taskId).status).toBe("draft");
    expect(() =>
      expressInterest(outsider.id, { projectId, taskId, intent: "help_task" }),
    ).toThrow(/not currently accepting interest/i);
  });
});

describe("interest to assignment", () => {
  it("assigns the accepted contributor and moves the task forward", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    const eoiId = expressInterest(contributor.id, { projectId, taskId, intent: "help_task" });
    expect(taskRow(taskId).status).toBe("reviewing_interest");

    respondToInterest(eoiId, owner, "accepted");
    expect(taskRow(taskId).status).toBe("assigned");

    confirmScope(taskId, contributor.id);
    expect(taskRow(taskId).status).toBe("in_progress");
  });

  it("will not let an outsider submit work", async () => {
    const { taskId } = await assignedTask();
    const stranger = await makeUser();
    expect(() => submitWork(taskId, stranger.id, { note: "Sneaky submission", files: [] })).toThrow();
  });

  it("only the assignee can confirm the scope", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);
    expect(() => confirmScope(taskId, owner.id)).toThrow(/assigned contributor/i);
  });
});

describe("submission and review", () => {
  it("records a confirmed, owner-verified attribution only after acceptance", async () => {
    const { owner, contributor, taskId } = await assignedTask();

    const submissionId = submitWork(taskId, contributor.id, {
      note: "Rebuilt the onboarding flow and wrote up the reasoning.",
      files: [{ title: "Design notes", url: "https://example.test/notes" }],
    });
    expect(taskRow(taskId).status).toBe("submitted");
    // An upload alone is never verification.
    expect(listAttributions(contributor.id)).toHaveLength(0);

    reviewSubmission(submissionId, owner, "accepted");

    expect(taskRow(taskId).status).toBe("completed");
    const attributions = listAttributions(contributor.id);
    expect(attributions).toHaveLength(1);
    expect(attributions[0]!.attribution.verificationMethod).toBe("owner_confirmed");
    expect(attributions[0]!.attribution.status).toBe("confirmed");

    const reputation = reputationSummary(contributor.id);
    expect(reputation.totals.contribution).toBeGreaterThan(0);
    expect(reputation.totals.expertise).toBeGreaterThan(0);
  });

  it("requires a reason when asking for changes and allows a resubmission", async () => {
    const { owner, contributor, taskId } = await assignedTask();
    const submissionId = submitWork(taskId, contributor.id, { note: "First pass", files: [] });

    expect(() => reviewSubmission(submissionId, owner, "revision_requested")).toThrow(/explain what needs to change/i);

    reviewSubmission(submissionId, owner, "revision_requested", "Please add the missing research summary.");
    expect(taskRow(taskId).status).toBe("revision_requested");
    expect(listAttributions(contributor.id)).toHaveLength(0);

    submitWork(taskId, contributor.id, { note: "Added the summary as requested.", files: [] });
    expect(taskRow(taskId).status).toBe("submitted");
  });

  it("cannot be reviewed twice", async () => {
    const { owner, contributor, taskId } = await assignedTask();
    const submissionId = submitWork(taskId, contributor.id, { note: "Done", files: [] });
    reviewSubmission(submissionId, owner, "accepted");
    expect(() => reviewSubmission(submissionId, owner, "accepted")).toThrow(/already been reviewed/i);
  });

  it("stops an owner reviewing their own submission", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    const { assignContributor } = await import("@/services/tasks");
    assignContributor(taskId, owner, owner.id);
    confirmScope(taskId, owner.id);
    const submissionId = submitWork(taskId, owner.id, { note: "Self-submitted work", files: [] });

    expect(() => reviewSubmission(submissionId, owner, "accepted")).toThrow(/cannot review your own/i);
  });

  it("rejects a contributor reviewing their own submission", async () => {
    const { contributor, taskId } = await assignedTask();
    const submissionId = submitWork(taskId, contributor.id, { note: "Mine", files: [] });
    expect(() => reviewSubmission(submissionId, { id: contributor.id }, "accepted")).toThrow();
  });
});

describe("contributor documentation access", () => {
  it("keeps private notes private and team notes visible to the project team", async () => {
    const { owner, contributor, taskId } = await assignedTask();

    addWorkLogEntry(taskId, contributor.id, { kind: "note", title: "Private scratchpad", body: "Half-formed ideas", visibility: "private" });
    addWorkLogEntry(taskId, contributor.id, { kind: "decision", title: "Chose SQLite", body: "Portable and easy to back up.", visibility: "team" });

    const contributorView = listWorkLogEntries(taskId, { id: contributor.id });
    const ownerView = listWorkLogEntries(taskId, owner);
    expect(contributorView).toHaveLength(2);
    expect(ownerView).toHaveLength(1);
    expect(ownerView[0]!.entry.title).toBe("Chose SQLite");
  });

  it("blocks readers who are not on the project", async () => {
    const { taskId } = await assignedTask();
    const outsider = await makeUser();
    expect(() => listWorkLogEntries(taskId, { id: outsider.id })).toThrow();
  });

  it("refuses public documentation when the project has not enabled it", async () => {
    const { contributor, taskId } = await assignedTask({ allowPublicDocs: false });
    expect(() =>
      addWorkLogEntry(taskId, contributor.id, { kind: "note", title: "Public entry", visibility: "public" }),
    ).toThrow(/has not enabled public documentation/i);
  });
});
