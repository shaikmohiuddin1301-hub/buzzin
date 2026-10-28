"use server";

import { runServerAction } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { bool, file, list, optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { saveUploadedFile } from "@/lib/storage";
import {
  addMilestone,
  archiveProject,
  createQuickProject,
  deleteProject,
  inviteToProject,
  postProjectUpdate,
  publishProject,
  removeMember,
  respondToInvitation,
  setMilestoneStatus,
  toggleProjectFollow,
  updateProject,
} from "@/services/projects";
import { createProjectWithTasks } from "@/services/projectSetup";
import { getUserByUsername } from "@/services/users";
import {
  assignContributor,
  confirmScope,
  correctAttribution,
  createTask,
  disputeAttribution,
  expressInterest,
  removeAssignee,
  respondToInterest,
  reviewSubmission,
  setTaskStatus,
  submitWork,
  updateTask,
} from "@/services/tasks";
import { addDependency, removeDependency } from "@/services/dependencies";
import { ensureProjectGroup } from "@/services/chat";
import { createPost } from "@/services/social";
import { addWorkLogEntry, approveWorkLogEntry, updateWorkLogEntry, withdrawConsent } from "@/services/worklog";
import { VISIBILITIES } from "@/lib/types";
import type {
  CompensationType,
  EoiIntent,
  ProjectCategory,
  ProjectRole,
  ProjectStage,
  TaskStatus,
  Visibility,
  WorkLogKind,
  WorkLogVisibility,
  WorkMode,
} from "@/lib/types";

/* --------------------------------- projects -------------------------------- */

/** A task as it arrives from the creation wizard. Everything is re-validated here. */
type WizardTask = {
  title: string;
  description?: string;
  objective?: string;
  deliverablesSpec?: string;
  acceptanceCriteria?: string;
  effort?: string;
  deadline?: string;
  skills: string[];
  workArea?: string;
  assignee?: string;
  visibility: Visibility;
  priority: "low" | "normal" | "high";
  referenceLinks?: string;
  dependsOn: number[];
};

const MAX_NEW_TASKS = 25;
const MAX_NEW_AREAS = 10;

function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(`The submitted ${what} could not be read. Reload the page and try again.`);
  }
}

/** Work areas are typed as a list of names; each becomes a real work area with its own chat. */
function parseWorkAreas(raw: string): string[] {
  if (!raw.trim()) return [];
  const parsed = parseJson(raw, "work areas");
  if (!Array.isArray(parsed)) throw new AppError("Work areas must be submitted as a list.");
  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (names.length > MAX_NEW_AREAS) throw new AppError(`A project can start with at most ${MAX_NEW_AREAS} work areas.`);
  return names;
}

function parseTasks(raw: string): WizardTask[] {
  if (!raw.trim()) return [];
  const parsed = parseJson(raw, "task breakdown");
  if (!Array.isArray(parsed)) throw new AppError("The task breakdown must be submitted as a list.");
  if (parsed.length > MAX_NEW_TASKS) throw new AppError(`A project can start with at most ${MAX_NEW_TASKS} tasks.`);

  return parsed.map((entry) => {
    const record = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : "");
    const list = (key: string) =>
      Array.isArray(record[key])
        ? [...new Set((record[key] as unknown[]).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, 10)
        : [];
    const priority = text("priority");
    const visibility = text("visibility");
    return {
      title: text("title"),
      description: text("description") || undefined,
      objective: text("objective") || undefined,
      deliverablesSpec: text("deliverablesSpec") || undefined,
      acceptanceCriteria: text("acceptanceCriteria") || undefined,
      effort: text("effort") || undefined,
      deadline: text("deadline") || undefined,
      skills: list("skills"),
      workArea: text("workArea") || undefined,
      assignee: text("assignee").replace(/^@/, "") || undefined,
      visibility: (VISIBILITIES as readonly string[]).includes(visibility) ? (visibility as Visibility) : "public",
      priority: priority === "low" || priority === "high" ? priority : "normal",
      referenceLinks: text("referenceLinks") || undefined,
      dependsOn: Array.isArray(record.dependsOn)
        ? (record.dependsOn as unknown[]).filter((value): value is number => Number.isInteger(value)).slice(0, MAX_NEW_TASKS)
        : [],
    };
  });
}

