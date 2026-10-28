"use server";

import { runServerAction } from "@/lib/actions";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { bool, file, optional, str } from "@/lib/form";
import { saveUploadedFile } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { getDb } from "@/db/client";
import { reports } from "@/db/schema";
import { addComment, createPost, deletePost, toggleReaction, toggleSaved, type CommentTarget } from "@/services/social";
import { blockUser, followUser, unblockUser, updatePreferences } from "@/services/users";
import { getProjectAccess } from "@/lib/authz";
import type { FeedKind } from "@/lib/types";

function safeReturn(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function createPostAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`post:${user.id}`, 12, 3_600_000);

    let imageId: string | null = null;
    const upload = file(formData, "image");
    if (upload) {
      const stored = await saveUploadedFile(upload, { ownerId: user.id, visibility: "public" });
      imageId = stored.id;
    }

    createPost(user.id, {
      body: str(formData, "body"),
      title: optional(formData, "title"),
      topic: optional(formData, "topic"),
      linkUrl: optional(formData, "linkUrl"),
      kind: str(formData, "kind", "general") as FeedKind,
      projectId: optional(formData, "projectId") ?? null,
      resourceId: optional(formData, "resourceId") ?? null,
      imageId,
      altText: optional(formData, "altText"),
      visibility: str(formData, "visibility", "public") as "public" | "private",
      publish: bool(formData, "publish"),
    });
    const label = bool(formData, "publish") ? "Published" : "Draft+saved";
    return { path: `${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=${label}.`, revalidate: [returnTo.split("?")[0] ?? "/", "/home"] };
  });
}

export async function deletePostAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    deletePost(str(formData, "postId"), user);
    return { path: `${returnTo}?notice=Post+deleted.`, revalidate: [returnTo.split("?")[0] ?? "/home"] };
  });
}

export async function commentAction(formData: FormData) {
  const targetType = str(formData, "targetType", "post") as CommentTarget;
  const targetId = str(formData, "targetId");
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`comment:${user.id}`, 30, 3_600_000);
    addComment(user.id, {
      targetType,
      targetId,
      body: str(formData, "body"),
      parentId: optional(formData, "parentId") ?? null,
    });
    return { path: `${returnTo}${returnTo.includes("?") ? "&" : "?"}notice=Comment+posted.`, revalidate: [returnTo.split("?")[0] ?? "/home"] };
  });
}

export async function reactAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    toggleReaction(
      user.id,
      str(formData, "targetType", "post") as "post" | "comment" | "resource" | "project",
      str(formData, "targetId"),
      str(formData, "kind", "like") as "like" | "celebrate" | "insight",
    );
    return { path: returnTo, revalidate: [returnTo.split("?")[0] ?? "/home"] };
  });
}

export async function saveAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    toggleSaved(
      user.id,
      str(formData, "targetType", "post") as "post" | "project" | "resource" | "journey" | "task",
      str(formData, "targetId"),
    );
    return { path: returnTo, revalidate: [returnTo.split("?")[0] ?? "/home", "/settings"] };
  });
}

export async function followUserAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    followUser(user.id, str(formData, "userId"));
    return { path: returnTo, revalidate: [returnTo.split("?")[0] ?? "/home", "/explore"] };
  });
}

export async function blockUserAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/settings?tab=privacy");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    const targetId = str(formData, "userId");
    if (bool(formData, "unblock")) {
      unblockUser(user.id, targetId);
      return { path: "/settings?tab=privacy&notice=User+unblocked.", revalidate: ["/settings"] };
    }
    blockUser(user.id, targetId, optional(formData, "reason"));
    return { path: `${returnTo}?notice=User+blocked.+They+can+no+longer+message+or+follow+you.`, revalidate: ["/settings", returnTo.split("?")[0] ?? "/"] };
  });
}

export async function reportAction(formData: FormData) {
  const returnTo = safeReturn(str(formData, "returnTo"), "/home");
  await runServerAction(returnTo, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`report:${user.id}`, 8, 3_600_000);
    const targetType = str(formData, "targetType") as "user" | "project" | "post" | "comment" | "resource" | "message" | "story";
    const targetId = str(formData, "targetId");
    const reasonCode = str(formData, "reasonCode");
    const details = str(formData, "details");
    if (!reasonCode) throw new AppError("Choose a reason for the report.");
    if (details.length < 10) throw new AppError("Add a short explanation so moderators can assess the report.");

    getDb()
      .insert(reports)
      .values({
        reporterId: user.id,
        targetType,
        targetId,
        reasonCode: reasonCode as never,
        details: details.slice(0, 2000),
      })
      .run();
    return {
      path: `${returnTo}?notice=Report+submitted.+Moderators+review+reports+in+a+queue.`,
      revalidate: [returnTo.split("?")[0] ?? "/home"],
    };
  });
}

export async function updatePrivacyAction(formData: FormData) {
  await runServerAction("/settings?tab=privacy", async () => {
    const user = await requireUserOrThrow();
    updatePreferences(user.id, {
      allowDirectMessages: str(formData, "allowDirectMessages", "project_members") as "everyone" | "project_members" | "nobody",
      profileVisibility: {
        contributions: bool(formData, "showContributions"),
        learning: bool(formData, "showLearning"),
        followers: bool(formData, "showFollowers"),
      },
      showEmail: bool(formData, "showEmail"),
      shareLearningHistory: bool(formData, "shareLearningHistory"),
    });
    return { path: "/settings?tab=privacy&notice=Privacy+settings+saved.", revalidate: ["/settings"] };
  });
}

export async function reportProjectMisattributionAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}`, async () => {
    const user = await requireUserOrThrow();
    const access = getProjectAccess(projectId, user);
    if (!access) throw new AppError("Project not found.");
    getDb()
      .insert(reports)
      .values({
        reporterId: user.id,
        targetType: "project",
        targetId: projectId,
        reasonCode: "misattribution",
        details: str(formData, "details").slice(0, 2000),
      })
      .run();
    return { path: `/projects/${projectId}?notice=Attribution+concern+reported.`, revalidate: [`/projects/${projectId}`] };
  });
}
