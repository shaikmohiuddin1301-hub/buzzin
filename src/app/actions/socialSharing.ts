"use server";

import { runServerAction } from "@/lib/actions";
import { requireUserOrThrow } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { list, optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { deleteProjectShare, shareProjectUpdate } from "@/services/socialShares";

export async function shareProjectUpdateAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=progress`, async () => {
    const user = await requireUserOrThrow();
    // Each post leaves the platform, so the budget is deliberately small.
    rateLimit(`social:share:${user.id}`, 6, 600_000);

    const platforms = list(formData, "platforms", 8);
    if (platforms.length === 0) throw new AppError("Choose at least one social network.");

    await shareProjectUpdate(projectId, str(formData, "updateId"), user, {
      platforms,
      message: optional(formData, "message"),
    });

    return {
      path: `/projects/${projectId}?tab=progress&notice=Update+shared.`,
      revalidate: [`/projects/${projectId}`],
    };
  });
}

export async function deleteShareAction(formData: FormData) {
  const projectId = str(formData, "projectId");
  await runServerAction(`/projects/${projectId}?tab=progress`, async () => {
    const user = await requireUserOrThrow();
    await deleteProjectShare(str(formData, "shareId"), user);
    return {
      path: `/projects/${projectId}?tab=progress&notice=Social+post+deleted.`,
      revalidate: [`/projects/${projectId}`],
    };
  });
}
