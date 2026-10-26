"use server";

import { runServerAction, withFlash } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { markAllRead, markRead } from "@/services/notifications";

/** Only an internal path is an acceptable return destination. */
function returnTo(formData: FormData, fallback: string): string {
  const value = String(formData.get("returnTo") ?? "");
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}

export async function markAllReadAction(formData: FormData) {
  await runServerAction("/notifications", async () => {
    const user = await requireUserOrThrow();
    const changed = markAllRead(user.id);
    return {
      path: withFlash(returnTo(formData, "/notifications"), {
        notice: changed > 0 ? `${changed} notification${changed === 1 ? "" : "s"} marked as read.` : undefined,
      }),
      revalidate: ["/notifications", "/home"],
    };
  });
}

export async function markAllReadInlineAction(): Promise<{ changed: number }> {
  const user = await requireUserOrThrow();
  const changed = markAllRead(user.id);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/notifications");
  revalidatePath("/home");
  return { changed };
}

export async function markReadAction(formData: FormData) {
  await runServerAction("/notifications", async () => {
    const user = await requireUserOrThrow();
    markRead(user.id, String(formData.get("notificationId") ?? ""));
    return { path: returnTo(formData, "/notifications"), revalidate: ["/notifications", "/home"] };
  });
}