/**
 * The task's own words, with any reference links kept under a labelled heading so
 * nothing a creator typed is dropped. The task has no links column of its own.
 */
function taskDescription(task: WizardTask): string | undefined {
  const parts = [task.description, task.referenceLinks ? `Reference links:\n${task.referenceLinks}` : undefined].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Create a project, its work areas and its whole task breakdown in one transaction.
 *
 * Everything is validated before the first write, and the writes share a single
 * transaction, so a rejected task or a bad work area leaves no half-built project.
 * Task breakdown is available inside the creation flow itself, not as a separate
 * page the creator has to find afterwards.
 */
export async function createProjectAction(formData: FormData) {
  await runServerAction("/projects/new", async () => {
    const user = await requireUserOrThrow();
    const publish = bool(formData, "publish");
    // A draft is always allowed; publishing is what needs a verified address.
    if (publish) assertEmailVerified(user);
    rateLimit(`project:create:${user.id}`, 5, 3_600_000);

    const name = str(formData, "name");
    const shortDescription = str(formData, "shortDescription");
    const overview = optional(formData, "overview");
    const compensationType = str(formData, "compensationType", "unpaid") as CompensationType;
    const compensationDetails = optional(formData, "compensationDetails");

    // Required project information, stated plainly instead of hiding it under an
    // "optional" heading. Save as draft is the escape hatch while it is incomplete.
    if (name.trim().length < 3) throw new AppError("A project needs a title of at least 3 characters.");
    if (shortDescription.trim().length < 20) {
      throw new AppError("A project needs a summary of at least 20 characters so people know what they are joining.");
    }
    if (publish && (overview?.trim().length ?? 0) < 40) {
      throw new AppError("Describe the project in at least 40 characters before publishing. You can save it as a draft first.");
    }
    if (publish && compensationType === "unpaid" && !compensationDetails?.trim()) {
      throw new AppError("Say what unpaid contributors receive (credit, learning, references) before publishing.");
    }

    const workAreaNames = parseWorkAreas(str(formData, "workAreasJson"));
    const tasks = parseTasks(str(formData, "tasksJson"));

    // Resolve every named assignee before writing anything, so a typo is reported
    // instead of silently leaving the task unassigned.
    const assignees = new Map<number, string>();
    for (const [index, task] of tasks.entries()) {
      if (!task.assignee) continue;
      const person = getUserByUsername(task.assignee);
      if (!person) throw new AppError(`No account found for @${task.assignee}. Remove the assignee or correct the username.`);
      assignees.set(index, person.id);
    }

    let coverImageId: string | null = null;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }

    // The project, its work areas and its whole task breakdown are one unit of work:
    // validation happens first and every write shares a single transaction.
    const created = createProjectWithTasks(
      user.id,
      {
        coverImageId,
        name,
        shortDescription,
        overview,
        problem: optional(formData, "problem"),
        audience: optional(formData, "audience"),
        category: str(formData, "category", "software") as ProjectCategory,
        stage: str(formData, "stage", "idea") as ProjectStage,
        visibility: str(formData, "visibility", "public") as Visibility,
        workMode: str(formData, "workMode", "remote") as WorkMode,
        effort: optional(formData, "effort"),
        deadline: optional(formData, "deadline"),
        compensationType,
        compensationDetails,
        allowPublicDocs: bool(formData, "allowPublicDocs"),
        openToCollaborators: bool(formData, "collaborators"),
        confidentialityNotes: optional(formData, "confidentialityNotes"),
        ipNotes: optional(formData, "ipNotes"),
        links: [0, 1, 2].flatMap((index) => {
          const url = str(formData, `linkUrl${index}`);
          return url ? [{ label: str(formData, `linkLabel${index}`, "Link"), url }] : [];
        }),
        skills: list(formData, "skills", 12),
        milestones: [0, 1, 2, 3].flatMap((index) => {
          const title = str(formData, `milestoneTitle${index}`);
          return title
            ? [{ title, description: optional(formData, `milestoneDescription${index}`), dueDate: optional(formData, `milestoneDue${index}`) }]
            : [];
        }),
        publish,
        businessId: optional(formData, "businessId") ?? null,
      },
      {
        workAreas: workAreaNames,
        tasks: tasks.map((task, index) => ({
          ...task,
          description: taskDescription(task),
          assigneeId: assignees.get(index),
        })),
      },
    );

    // Every project starts with a team chat, so "where do we talk about this?"
    // never depends on someone finding a button afterwards.
    ensureProjectGroup(created.id, user.id);

    const summary = [
      publish ? "Project+published." : "Draft+saved.",
      created.areaCount > 0 ? `${created.areaCount}+work+area${created.areaCount === 1 ? "" : "s"}.` : null,
      created.taskCount > 0 ? `${created.taskCount}+task${created.taskCount === 1 ? "" : "s"}+created.` : null,
    ]
      .filter(Boolean)
      .join("+");

    return {
      path: `/projects/${created.id}?notice=${summary}`,
      revalidate: ["/explore", "/home", "/projects/new", "/projects"],
    };
  });
}

