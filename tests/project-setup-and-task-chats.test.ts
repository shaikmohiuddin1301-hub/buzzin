/**
 * Project setup and automatic task organisation.
 *
 * These cover the journeys a first-time user takes: publish a project without
 * making any tasks, keep a draft private until it is published, and find a task
 * chat waiting for them with the right people and no setup step.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversationMembers, conversations, deliverables, tasks } from "@/db/schema";
import { projectAcceptedWork } from "@/services/accepted";
import { conversationScope, ensureTaskChat, listConversations } from "@/services/chat";
import { createQuickProject, publishProject } from "@/services/projects";
import { assignContributor, confirmScope, expressInterest, listTasks, respondToInterest, reviewSubmission, submitWork } from "@/services/tasks";
import { taskStatusLabel } from "@/lib/types";
import { addMember, makeProject, makeTask, makeUser, projectRow } from "./helpers";

const quickProject = (ownerId: string, overrides: Parameters<typeof createQuickProject>[1] extends infer T ? Partial<T> : never = {}) =>
  createQuickProject(ownerId, {
    name: "River Watch",
    goal: "A sensor a volunteer can assemble in an afternoon.",
    shortDescription: "Volunteers build low-cost river sensors and publish everything they learn.",
    visibility: "public",
    ...overrides,
  });

function memberIds(conversationId: string): string[] {
  return getDb()
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
    .all()
    .map((row) => row.userId);
}

/** Owner + contributor, past interest acceptance and scope confirmation. */
async function workingTask() {
  const owner = await makeUser();
  const contributor = await makeUser();
  const { id: projectId } = makeProject(owner.id);
  const taskId = makeTask(projectId, owner.id);
  const interestId = expressInterest(contributor.id, { projectId, taskId, intent: "help_task" });
  respondToInterest(interestId, owner, "accepted");
  confirmScope(taskId, contributor.id);
  return { owner, contributor, projectId, taskId };
}

describe("publishing a project", () => {
  it("publishes a project with no tasks at all", async () => {
    const owner = await makeUser();
    const { id: projectId } = quickProject(owner.id);

    expect(projectRow(projectId).status).toBe("published");
    expect(listTasks(projectId, owner)).toHaveLength(0);
  });

  it("keeps a saved draft private until the owner publishes it", async () => {
    const owner = await makeUser();
    const { id: projectId } = quickProject(owner.id, { publish: false });

    expect(projectRow(projectId).status).toBe("draft");
    expect(projectRow(projectId).publishedAt).toBeNull();

    publishProject(projectId, owner);

    expect(projectRow(projectId).status).toBe("published");
    expect(projectRow(projectId).publishedAt).not.toBeNull();
  });

  it("only lets the owner publish the project", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { id: projectId } = quickProject(owner.id, { publish: false });

    expect(() => publishProject(projectId, { id: stranger.id })).toThrow();
    expect(projectRow(projectId).status).toBe("draft");
  });

  it("remembers whether the owner wants collaborators", async () => {
    const owner = await makeUser();
    const open = quickProject(owner.id);
    const closed = quickProject(owner.id, { openToCollaborators: false, name: "Closed build" });

    expect(projectRow(open.id).openToCollaborators).toBe(true);
    expect(projectRow(closed.id).openToCollaborators).toBe(false);
  });

  it("keeps a private project out of public discovery", async () => {
    const owner = await makeUser();
    const { id: projectId } = quickProject(owner.id, { visibility: "private" });

    expect(projectRow(projectId).status).toBe("published");
    expect(projectRow(projectId).visibility).toBe("private");
  });
});

describe("task work language", () => {
  it("shows the four workflow steps in plain words", () => {
    expect(taskStatusLabel("open")).toBe("To do");
    expect(taskStatusLabel("in_progress")).toBe("In progress");
    expect(taskStatusLabel("submitted")).toBe("Needs review");
    expect(taskStatusLabel("completed")).toBe("Approved");
  });

  it("never exposes the internal word Drop", () => {
    const labels = ["draft", "open", "reviewing_interest", "assigned", "in_progress", "submitted", "revision_requested", "completed", "cancelled"].map(
      taskStatusLabel,
    );
    expect(labels.join(" ")).not.toMatch(/drop/i);
  });

  it("stores priority on the task", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    const normal = makeTask(projectId, owner.id);
    const high = makeTask(projectId, owner.id, { priority: "high" });

    const rows = getDb().select().from(tasks).where(eq(tasks.id, high)).get()!;
    expect(rows.priority).toBe("high");
    expect(getDb().select().from(tasks).where(eq(tasks.id, normal)).get()!.priority).toBe("normal");
  });
});

