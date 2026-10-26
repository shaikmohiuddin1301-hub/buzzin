import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { messages, tasks } from "@/db/schema";
import { makeProject, makeTask, makeUser, projectRow } from "./helpers";
import { addMember } from "./helpers";
import { createQuickProject } from "@/services/projects";
import { conversations } from "@/db/schema";
import { createWorkArea, ensureWorkAreaChat, assignTaskToArea, listWorkAreas } from "@/services/workAreas";
import { createDropFromMessage, ensureProjectGroup, sendMessage } from "@/services/chat";
import { projectAcceptedWork } from "@/services/accepted";
import { reviewSubmission, submitWork, assignContributor } from "@/services/tasks";

function taskRow(taskId: string) {
  return getDb().select().from(tasks).where(eq(tasks.id, taskId)).get()!;
}

describe("work areas", () => {
  it("creates an area with its own chat and rejects duplicate or non-owner attempts", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    const areaId = createWorkArea(projectId, owner, { name: "Design", description: "Interface and brand" });
    const area = listWorkAreas(projectId, owner).find((entry) => entry.id === areaId)!;
    expect(area.name).toBe("Design");
    expect(area.conversationId).toBeTruthy();
    expect(area.drops).toBe(0);

    expect(() => createWorkArea(projectId, owner, { name: "design" })).toThrow(/already exists/i);
    expect(() => createWorkArea(projectId, { id: outsider.id }, { name: "Research" })).toThrow();

    const outsider2 = await makeUser();
    expect(() => ensureWorkAreaChat(areaId, { id: outsider2.id })).toThrow();

    const chatId = ensureWorkAreaChat(areaId, owner);
    expect(chatId).toBe(area.conversationId);
  });

  it("routes a Drop to its area and counts it without inventing a second record", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const areaId = createWorkArea(projectId, owner, { name: "Research" });
    const taskId = makeTask(projectId, owner.id);

    assignTaskToArea(taskId, owner, areaId);
    expect(taskRow(taskId).workAreaId).toBe(areaId);

    const area = listWorkAreas(projectId, owner).find((entry) => entry.id === areaId)!;
    expect(area.drops).toBe(1);
    expect(area.openDrops).toBe(1);

    assignTaskToArea(taskId, owner, null);
    expect(taskRow(taskId).workAreaId).toBeNull();
  });

  it("groups accepted work under the area that owns the Drop", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const areaId = createWorkArea(projectId, owner, { name: "Interface" });
    const taskId = makeTask(projectId, owner.id, { title: "Homepage design" });
    assignTaskToArea(taskId, owner, areaId);
    assignContributor(taskId, owner, contributor.id);

    const submissionId = submitWork(taskId, contributor.id, {
      note: "Delivered the mockup.",
      files: [{ title: "Homepage mockup", url: "https://example.test/mockup" }],
    });
    reviewSubmission(submissionId, owner, "accepted");

    const result = projectAcceptedWork(projectId, owner);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.areaLabel).toBe("Interface");
    expect(result.items[0]!.workAreaId).toBe(areaId);

    const area = listWorkAreas(projectId, owner).find((entry) => entry.id === areaId)!;
    expect(area.accepted).toBe(1);
  });
});

describe("quick project creation", () => {
  it("creates a published workspace with a team chat from four answers", async () => {
    const owner = await makeUser();
    const { id, conversationId } = createQuickProject(owner.id, {
      name: "River Watch Kit",
      goal: "A repairable sensor kit a volunteer can assemble in an afternoon.",
      shortDescription: "Volunteers build low-cost river sensors and publish what they learn openly.",
      visibility: "public",
    });

    const project = projectRow(id);
    expect(project.status).toBe("published");
    expect(project.category).toBe("other");
    expect(project.stage).toBe("idea");
    expect(project.overview).toMatch(/repairable sensor kit/);
    expect(project.compensationDetails).toMatch(/no payment is implied/i);
    expect(conversationId).toBeTruthy();
    expect(getDb().select().from(conversations).where(eq(conversations.id, conversationId)).get()!.projectId).toBe(id);
  });

  it("keeps a private quick project out of public discovery", async () => {
    const owner = await makeUser();
    const { id } = createQuickProject(owner.id, {
      name: "Quiet Research",
      shortDescription: "A private investigation with a team that has not agreed to publish anything.",
      visibility: "private",
    });
    expect(projectRow(id).visibility).toBe("private");
  });
});

describe("project chat", () => {
  it("is created automatically for a new project and includes the owner", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const conversationId = ensureProjectGroup(projectId, owner.id);
    expect(conversationId).toBeTruthy();
    expect(ensureProjectGroup(projectId, owner.id)).toBe(conversationId);
  });

  it("adds team members to the chat that already exists", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const conversationId = ensureProjectGroup(projectId, owner.id);
    addMember(projectId, member.id);

    expect(ensureProjectGroup(projectId, member.id)).toBe(conversationId);
  });
});

describe("chat threads", () => {
  it("keeps replies one level deep and inside their conversation", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const conversationId = ensureProjectGroup(projectId, owner.id);

    const rootId = sendMessage(conversationId, owner.id, { body: "We agreed the sensor mount uses two bolts." });
    const replyId = sendMessage(conversationId, owner.id, { body: "Agreed, I will model that.", parentId: rootId });
    expect(replyId).toBeTruthy();

    expect(() => sendMessage(conversationId, owner.id, { body: "Nested deeper.", parentId: replyId })).toThrow(/original message/i);
  });
});

describe("filing a chat message as a Drop", () => {
  it("creates one private Drop in the area the chat belongs to, and refuses a second", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const areaId = createWorkArea(projectId, owner, { name: "Firmware" });
    const conversationId = ensureWorkAreaChat(areaId, owner);
    const messageId = sendMessage(conversationId, owner.id, {
      body: "Please build the battery monitor firmware with a low-power sleep mode.",
    });

    const taskId = createDropFromMessage(messageId, owner);
    const task = taskRow(taskId);
    expect(task.projectId).toBe(projectId);
    expect(task.workAreaId).toBe(areaId);
    expect(task.visibility).toBe("private");
    expect(task.title).toMatch(/battery monitor firmware/i);
    expect(getDb().select().from(messages).where(eq(messages.id, messageId)).get()!.taskId).toBe(taskId);

    expect(() => createDropFromMessage(messageId, owner)).toThrow(/already filed/i);
  });

  it("does not let a contributor without edit permission file a Drop", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    addMember(projectId, contributor.id);
    const conversationId = ensureProjectGroup(projectId, contributor.id);
    const messageId = sendMessage(conversationId, contributor.id, { body: "The onboarding copy needs a second pass." });

    expect(() => createDropFromMessage(messageId, { id: contributor.id })).toThrow();
  });
});