/**
 * Share an Update: either a canonical project update (which notifies followers and
 * creates a feed post when public) or a personal profile update.
 */
export async function createUpdateAction(formData: FormData) {
  await runServerAction("/create/update", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`update:${user.id}`, 20, 3_600_000);

    const projectId = optional(formData, "projectId") ?? null;
    const visibility = str(formData, "visibility", "public") as Visibility;
    const text = str(formData, "body");

    if (projectId) {
      postProjectUpdate(projectId, user, {
        title: str(formData, "title", "Project update"),
        body: text,
        visibility,
      });
      return {
        path: `/projects/${projectId}?tab=progress&notice=Update+shared.`,
        revalidate: [`/projects/${projectId}`, "/home"],
      };
    }

    const title = optional(formData, "title");
    createPost(user.id, {
      body: title ? `${title}\n\n${text}` : text,
      kind: "general",
      visibility: visibility === "private" ? "private" : "public",
      publish: true,
    });
    return {
      path: `/u/${user.username}?tab=posts&notice=Update+shared.`,
      revalidate: ["/home", `/u/${user.username}`],
    };
  });
}

/**
 * Four fields, then a usable workspace.
 *
 * Everything the long form asks for has a sensible default here: the category is
 * "other" rather than a guess, the stage is "idea" because that is where a new
 * project actually starts, and the arrangement is explicitly unpaid with credit
 * stated. Nothing is invented about money, skills or milestones.
 */
export async function quickCreateProjectAction(formData: FormData) {
  await runServerAction("/projects/new", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`project:create:${user.id}`, 5, 3_600_000);

    let coverImageId: string | null = null;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }

    const publish = bool(formData, "publish");
    const { id, conversationId } = createQuickProject(user.id, {
      name: str(formData, "name"),
      goal: optional(formData, "outcome"),
      shortDescription: str(formData, "shortDescription"),
      visibility: str(formData, "visibility", "public") as Visibility,
      category: str(formData, "category", "other") as ProjectCategory,
      skills: list(formData, "skills", 12),
      coverImageId,
      openToCollaborators: bool(formData, "collaborators"),
      publish,
    });

    return {
      path: `/projects/${id}?notice=${publish ? "Project+published.+Your+workspace+is+ready." : "Draft+saved.+Publish+when+you+are+ready."}`,
      revalidate: ["/explore", "/home", "/projects", "/projects/new", "/chats", `/chats/${conversationId}`],
    };
  });
}