describe("automatic task chats", () => {
  it("creates the chat with the task, before anyone opens it", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    const row = getDb().select().from(conversations).where(eq(conversations.taskId, taskId)).get();
    expect(row).toBeDefined();
    expect(row!.projectId).toBe(projectId);
    expect(listConversations(owner.id).some((chat) => chat.taskId === taskId)).toBe(true);
  });

  it("adds a newly assigned contributor to the existing task chat", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    // The chat already exists from task creation; assigning someone must add them
    // without anybody having to open the chat first.
    assignContributor(taskId, owner, contributor.id);

    const row = getDb().select().from(conversations).where(eq(conversations.taskId, taskId)).get()!;
    expect(memberIds(row.id)).toContain(contributor.id);
    expect(listConversations(contributor.id).some((chat) => chat.taskId === taskId)).toBe(true);
  });

  it("creates one chat per task, with the assigned contributor and the project owner", async () => {
    const { owner, contributor, projectId, taskId } = await workingTask();

    const conversationId = ensureTaskChat(taskId, owner);
    const row = getDb().select().from(conversations).where(eq(conversations.id, conversationId)).get()!;

    expect(row.taskId).toBe(taskId);
    expect(row.projectId).toBe(projectId);
    expect(memberIds(conversationId)).toEqual(expect.arrayContaining([owner.id, contributor.id]));
  });

  it("reuses the same chat instead of creating a second one", async () => {
    const { owner, taskId } = await workingTask();

    const first = ensureTaskChat(taskId, owner);
    const second = ensureTaskChat(taskId, owner);

    expect(second).toBe(first);
    const all = getDb().select().from(conversations).where(eq(conversations.taskId, taskId)).all();
    expect(all).toHaveLength(1);
  });

  it("files uploads against the task and project the chat belongs to", async () => {
    const { owner, projectId, taskId } = await workingTask();
    const conversationId = ensureTaskChat(taskId, owner);

    expect(conversationScope(conversationId)).toEqual({ projectId, taskId });
  });

  it("shows the task chat in the contributor's chat list without any setup", async () => {
    const { contributor, taskId } = await workingTask();
    ensureTaskChat(taskId, { id: contributor.id });

    const chat = listConversations(contributor.id).find((row) => row.taskId === taskId);
    expect(chat).toBeDefined();
  });

  it("refuses a stranger, so a private task chat cannot leak", async () => {
    const { taskId } = await workingTask();
    const stranger = await makeUser();

    expect(() => ensureTaskChat(taskId, { id: stranger.id })).toThrow();
  });

  it("lets a reviewer into the chat without inviting them by hand", async () => {
    const { owner, contributor, projectId, taskId } = await workingTask();
    const reviewer = await makeUser();
    addMember(projectId, reviewer.id, "reviewer");

    const conversationId = ensureTaskChat(taskId, { id: contributor.id });

    expect(memberIds(conversationId)).toEqual(expect.arrayContaining([owner.id, reviewer.id]));
  });
});

describe("approved work in one place", () => {
  it("lists an approved deliverable once, from the original record", async () => {
    const { owner, contributor, projectId, taskId } = await workingTask();

    const submissionId = submitWork(taskId, contributor.id, {
      note: "Sensor built and documented.",
      files: [{ title: "Assembly guide", url: "https://example.test/guide" }],
    });
    reviewSubmission(submissionId, owner, "accepted");

    const accepted = projectAcceptedWork(projectId, owner);
    expect(accepted.items).toHaveLength(1);
    expect(accepted.items[0]!.taskId).toBe(taskId);

    // One canonical deliverable row, not a copy per view.
    const rows = getDb().select().from(deliverables).where(eq(deliverables.taskId, taskId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(accepted.items[0]!.id);
  });

  it("keeps requested changes out of Accepted Work until they are approved", async () => {
    const { owner, contributor, projectId, taskId } = await workingTask();

    const submissionId = submitWork(taskId, contributor.id, { note: "First pass", files: [] });
    reviewSubmission(submissionId, owner, "revision_requested", "Please add the wiring diagram.");

    expect(projectAcceptedWork(projectId, owner).items).toHaveLength(0);
    expect(taskStatusLabel(getDb().select().from(tasks).where(eq(tasks.id, taskId)).get()!.status)).toBe(
      "Changes requested",
    );

    // The first submission and the requested changes stay in the history; the
    // resubmission is a new record that the owner approves.
    const resubmissionId = submitWork(taskId, contributor.id, {
      note: "Diagram added, everything else unchanged.",
      files: [{ title: "Wiring diagram", url: "https://example.test/wiring" }],
    });
    expect(resubmissionId).not.toBe(submissionId);
    reviewSubmission(resubmissionId, owner, "accepted");

    expect(projectAcceptedWork(projectId, owner).items).toHaveLength(1);
    expect(taskStatusLabel(getDb().select().from(tasks).where(eq(tasks.id, taskId)).get()!.status)).toBe("Approved");
  });
});
