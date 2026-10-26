"use server";

import { runServerAction } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { bool, file, optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { saveUploadedFile } from "@/lib/storage";
import {
  conversationScope,
  createDropFromMessage,
  ensureProjectGroup,
  getOrCreateDirectConversation,
  leaveConversation,
  markConversationRead,
  muteConversation,
  reportMessage,
  sendMessage,
} from "@/services/chat";

export async function startDirectMessageAction(formData: FormData) {
  await runServerAction("/chats", async () => {
    const user = await requireUserOrThrow();
    rateLimit(`dm:start:${user.id}`, 20, 3_600_000);
    const id = getOrCreateDirectConversation(user.id, str(formData, "userId"));
    return { path: `/chats/${id}`, revalidate: ["/chats"] };
  });
}

export async function openProjectChatAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    const id = ensureProjectGroup(projectId, user.id);
    return { path: `/chats/${id}`, revalidate: ["/chats"] };
  });
}

export async function sendMessageAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction(`/chats/${conversationId}`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`chat:send:${user.id}`, 60, 60_000);

    let attachmentId: string | null = null;
    const upload = file(formData, "attachment");
    if (upload) {
      // A file shared in a task or project chat belongs to that work, not just to
      // the conversation, so it can be found from the task and the accepted record.
      const scope = conversationScope(conversationId);
      const stored = await saveUploadedFile(upload, {
        ownerId: user.id,
        projectId: scope?.projectId ?? null,
        taskId: scope?.taskId ?? null,
        visibility: "private",
      });
      attachmentId = stored.id;
    }

    const body = str(formData, "body");
    if (!body && !attachmentId) throw new AppError("Write a message first.");
    sendMessage(conversationId, user.id, { body, attachmentId, parentId: optional(formData, "parentId") });
    return { path: `/chats/${conversationId}`, revalidate: [`/chats/${conversationId}`] };
  });
}

/** Turn a chat message into a task. Permission is checked against the project, not the chat. */
export async function createDropFromMessageAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction(`/chats/${conversationId}`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`chat:drop:${user.id}`, 30, 600_000);
    const taskId = createDropFromMessage(str(formData, "messageId"), user);
    return {
      path: `/tasks/${taskId}?notice=Filed+as+a+task+from+the+conversation.`,
      revalidate: [`/chats/${conversationId}`, "/projects"],
    };
  });
}

export async function markReadAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction(`/chats/${conversationId}`, async () => {
    const user = await requireUserOrThrow();
    markConversationRead(conversationId, user.id);
    return { path: `/chats/${conversationId}`, revalidate: ["/chats"] };
  });
}

export async function muteConversationAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction(`/chats/${conversationId}`, async () => {
    const user = await requireUserOrThrow();
    muteConversation(conversationId, user.id, bool(formData, "mute"));
    return { path: `/chats/${conversationId}?notice=Conversation+${bool(formData, "mute") ? "muted" : "unmuted"}.`, revalidate: ["/chats"] };
  });
}

export async function leaveConversationAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction("/chats", async () => {
    const user = await requireUserOrThrow();
    leaveConversation(conversationId, user.id);
    return { path: "/chats?notice=You+left+the+conversation.", revalidate: ["/chats"] };
  });
}

export async function reportMessageAction(formData: FormData) {
  const conversationId = str(formData, "conversationId");
  await runServerAction(`/chats/${conversationId}`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`report:msg:${user.id}`, 10, 3_600_000);
    reportMessage(str(formData, "messageId"), user.id, str(formData, "reasonCode", "harassment"), optional(formData, "details"));
    return { path: `/chats/${conversationId}?notice=Message+reported.`, revalidate: [`/chats/${conversationId}`] };
  });
}