export async function updateProjectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=overview`, async () => {
    const user = await requireUserOrThrow();
    updateProject(projectId, user, {
      name: str(formData, "name"),
      shortDescription: str(formData, "shortDescription"),
      overview: optional(formData, "overview"),
      problem: optional(formData, "problem"),
      audience: optional(formData, "audience"),
      stage: str(formData, "stage", "idea") as ProjectStage,
      visibility: str(formData, "visibility", "public") as Visibility,
      workMode: str(formData, "workMode", "remote") as WorkMode,
      effort: optional(formData, "effort"),
      deadline: optional(formData, "deadline"),
      compensationType: str(formData, "compensationType", "unpaid") as CompensationType,
      compensationDetails: optional(formData, "compensationDetails"),
      allowPublicDocs: bool(formData, "allowPublicDocs"),
      confidentialityNotes: optional(formData, "confidentialityNotes"),
      ipNotes: optional(formData, "ipNotes"),
    });
    return { path: `/projects/${projectId}?tab=overview&notice=Project+updated.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function updateProjectCoverAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`cover:${user.id}`, 20, 3_600_000);

    const remove = bool(formData, "removeCover");
    let coverImageId: string | null | undefined;

    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }
    if (remove) coverImageId = null;
    if (coverImageId === undefined) throw new AppError("Choose an image before saving a cover.");

    updateProject(projectId, user, { coverImageId });
    return {
      path: `/projects/${projectId}?notice=${remove ? "Cover+removed." : "Cover+updated."}`,
      revalidate: [`/projects/${projectId}`, "/explore", "/home"],
    };
  });
}

export async function publishProjectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}`, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    publishProject(projectId, user);
    return { path: `/projects/${projectId}?notice=Project+published.`, revalidate: ["/explore", `/projects/${projectId}`] };
  });
}

export async function toggleProjectFollowAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const returnTo = str(formData, "returnTo", `/projects/${projectId}`);
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    toggleProjectFollow(projectId, user.id);
    return { path: returnTo.split("?")[0] ?? "/", revalidate: [returnTo.split("?")[0] ?? "/", `/projects/${projectId}`] };
  });
}

export async function addMilestoneAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=progress`, async () => {
    const user = await requireUserOrThrow();
    addMilestone(projectId, user, {
      title: str(formData, "title"),
      description: optional(formData, "description"),
      dueDate: optional(formData, "dueDate"),
    });
    return { path: `/projects/${projectId}?tab=progress&notice=Milestone+added.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function setMilestoneStatusAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const milestoneId = str(formData, "milestoneId");
  await runServerAction(`/projects/${projectId}?tab=progress`, async () => {
    const user = await requireUserOrThrow();
    setMilestoneStatus(milestoneId, user, str(formData, "status", "pending") as "pending" | "in_progress" | "completed");
    return { path: `/projects/${projectId}?tab=progress`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function postProjectUpdateAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=progress`, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    postProjectUpdate(projectId, user, {
      title: str(formData, "title"),
      body: str(formData, "body"),
      visibility: str(formData, "visibility", "public") as Visibility,
    });
    return {
      path: `/projects/${projectId}?tab=progress&notice=Update+published.`,
      revalidate: [`/projects/${projectId}`, "/home"],
    };
  });
}

export async function inviteToProjectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    inviteToProject(projectId, user, {
      userId: optional(formData, "userId"),
      email: optional(formData, "email"),
      role: str(formData, "role", "collaborator") as ProjectRole,
      message: optional(formData, "message"),
    });
    return { path: `/projects/${projectId}?tab=team&notice=Invitation+sent.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function respondToInvitationAction(formData: FormData) {
  await runServerAction("/notifications", async () => {
    const user = await requireUserOrThrow();
    const accept = bool(formData, "accept");
    respondToInvitation(str(formData, "invitationId"), user.id, accept);
    return {
      path: `/notifications?notice=Invitation+${accept ? "accepted" : "declined"}.`,
      revalidate: ["/notifications", "/home"],
    };
  });
}

export async function removeMemberAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    removeMember(projectId, user, str(formData, "userId"));
    return { path: `/projects/${projectId}?tab=team&notice=Member+removed.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function archiveProjectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}`, async () => {
    const user = await requireUserOrThrow();
    archiveProject(projectId, user);
    return { path: "/home?notice=Project+archived.", revalidate: ["/home", "/explore"] };
  });
}

export async function deleteProjectAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=overview`, async () => {
    const user = await requireUserOrThrow();
    deleteProject(projectId, user, str(formData, "confirmation"));
    return { path: "/home?notice=Project+deleted.", revalidate: ["/home", "/explore"] };
  });
}

/* ---------------------------------- tasks ---------------------------------- */

