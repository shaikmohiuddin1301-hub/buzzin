import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { taskAssignments, tasks, workAreas } from "@/db/schema";
import { MAX_SETUP_TASKS, createProjectWithTasks, type SetupTaskInput } from "@/services/projectSetup";
import { projectDetail } from "@/services/projects";
import { listTaskDependencies } from "@/services/dependencies";
import { listTasks, upcomingDeadlines } from "@/services/tasks";
import { makeUser, projectInput, projectRow } from "./helpers";

function task(overrides: Partial<SetupTaskInput> = {}): SetupTaskInput {
  return {
    title: "Build the readings dashboard",
    description: "Chart the last thirty days of readings.",
    objective: "A volunteer can see whether the sensor is healthy.",
    deliverablesSpec: "A working dashboard with one screenshot.",
    acceptanceCriteria: "Readings older than thirty days are not shown, and the page loads under two seconds.",
    effort: "8 hours",
    skills: ["React"],
    visibility: "public",
    priority: "normal",
    dependsOn: [],
    ...overrides,
  };
}

describe("project creation with a task breakdown", () => {
  it("persists every task and work area against the one project", async () => {
    const owner = await makeUser();
    const { id, areaCount, taskCount } = createProjectWithTasks(owner.id, projectInput({ name: "River Watch" }), {
      workAreas: ["Hardware", "Research"],
      tasks: [
        task({ title: "Assemble the first sensor", workArea: "Hardware" }),
        task({ title: "Interview five volunteers", workArea: "Research" }),
        task({ title: "Write the assembly guide" }),
      ],
    });

    expect(areaCount).toBe(2);
    expect(taskCount).toBe(3);
    expect(projectRow(id).status).toBe("published");

    const areas = getDb().select().from(workAreas).where(eq(workAreas.projectId, id)).all();
    expect(areas.map((area) => area.name)).toEqual(expect.arrayContaining(["Hardware", "Research"]));

    const rows = getDb().select().from(tasks).where(eq(tasks.projectId, id)).all();
    expect(rows).toHaveLength(3);
    // Every task has exactly one home, inside this project.
    expect(rows.every((row) => row.projectId === id)).toBe(true);
    expect(rows.every((row) => row.status === "open")).toBe(true);

    const hardware = rows.find((row) => row.title === "Assemble the first sensor");
    expect(hardware?.workAreaId).toBe(areas.find((area) => area.name === "Hardware")?.id);
    // A task with no work area is not invented into one.
    expect(rows.find((row) => row.title === "Write the assembly guide")?.workAreaId).toBeNull();
  });

  it("keeps the tasks reachable from the project and from the contributor's work view", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id } = createProjectWithTasks(owner.id, projectInput({ name: "Sensor team" }), {
      tasks: [
        task({ title: "Calibrate the water level sensor", assigneeId: contributor.id }),
        task({ title: "Draft the parts list" }),
      ],
    });

    const detail = projectDetail(id, contributor)!;
    expect(detail.project.id).toBe(id);

    const mine = upcomingDeadlines(contributor.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.task.title).toBe("Calibrate the water level sensor");
    expect(mine[0]!.projectName).toBe("Sensor team");

    // The unassigned task stays open so the project can recruit for it.
    const open = listTasks(id, owner).find((row) => row.title === "Draft the parts list");
    expect(open?.status).toBe("open");
    expect(
      getDb().select().from(taskAssignments).where(eq(taskAssignments.taskId, open!.id)).all(),
    ).toHaveLength(0);
  });

  it("wires dependencies between the tasks of the same project", async () => {
    const owner = await makeUser();
    const { id } = createProjectWithTasks(owner.id, projectInput({ name: "Dependent work" }), {
      tasks: [task({ title: "Order the components" }), task({ title: "Assemble the board", dependsOn: [0] })],
    });

    const rows = getDb().select().from(tasks).where(eq(tasks.projectId, id)).all();
    const assembly = rows.find((row) => row.title === "Assemble the board")!;
    const dependencies = listTaskDependencies(assembly.id, owner);
    expect(dependencies.items).toHaveLength(1);
    expect(dependencies.items[0]!.prerequisite.title).toBe("Order the components");
    expect(dependencies.blocked).toBe(true);
  });

  it("refuses to publish a task with no review requirements, but still allows a draft", async () => {
    const owner = await makeUser();
    const input = projectInput({ name: "No acceptance criteria" });
    const noCriteria = task({ title: "Do the vague thing", acceptanceCriteria: undefined });

    expect(() => createProjectWithTasks(owner.id, input, { tasks: [noCriteria] })).toThrow(/review requirements/i);
    // Nothing was written on the failed attempt.
    expect(getDb().select().from(tasks).where(eq(tasks.title, "Do the vague thing")).all()).toHaveLength(0);

    const draft = createProjectWithTasks(owner.id, { ...input, publish: false }, { tasks: [noCriteria] });
    expect(projectRow(draft.id).status).toBe("draft");
    const rows = getDb().select().from(tasks).where(eq(tasks.projectId, draft.id)).all();
    expect(rows).toHaveLength(1);
    // A draft project keeps its tasks as drafts rather than publishing undefined work.
    expect(rows[0]!.status).toBe("draft");
  });

  it("requires a real description before publishing, and nothing else for a draft", async () => {
    const owner = await makeUser();
    const thin = projectInput({ name: "Thin description", overview: "Too short." });
    expect(() => createProjectWithTasks(owner.id, thin, { tasks: [] })).toThrow(/40 characters/i);

    const draft = createProjectWithTasks(owner.id, { ...thin, publish: false }, {});
    expect(draft.taskCount).toBe(0);
    expect(projectRow(draft.id).status).toBe("draft");
  });

  it("allows a project to be published with no tasks yet so it can recruit first", async () => {
    const owner = await makeUser();
    const { id, taskCount } = createProjectWithTasks(owner.id, projectInput({ name: "Recruit before scoping" }), {});
    expect(taskCount).toBe(0);
    expect(projectRow(id).status).toBe("published");
  });

  it("rejects an unknown work area, a duplicate work area and a too-short task title", async () => {
    const owner = await makeUser();

    expect(() =>
      createProjectWithTasks(owner.id, projectInput({ name: "Bad area" }), {
        workAreas: ["Design"],
        tasks: [task({ workArea: "Marketing" })],
      }),
    ).toThrow(/work area that is not part of this project/i);

    expect(() =>
      createProjectWithTasks(owner.id, projectInput({ name: "Duplicate area" }), { workAreas: ["Design", "design"], tasks: [] }),
    ).toThrow(/twice as a work area/i);

    expect(() =>
      createProjectWithTasks(owner.id, projectInput({ name: "Short title" }), { tasks: [task({ title: "Fix" })] }),
    ).toThrow(/at least 4 characters/i);
  });

  it("caps how much a project can be created with in one pass", async () => {
    const owner = await makeUser();
    const tooMany = Array.from({ length: MAX_SETUP_TASKS + 1 }, (_, index) => task({ title: `Task number ${index}` }));
    expect(() => createProjectWithTasks(owner.id, projectInput({ name: "Too many tasks" }), { tasks: tooMany })).toThrow(
      /at most 25 tasks/i,
    );
  });

  it("refuses a task that depends on itself or on a task outside the breakdown", async () => {
    const owner = await makeUser();
    expect(() =>
      createProjectWithTasks(owner.id, projectInput({ name: "Self dependency" }), { tasks: [task({ dependsOn: [0] })] }),
    ).toThrow(/cannot depend on itself/i);

    expect(() =>
      createProjectWithTasks(owner.id, projectInput({ name: "Out of range" }), { tasks: [task({ dependsOn: [4] })] }),
    ).toThrow(/not part of this project/i);
  });

  it("keeps private tasks out of public view while the project is public", async () => {
    const owner = await makeUser();
    const visitor = await makeUser();
    const { id } = createProjectWithTasks(owner.id, projectInput({ name: "Mixed visibility" }), {
      tasks: [task({ title: "Public scoping note", visibility: "public" }), task({ title: "Internal budget sheet", visibility: "private" })],
    });

    const visitorTasks = listTasks(id, { id: visitor.id });
    expect(visitorTasks.map((row) => row.title)).not.toContain("Internal budget sheet");
    expect(listTasks(id, owner).map((row) => row.title)).toContain("Internal budget sheet");
  });
});
