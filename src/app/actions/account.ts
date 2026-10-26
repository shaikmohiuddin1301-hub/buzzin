"use server";

import { runServerAction } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { bool, file, list, optional, str } from "@/lib/form";
import { saveUploadedFile } from "@/lib/storage";
import { changePassword, updatePreferences, updateProfile, updateSkills } from "@/services/users";
import { OPTIONAL_NOTIFICATION_KINDS, type NotificationKind } from "@/lib/types";

export async function updateProfileAction(formData: FormData) {
  await runServerAction("/settings?tab=profile", async () => {
    const user = await requireUserOrThrow();

    let avatarFileId: string | null | undefined;
    const avatar = file(formData, "avatar");
    if (avatar) {
      const stored = await saveUploadedFile(avatar, { ownerId: user.id, visibility: "public" });
      avatarFileId = stored.id;
    }

    updateProfile(user.id, {
      displayName: str(formData, "displayName", user.displayName),
      bio: optional(formData, "bio"),
      location: optional(formData, "location"),
      timezone: optional(formData, "timezone"),
      portfolioUrls: list(formData, "portfolioUrls", 5),
      ...(avatarFileId ? { avatarFileId } : {}),
    });
    updateSkills(user.id, list(formData, "skills", 20));
    return { path: "/settings?tab=profile&notice=Profile+updated.", revalidate: ["/settings", `/u/${user.username}`] };
  });
}

export async function updateContentPrefsAction(formData: FormData) {
  await runServerAction("/settings?tab=preferences", async () => {
    const user = await requireUserOrThrow();
    const categories = list(formData, "categories");
    const interests = list(formData, "interests");
    // Theme is a per-device choice owned by the Appearance tab, and motion follows the
    // device preference, so neither is written from this form.
    updatePreferences(user.id, { categories, interests });
    return { path: "/settings?tab=preferences&notice=Content+preferences+saved.", revalidate: ["/settings", "/home"] };
  });
}

export async function updateNotificationsAction(formData: FormData) {
  await runServerAction("/settings?tab=notifications", async () => {
    const user = await requireUserOrThrow();
    // The same list the settings form renders, so a visible switch is always
    // actually stored. Safety notices are not part of the optional matrix.
    const kinds: NotificationKind[] = [...OPTIONAL_NOTIFICATION_KINDS];
    const matrix: Record<string, boolean> = {};
    for (const kind of kinds) matrix[kind] = bool(formData, `notify_${kind}`);
    updatePreferences(user.id, { notifyMatrix: matrix, notifyEmail: bool(formData, "notifyEmail") });
    return { path: "/settings?tab=notifications&notice=Notification+preferences+saved.", revalidate: ["/settings"] };
  });
}

export async function changePasswordAction(formData: FormData) {
  await runServerAction("/settings?tab=security", async () => {
    const user = await requireUserOrThrow();
    changePassword(user.id, str(formData, "currentPassword"), str(formData, "newPassword"), str(formData, "confirmPassword"));
    const { clearSessionCookie } = await import("@/lib/auth");
    await clearSessionCookie();
    return { path: "/auth/sign-in?notice=Password+changed.+Sign+in+again+with+your+new+password.", revalidate: ["/settings"] };
  });
}

export async function deleteAccountAction(formData: FormData) {
  await runServerAction("/settings?tab=account", async () => {
    const user = await requireUserOrThrow();
    const { deleteAccount } = await import("@/services/users");
    deleteAccount(user.id, str(formData, "confirmation"));
    const { clearSessionCookie } = await import("@/lib/auth");
    await clearSessionCookie();
    return { path: "/?notice=Your+account+was+deleted.", revalidate: ["/"] };
  });
}
