import { transaction } from "@/db/client";
import type { Viewer } from "@/lib/authz";
import { AppError } from "@/lib/errors";
import { createProject, type CreateProjectInput } from "@/services/projects";
import { assignContributor, createTask } from "@/services/tasks";
import { createWorkArea } from "@/services/workAreas";
import { addDependency } from "@/services/dependencies";
import type { Visibility } from "@/lib/types";

export const MAX_SETUP_TASKS = 25;
export const MAX_SETUP_AREAS = 10;

/**
 * One task as the creation wizard describes it.
 *
 * `assigneeId` is already resolved by the caller: the service works with real
 * account ids, never usernames, so nothing can be attached to the wrong person.
 */
export type SetupTaskInput = {
  title: string;
  description?: string;
  objective?: string;
  deliverablesSpec?: string;
  acceptanceCriteria?: string;
  effort?: string;
  deadline?: string;
  skills: string[];
  workArea?: string;
  assigneeId?: string;
  visibility: Visibility;
  priority: "low" | "normal" | "high";
  dependsOn: number[];
};

export type ProjectSetupResult = {
  id: string;
  slug: string;
  areaCount: number;
  taskCount: number;
};

/**
 * Create a project together with its work areas and its whole task breakdown.
 *
 * Everything is validated before the first write, and every write shares one
 * transaction, so a rejected task or a bad work area can never leave a project
 * half-created. Tasks keep their canonical home in the project: the task row is
 * the only record, and the work area only groups it.
 */
export function createProjectWithTasks(
  ownerId: string,
  project: CreateProjectInput,
  options: { workAreas?: string[]; tasks?: SetupTaskInput[] } = {},
): ProjectSetupResult {
  const workAreas = options.workAreas ?? [];
  const tasks = options.tasks ?? [];

  if (workAreas.length > MAX_SETUP_AREAS) {
    throw new AppError(`A project can start with at most ${MAX_SETUP_AREAS} work areas.`);
  }
  if (tasks.length > MAX_SETUP_TASKS) {
    throw new AppError(`A project can start with at most ${MAX_SETUP_TASKS} tasks.`);
  }

  // Publishing needs the information a contributor cannot work without. A draft
  // can be saved at any point, and keeps its tasks rather than dropping them.
  if (project.publish && (project.overview?.trim().length ?? 0) < 40) {
    throw new AppError("Describe the project in at least 40 characters before publishing. You can save it as a draft first.");
  }

  const areaKeys = new Set<string>();
  for (const area of workAreas) {
    const key = area.trim().toLowerCase();
    if (!key) continue;
    if (areaKeys.has(key)) throw new AppError(`“${area}” is listed twice as a work area.`);
    areaKeys.add(key);
  }

  tasks.forEach((task, index) => {
    const label = task.title.trim() || `Task ${index + 1}`;
    if (task.title.trim().length < 4) {
      throw new AppError(`“${label}”: a task title of at least 4 characters is required.`);
    }
    if (project.publish && !task.acceptanceCriteria?.trim()) {
      throw new AppError(
        `“${label}” needs review requirements (acceptance criteria) before this project can be published. Add them, or save the project as a draft.`,
      );
    }
    if (task.workArea && !areaKeys.has(task.workArea.trim().toLowerCase())) {
      throw new AppError(`“${label}” names a work area that is not part of this project.`);
    }
    for (const dependency of task.dependsOn) {
      if (dependency >= tasks.length || dependency < 0) {
        throw new AppError(`“${label}” depends on a task that is not part of this project.`);
      }
      if (dependency === index) throw new AppError(`“${label}” cannot depend on itself.`);
    }
  });

  return transaction(() => {
    const { id, slug } = createProject(ownerId, project);

    // Work areas come first so every task can be filed into its home in the same pass.
    const areaIds = new Map<string, string>();
    for (const area of workAreas) {
      const name = area.trim();
      if (!name) continue;
      areaIds.set(name.toLowerCase(), createWorkArea(id, { id: ownerId } as Viewer, { name }));
    }

    const taskIds: string[] = [];
    tasks.forEach((task, index) => {
      const taskId = createTask(id, { id: ownerId } as Viewer, {
        title: task.title,
        description: task.description,
        objective: task.objective,
        deliverablesSpec: task.deliverablesSpec,
        acceptanceCriteria: task.acceptanceCriteria,
        effort: task.effort,
        deadline: task.deadline,
        compensationType: project.compensationType,
        compensationDetails: project.compensationDetails,
        visibility: task.visibility,
        skills: task.skills,
        // A published task always has its review requirements, checked above.
        publish: project.publish && Boolean(task.acceptanceCriteria?.trim()),
        workAreaId: task.workArea ? (areaIds.get(task.workArea.trim().toLowerCase()) ?? null) : null,
        priority: task.priority,
      });
      taskIds.push(taskId);

      // An assignee is optional on purpose: unassigned tasks stay open so the
      // project can recruit for them.
      if (task.assigneeId) {
        assignContributor(taskId, { id: ownerId } as Viewer, task.assigneeId, task.deliverablesSpec);
      }
    });

    // Dependencies are wired last because they refer to tasks by position.
    tasks.forEach((task, index) => {
      for (const dependency of task.dependsOn) {
        addDependency(taskIds[index]!, { id: ownerId } as Viewer, { dependsOnTaskId: taskIds[dependency]! });
      }
    });

    return { id, slug, areaCount: areaIds.size, taskCount: taskIds.length };
  });
}
