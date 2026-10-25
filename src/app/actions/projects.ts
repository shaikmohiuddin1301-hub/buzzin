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
  createProject,
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
import { addWorkLogEntry, approveWorkLogEntry, updateWorkLogEntry, withdrawConsent } from "@/services/worklog";
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

export async function createProjectAction(formData: FormData) {
  await runServerAction("/projects/new", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`project:create:${user.id}`, 5, 3_600_000);

    const name = str(formData, "name");
    const publish = bool(formData, "publish");

    let coverImageId: string | null = null;
    const cover = file(formData, "cover");
    if (cover) {
      const stored = await saveUploadedFile(cover, { ownerId: user.id, visibility: "public" });
      coverImageId = stored.id;
    }

    const { id } = createProject(user.id, {
      coverImageId,
      name,
      shortDescription: str(formData, "shortDescription"),
      overview: optional(formData, "overview"),
      problem: optional(formData, "problem"),
      audience: optional(formData, "audience"),
      category: str(formData, "category", "software") as ProjectCategory,
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
    });

    return {
      path: `/projects/${id}?${publish ? "notice=Project+published." : "notice=Draft+saved."}`,
      revalidate: ["/explore", "/home", "/projects/new"],
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
    reviewSubmission(
      str(formData, "submissionId"),
      user,
      str(formData, "decision", "accepted") as "accepted" | "revision_requested",
      optional(formData, "reason"),
    );
    return { path: `/tasks/${taskId}?notice=Review+recorded.`, revalidate: [`/tasks/${taskId}`] };
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

