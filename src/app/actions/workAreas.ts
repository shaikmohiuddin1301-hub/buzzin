"use server";

import { runServerAction } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { assignTaskToArea, createWorkArea, ensureWorkAreaChat } from "@/services/workAreas";

export async function createWorkAreaAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    rateLimit(`workarea:create:${user.id}`, 20, 3_600_000);
    createWorkArea(projectId, user, {
      name: str(formData, "name"),
      description: optional(formData, "description"),
    });
    return {
      path: `/projects/${projectId}?tab=team&notice=Work+area+created+with+its+own+chat.`,
      revalidate: [`/projects/${projectId}`, "/chats"],
    };
  });
}

export async function openWorkAreaChatAction(formData: FormData) {
  const areaId = str(formData, "areaId");
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=team`, async () => {
    const user = await requireUserOrThrow();
    const conversationId = ensureWorkAreaChat(areaId, user);
    return { path: `/chats/${conversationId}`, revalidate: ["/chats"] };
  });
}

export async function assignTaskAreaAction(formData: FormData) {
  const taskId = str(formData, "taskId");
  await runServerAction(`/tasks/${taskId}`, async () => {
    const user = await requireUserOrThrow();
    const areaId = optional(formData, "workAreaId");
    assignTaskToArea(taskId, user, areaId ?? null);
    return {
      path: `/tasks/${taskId}?notice=Work+area+updated.`,
      revalidate: [`/tasks/${taskId}`, "/projects"],
    };
  });
}