export async function createTaskAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}/tasks`, async () => {
    const user = await requireUserOrThrow();
    const id = createTask(projectId, user, {
      title: str(formData, "title"),
      description: optional(formData, "description"),
      objective: optional(formData, "objective"),
      deliverablesSpec: optional(formData, "deliverablesSpec"),
      acceptanceCriteria: optional(formData, "acceptanceCriteria"),
      effort: optional(formData, "effort"),
      deadline: optional(formData, "deadline"),
      compensationType: str(formData, "compensationType", "unpaid") as CompensationType,
      compensationDetails: optional(formData, "compensationDetails"),
      visibility: str(formData, "visibility", "public") as Visibility,
      confidentiality: optional(formData, "confidentiality"),
      skills: list(formData, "skills", 10),
      publish: bool(formData, "publish"),
      workAreaId: optional(formData, "workAreaId") ?? null,
      priority: str(formData, "priority", "normal") as "low" | "normal" | "high",
    });
    return {
      path: `/tasks/${id}?notice=Task+${bool(formData, "publish") ? "published" : "saved+as+draft"}.`,
      revalidate: [`/projects/${projectId}`, "/explore"],
    };
  });
}

export async function updateTaskAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    updateTask(taskId, user, {
      title: str(formData, "title"),
      description: optional(formData, "description"),
      acceptanceCriteria: optional(formData, "acceptanceCriteria"),
      deadline: optional(formData, "deadline"),
      visibility: str(formData, "visibility", "public") as Visibility,
    });
    return { path: `/tasks/${taskId}?notice=Task+updated.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function setTaskStatusAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    setTaskStatus(taskId, user, str(formData, "status", "open") as TaskStatus);
    return { path: `/tasks/${taskId}?notice=Status+updated.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function expressInterestAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  const returnTo = str(formData, "returnTo", `/projects/${projectId}`);
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`interest:${user.id}`, 10, 3_600_000);
    expressInterest(user.id, {
      projectId,
      taskId: optional(formData, "taskId") ?? null,
      intent: str(formData, "intent", "contribute") as EoiIntent,
      message: optional(formData, "message"),
      workSamples: [0, 1].flatMap((index) => {
        const url = str(formData, `sampleUrl${index}`);
        return url ? [{ label: str(formData, `sampleLabel${index}`, "Work sample"), url }] : [];
      }),
    });
    return { path: `${returnTo.split("?")[0]}?notice=Interest+sent.+The+owner+can+now+review+it.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function respondToInterestAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    respondToInterest(
      str(formData, "eoiId"),
      user,
      str(formData, "decision", "reviewing") as "accepted" | "declined" | "reviewing",
      optional(formData, "responseMessage"),
    );
    return { path: `/projects/${projectId}?tab=team&notice=Interest+updated.`, revalidate: [`/projects/${projectId}`] };
  });
}

