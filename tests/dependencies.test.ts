import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import {
  addDependency,
  listTaskDependencies,
  removeDependency,
  taskReady,
} from "@/services/dependencies";
import { projectAcceptedWork } from "@/services/accepted";
import { makeProject, makeTask, makeUser, taskInput } from "./helpers";
import { assignContributor, reviewSubmission, submitWork } from "@/services/tasks";

function readyNotifications(userId: string) {
  return getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.title, "Ready to start: Build the dashboard")))
    .all();
}

describe("drop dependencies", () => {
  it("links a prerequisite, rejects duplicates, self-links and cycles", async () => {
    const owner = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const research = makeTask(projectId, owner.id);
    const build = makeTask(projectId, owner.id);

    const dependencyId = addDependency(build, owner, { dependsOnTaskId: research, reason: "Builds on this research" });
    expect(typeof dependencyId).toBe("string");
    expect(listTaskDependencies(build, owner).blocked).toBe(true);
    expect(listTaskDependencies(build, owner).items[0]?.reason).toBe("Builds on this research");

    expect(() => addDependency(build, owner, { dependsOnTaskId: research })).toThrow(/already exists/i);
    expect(() => addDependency(build, owner, { dependsOnTaskId: build })).toThrow(/cannot depend on itself/i);
    expect(() => addDependency(research, owner, { dependsOnTaskId: build })).toThrow(/circular/i);

    removeDependency(dependencyId, owner);
    expect(listTaskDependencies(build, owner).items).toHaveLength(0);
  });

  it("refuses dependencies that cross projects and non-owners who try to add them", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const { id: otherProjectId } = makeProject(owner.id);
    const build = makeTask(projectId, owner.id);
    const foreign = makeTask(otherProjectId, owner.id);

    expect(() => addDependency(build, owner, { dependsOnTaskId: foreign })).toThrow(/another task from this project/i);
    expect(() => addDependency(build, { id: outsider.id }, { dependsOnTaskId: foreign })).toThrow();
  });

  it("only notifies the responsible people once the prerequisite is actually approved", async () => {
    const owner = await makeUser();
    const researcher = await makeUser();
    const builder = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const research = makeTask(projectId, owner.id);
    const build = makeTask(projectId, owner.id, taskInput({ title: "Build the dashboard" }));

    assignContributor(research, owner, researcher.id);
    assignContributor(build, owner, builder.id);
    addDependency(build, owner, { dependsOnTaskId: research, reason: "Uses the approved research" });

    expect(taskReady(build)).toBe(false);
    expect(readyNotifications(builder.id)).toHaveLength(0);

    const submissionId = submitWork(research, researcher.id, {
      note: "Research summary attached.",
      files: [{ title: "Findings", url: "https://example.test/findings" }],
    });
    reviewSubmission(submissionId, owner, "accepted");

    expect(taskReady(build)).toBe(true);
    expect(listTaskDependencies(build, owner).ready).toBe(true);

    const notificationsForBuilder = readyNotifications(builder.id);
    expect(notificationsForBuilder).toHaveLength(1);
    expect(notificationsForBuilder[0]!.href).toBe(`/tasks/${build}`);

    // A second approval is refused, so a dependency cannot be unblocked twice.
    expect(() => reviewSubmission(submissionId, owner, "accepted")).toThrow(/already been reviewed/i);
    expect(readyNotifications(builder.id)).toHaveLength(1);
  });
});

describe("accepted work collections", () => {
  it("files each approved deliverable once, grouped by work area", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const design = makeTask(projectId, owner.id, taskInput({ title: "Homepage design" }));
    const copy = makeTask(projectId, owner.id, taskInput({ title: "Landing copy" }));
    assignContributor(design, owner, contributor.id);
    assignContributor(copy, owner, contributor.id);

    for (const [taskId, title] of [
      [design, "Homepage mockup"],
      [copy, "Landing copy draft"],
    ] as const) {
      const submissionId = submitWork(taskId, contributor.id, {
        note: "Delivered.",
        files: [{ title, url: `https://example.test/${title.replace(/\s+/g, "-")}` }],
      });
      reviewSubmission(submissionId, owner, "accepted");
    }

    const result = projectAcceptedWork(projectId, owner);
    expect(result.items).toHaveLength(2);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(2);
    expect(result.items.every((item) => item.reviewerName === owner.username || !!item.reviewerName)).toBe(true);
    expect(result.areas.reduce((total, area) => total + area.count, 0)).toBe(2);
    expect(result.canViewFiles).toBe(true);

    const filtered = result.items.filter((item) => item.areaKey === result.areas[0]!.key);
    expect(filtered.length).toBe(result.areas[0]!.count);
  });

  it("does not expose accepted work from private drops to outsiders", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const publicTask = makeTask(projectId, owner.id);
    const privateTask = makeTask(projectId, owner.id, taskInput({ title: "Confidential prototype", visibility: "private" }));
    assignContributor(publicTask, owner, contributor.id);
    assignContributor(privateTask, owner, contributor.id);

    for (const taskId of [publicTask, privateTask]) {
      const submissionId = submitWork(taskId, contributor.id, {
        note: "Delivered.",
        files: [{ title: "Deliverable", url: "https://example.test/work" }],
      });
      reviewSubmission(submissionId, owner, "accepted");
    }

    expect(projectAcceptedWork(projectId, owner).items).toHaveLength(2);
    expect(projectAcceptedWork(projectId, { id: outsider.id }).items.map((item) => item.taskId)).toEqual([publicTask]);
  });
});
