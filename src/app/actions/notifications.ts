"use server";

import { runServerAction } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { markAllRead, markRead } from "@/services/notifications";

export async function markAllReadAction() {
  await runServerAction("/notifications", async () => {
    const user = await requireUserOrThrow();
    markAllRead(user.id);
    return { path: "/notifications?notice=All+notifications+marked+as+read.", revalidate: ["/notifications", "/home"] };
  });
}

export async function markReadAction(formData: FormData) {
  await runServerAction("/notifications", async () => {
    const user = await requireUserOrThrow();
    markRead(user.id, String(formData.get("notificationId") ?? ""));
    return { path: "/notifications", revalidate: ["/notifications"] };
  });
}
