"use server";

import { runServerAction } from "@/lib/actions";
import { assertEmailVerified, requireUserOrThrow } from "@/lib/auth";
import { bool, optional, str } from "@/lib/form";
import { rateLimit } from "@/lib/rate-limit";
import { createProduct, grantAccess, publishProduct, requestAccess, revokeAccess, updateProduct } from "@/services/commerce";
import type { ResourceFormat } from "@/lib/types";

export async function createProductAction(formData: FormData) {
  await runServerAction("/studio/products/new", async () => {
    const user = await requireUserOrThrow();
    assertEmailVerified(user);
    rateLimit(`product:${user.id}`, 10, 3_600_000);

    const id = createProduct(user.id, {
      title: str(formData, "title"),
      description: optional(formData, "description"),
      resourceId: optional(formData, "resourceId") ?? null,
      priceCents: Math.round(Number(str(formData, "price", "0")) * 100),
      currency: "GBP",
      refundPolicy: optional(formData, "refundPolicy"),
      format: str(formData, "format", "course") as ResourceFormat,
      curriculum: [0, 1, 2, 3, 4].flatMap((index) => {
        const title = str(formData, `itemTitle${index}`);
        return title ? [{ title, minutes: Number.parseInt(str(formData, `itemMinutes${index}`, "0"), 10) || undefined }] : [];
      }),
      publish: bool(formData, "publish"),
    });
    return { path: `/studio/products?notice=Product+${bool(formData, "publish") ? "published" : "saved"}.&highlight=${id}`, revalidate: ["/studio/products"] };
  });
}

export async function updateProductAction(formData: FormData) {
  const productId = str(formData, "productId");
  await runServerAction("/studio/products", async () => {
    const user = await requireUserOrThrow();
    updateProduct(productId, user.id, {
      title: optional(formData, "title"),
      description: optional(formData, "description"),
      priceCents: Math.round(Number(str(formData, "price", "0")) * 100) || undefined,
      refundPolicy: optional(formData, "refundPolicy"),
    });
    return { path: "/studio/products?notice=Product+updated.", revalidate: ["/studio/products"] };
  });
}

export async function publishProductAction(formData: FormData) {
  await runServerAction("/studio/products", async () => {
    const user = await requireUserOrThrow();
    publishProduct(str(formData, "productId"), user.id);
    return { path: "/studio/products?notice=Product+published.", revalidate: ["/studio/products", "/learn"] };
  });
}

/**
 * Grant access without payment. This is the only way access is created in this
 * build — there is no checkout, no card storage and no payment provider.
 */
export async function grantAccessAction(formData: FormData) {
  await runServerAction("/studio/sales", async () => {
    const user = await requireUserOrThrow();
    rateLimit(`grant:${user.id}`, 30, 3_600_000);
    grantAccess({
      productId: str(formData, "productId"),
      buyerEmailOrUsername: str(formData, "buyer"),
      grantedBy: user.id,
      isAdmin: user.isAdmin,
      note: optional(formData, "note"),
    });
    return { path: "/studio/sales?notice=Access+granted.+No+payment+was+processed.", revalidate: ["/studio/sales"] };
  });
}

export async function requestAccessAction(formData: FormData) {
  const productId = str(formData, "productId");
  const resourceId = str(formData, "resourceId");
  await runServerAction(`/learn/${resourceId}`, async () => {
    const user = await requireUserOrThrow();
    requestAccess(productId, user.id, optional(formData, "note"));
    return { path: `/learn/${resourceId}?notice=Request+sent.+The+creator+grants+access+manually+because+payments+are+disabled.`, revalidate: [`/learn/${resourceId}`] };
  });
}

/** Access request raised from the product page, returning to that page. */
export async function requestAccessFromProductAction(formData: FormData) {
  const productId = str(formData, "productId");
  await runServerAction(`/checkout/${productId}`, async () => {
    const user = await requireUserOrThrow();
    requestAccess(productId, user.id, optional(formData, "note"));
    return {
      path: `/checkout/${productId}?notice=Request+sent.+The+creator+grants+access+manually+because+payments+are+disabled.`,
      revalidate: [`/checkout/${productId}`],
    };
  });
}

export async function revokeAccessAction(formData: FormData) {
  await runServerAction("/studio/sales", async () => {
    const user = await requireUserOrThrow();
    revokeAccess(str(formData, "entitlementId"), user.id, str(formData, "reason"), user.isAdmin);
    return { path: "/studio/sales?notice=Access+revoked.", revalidate: ["/studio/sales"] };
  });
}