export async function assignContributorAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    assignContributor(taskId, user, str(formData, "userId"), optional(formData, "responsibilities"));
    return { path: `/tasks/${taskId}?notice=Contributor+assigned.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function removeAssigneeAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    removeAssignee(taskId, user, str(formData, "userId"));
    return { path: `/tasks/${taskId}?notice=Contributor+removed.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function confirmScopeAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    confirmScope(taskId, user.id);
    return { path: `/tasks/${taskId}?notice=Scope+confirmed.+You+can+start+documenting.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function submitWorkAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`submit:${user.id}`, 10, 600_000);

    const files: { title: string; url?: string; fileId?: string; description?: string }[] = [];
    const upload = file(formData, "file");
    if (upload) {
      const stored = await saveUploadedFile(upload, { ownerId: user.id, taskId, visibility: "private" });
      files.push({ title: str(formData, "fileTitle", upload.name ?? "Upload"), fileId: stored.id });
    }
    const url = optional(formData, "deliverableUrl");
    if (url) files.push({ title: str(formData, "deliverableTitle", "Deliverable link"), url, description: optional(formData, "deliverableDescription") });

    submitWork(taskId, user.id, { note: str(formData, "note"), files });
    return {
      path: `/tasks/${taskId}?notice=Work+submitted+for+review.`,
      revalidate: [`/tasks/${taskId}`, `/tasks/${taskId}/workspace`],
    };
  });
}

export async function reviewSubmissionAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    const decision = str(formData, "decision", "accepted") as "accepted" | "revision_requested";
    reviewSubmission(str(formData, "submissionId"), user, decision, optional(formData, "reason"));
    // `approved=1` is only ever set after the approval is persisted, and the page uses it to
    // play the accepted-work animation once. A failure throws above and never reaches here.
    return {
      path:
        decision === "accepted"
          ? `/tasks/${taskId}?notice=Work+approved+and+filed.&approved=1`
          : `/tasks/${taskId}?notice=Changes+requested.`,
      revalidate: [`/tasks/${taskId}`],
    };
  });
}

/* ------------------------------- dependencies ------------------------------- */

export async function addDependencyAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    addDependency(taskId, user, {
      dependsOnTaskId: str(formData, "dependsOnTaskId"),
      reason: optional(formData, "reason"),
    });
    return {
      path: `/tasks/${taskId}?notice=Prerequisite+added.`,
      revalidate: [`/tasks/${taskId}`, `/projects/${str(formData, "projectId")}`],
    };
  });
}

export async function removeDependencyAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    removeDependency(str(formData, "dependencyId"), user);
    return { path: `/tasks/${taskId}?notice=Prerequisite+removed.`, revalidate: [`/tasks/${taskId}`] };
  });
}

export async function disputeAttributionAction(formData: FormData) {
  await runServerAction("/settings?tab=contributions", async () => {
    const user = await requireUserOrThrow();
    disputeAttribution(str(formData, "attributionId"), user.id, {
      subject: str(formData, "subject"),
      details: str(formData, "details"),
    });
    return { path: "/settings?tab=contributions&notice=Dispute+opened.+A+moderator+will+review+it.", revalidate: ["/settings"] };
  });
}

export async function correctAttributionAction(formData: FormData) {
  await runServerAction("/settings?tab=contributions", async () => {
    const user = await requireUserOrThrow();
    correctAttribution(str(formData, "attributionId"), user, {
      role: optional(formData, "role"),
      summary: optional(formData, "summary"),
    });
    return { path: "/settings?tab=contributions&notice=Contribution+record+corrected.", revalidate: ["/settings"] };
  });
}

/* --------------------------------- work log -------------------------------- */

export async function addWorkLogAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}/workspace`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`worklog:${user.id}`, 40, 600_000);

    let fileId: string | null = null;
    const upload = file(formData, "file");
    if (upload) {
      const stored = await saveUploadedFile(upload, { ownerId: user.id, taskId, visibility: "private" });
      fileId = stored.id;
    }

    addWorkLogEntry(taskId, user.id, {
      kind: str(formData, "kind", "note") as WorkLogKind,
      title: str(formData, "title"),
      body: optional(formData, "body"),
      linkUrl: optional(formData, "linkUrl"),
      fileId,
      visibility: str(formData, "visibility", "team") as WorkLogVisibility,
    });
    return { path: `/tasks/${taskId}/workspace?notice=Entry+saved.`, revalidate: [`/tasks/${taskId}/workspace`] };
  });
}

export async function updateWorkLogAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}/workspace`, async () => {
    const user = await requireUserOrThrow();
    updateWorkLogEntry(str(formData, "entryId"), user.id, {
      title: optional(formData, "title"),
      body: optional(formData, "body"),
      visibility: str(formData, "visibility", "team") as WorkLogVisibility,
    });
    return { path: `/tasks/${taskId}/workspace?notice=Entry+updated.`, revalidate: [`/tasks/${taskId}/workspace`] };
  });
}

export async function approveWorkLogAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}/workspace`, async () => {
    const user = await requireUserOrThrow();
    approveWorkLogEntry(str(formData, "entryId"), user);
    return { path: `/tasks/${taskId}/workspace?notice=Entry+approved+for+public+use.`, revalidate: [`/tasks/${taskId}/workspace`] };
  });
}

export async function withdrawConsentAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}/workspace`, async () => {
    const user = await requireUserOrThrow();
    withdrawConsent(user.id, str(formData, "projectId"));
    return { path: `/tasks/${taskId}/workspace?notice=Public+story+consent+withdrawn.`, revalidate: [`/tasks/${taskId}/workspace`] };
  });
}

