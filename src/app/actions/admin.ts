"use server";

import { runServerAction } from "@/lib/actions";
import { requireAdminOrThrow, requireUserOrThrow } from "@/lib/auth";
import { bool, optional, str } from "@/lib/form";
import { applyModeration, resolveDispute, setUserRole } from "@/services/admin";
import { createBusiness, addBusinessMember, removeBusinessMember, updateBusiness } from "@/services/business";
import type { BusinessRole, ModerationAction } from "@/lib/types";

export async function moderateAction(formData: FormData) {
  await runServerAction("/admin/reports", async () => {
    const user = await requireAdminOrThrow();
    applyModeration({
      reportId: str(formData, "reportId"),
      moderatorId: user.id,
      action: str(formData, "action", "dismiss") as ModerationAction,
      reasonCode: str(formData, "reasonCode"),
      notes: str(formData, "notes"),
    });
    return { path: "/admin/reports?notice=Decision+recorded+and+audited.", revalidate: ["/admin", "/admin/reports"] };
  });
}

export async function resolveDisputeAction(formData: FormData) {
  await runServerAction("/admin/disputes", async () => {
    const user = await requireAdminOrThrow();
    resolveDispute(
      str(formData, "disputeId"),
      user.id,
      str(formData, "decision", "resolved") as "resolved" | "rejected",
      str(formData, "resolution"),
    );
    return { path: "/admin/disputes?notice=Dispute+closed.", revalidate: ["/admin/disputes", "/admin"] };
  });
}

export async function setUserRoleAction(formData: FormData) {
  await runServerAction("/admin/users", async () => {
    const user = await requireAdminOrThrow();
    if (!user.isAdmin) throw new Error("Only full administrators can change roles.");
    setUserRole(user.id, str(formData, "userId"), str(formData, "role", "moderator") as "admin" | "moderator", bool(formData, "grant"));
    return { path: "/admin/users?notice=Role+updated.", revalidate: ["/admin/users"] };
  });
}

/* --------------------------------- business -------------------------------- */

export async function createBusinessAction(formData: FormData) {
  await runServerAction("/business", async () => {
    const user = await requireUserOrThrow();
    const id = createBusiness(user.id, {
      name: str(formData, "name"),
      description: optional(formData, "description"),
      industry: optional(formData, "industry"),
      website: optional(formData, "website"),
      visibility: str(formData, "visibility", "public") as "public" | "private",
    });
    return { path: `/business/${id}?notice=Business+profile+created.`, revalidate: ["/business"] };
  });
}

export async function updateBusinessAction(formData: FormData) {
  const businessId = str(formData, "businessId");
  await runServerAction(`/business/${businessId}`, async () => {
    const user = await requireUserOrThrow();
    updateBusiness(businessId, user.id, {
      name: optional(formData, "name"),
      description: optional(formData, "description"),
      industry: optional(formData, "industry"),
      website: optional(formData, "website"),
      visibility: str(formData, "visibility", "public") as "public" | "private",
    });
    return { path: `/business/${businessId}?notice=Business+profile+updated.`, revalidate: [`/business/${businessId}`] };
  });
}

export async function addBusinessMemberAction(formData: FormData) {
  const businessId = str(formData, "businessId");
  await runServerAction(`/business/${businessId}`, async () => {
    const user = await requireUserOrThrow();
    addBusinessMember(businessId, user.id, {
      username: str(formData, "username"),
      role: str(formData, "role", "member") as BusinessRole,
    });
    return { path: `/business/${businessId}?notice=Team+member+added.`, revalidate: [`/business/${businessId}`] };
  });
}

export async function removeBusinessMemberAction(formData: FormData) {
  const businessId = str(formData, "businessId");
  await runServerAction(`/business/${businessId}`, async () => {
    const user = await requireUserOrThrow();
    removeBusinessMember(businessId, user.id, str(formData, "memberId"));
    return { path: `/business/${businessId}?notice=Team+member+removed.`, revalidate: [`/business/${businessId}`] };
  });
}
