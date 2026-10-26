import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  creatorProducts,
  entitlements,
  learningResources,
  orderItems,
  orders,
  users,
} from "@/db/schema";
import { hasEntitlement } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { audit, notify } from "@/lib/notify";
import { money } from "@/lib/format";
import type { ResourceFormat } from "@/lib/types";

/**
 * Premium learning products.
 *
 * PAYMENTS ARE DELIBERATELY EXCLUDED FROM THIS BUILD. No card details are
 * collected, no charge is attempted and no payment provider is called. Access is
 * granted by the creator (or an administrator) and recorded as an entitlement;
 * the price on the product is the intended listing price for when a payment
 * rail is added after eligibility, KYC and consumer-law review.
 */

export type ProductInput = {
  title: string;
  description?: string;
  resourceId?: string | null;
  priceCents: number;
  currency?: string;
  refundPolicy?: string;
  format: ResourceFormat;
  curriculum?: { title: string; minutes?: number }[];
  publish: boolean;
};

export function createProduct(creatorId: string, input: ProductInput): string {
  const db = getDb();
  if (input.title.trim().length < 4) throw new AppError("Give the product a clear title.");
  if (!Number.isFinite(input.priceCents) || input.priceCents < 100) {
    throw new AppError("Set a price of at least 1.00 in minor units (100).");
  }
  if (!input.refundPolicy?.trim()) throw new AppError("State a refund policy before publishing a paid product.");

  let resourceId: string | null = null;
  if (input.resourceId) {
    const resource = db.select().from(learningResources).where(eq(learningResources.id, input.resourceId)).get();
    if (!resource) throw new NotFoundError("Linked resource not found.");
    if (resource.creatorId !== creatorId) throw new ForbiddenError("You can only sell your own learning material.");
    if (input.publish && resource.status !== "published") {
      throw new AppError("Publish the learning resource before selling it.");
    }
    resourceId = resource.id;
    db.update(learningResources)
      .set({ priceCents: input.priceCents, currency: input.currency ?? "GBP", updatedAt: new Date().toISOString() })
      .where(eq(learningResources.id, resource.id))
      .run();
  }

  const id = randomUUID();
  db.insert(creatorProducts)
    .values({
      id,
      creatorId,
      resourceId,
      title: input.title.trim().slice(0, 160),
      description: input.description?.slice(0, 4000) ?? null,
      curriculum: (input.curriculum ?? []).slice(0, 30),
      priceCents: Math.min(input.priceCents, 500_000),
      currency: input.currency ?? "GBP",
      refundPolicy: input.refundPolicy.slice(0, 2000),
      format: input.format,
      status: input.publish ? "published" : "draft",
    })
    .run();
  return id;
}

export function updateProduct(productId: string, creatorId: string, input: Partial<ProductInput>): void {
  const db = getDb();
  const product = db.select().from(creatorProducts).where(eq(creatorProducts.id, productId)).get();
  if (!product) throw new NotFoundError("Product not found.");
  if (product.creatorId !== creatorId) throw new ForbiddenError("You can only edit your own products.");

  db.update(creatorProducts)
    .set({
      title: input.title?.slice(0, 160) ?? product.title,
      description: input.description?.slice(0, 4000) ?? product.description,
      priceCents: input.priceCents ?? product.priceCents,
      refundPolicy: input.refundPolicy?.slice(0, 2000) ?? product.refundPolicy,
      format: input.format ?? product.format,
      curriculum: input.curriculum ?? product.curriculum,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(creatorProducts.id, productId))
    .run();
}

export function publishProduct(productId: string, creatorId: string): void {
  const db = getDb();
  const product = db.select().from(creatorProducts).where(eq(creatorProducts.id, productId)).get();
  if (!product) throw new NotFoundError("Product not found.");
  if (product.creatorId !== creatorId) throw new ForbiddenError();
  if (!product.resourceId) throw new AppError("Link a published learning resource before publishing the product.");
  const resource = db.select().from(learningResources).where(eq(learningResources.id, product.resourceId)).get();
  if (!resource || resource.status !== "published") throw new AppError("The linked learning resource must be published first.");
  if (product.priceCents < 100) throw new AppError("Set a valid price first.");

  db.update(creatorProducts).set({ status: "published", updatedAt: new Date().toISOString() }).where(eq(creatorProducts.id, productId)).run();
}

export function productsForCreator(creatorId: string) {
  return getDb()
    .select({ product: creatorProducts, resourceTitle: learningResources.title })
    .from(creatorProducts)
    .leftJoin(learningResources, eq(learningResources.id, creatorProducts.resourceId))
    .where(eq(creatorProducts.creatorId, creatorId))
    .orderBy(desc(creatorProducts.updatedAt))
    .all();
}

export function productDetail(productId: string, viewerId?: string | null) {
  const db = getDb();
  const row = db
    .select({ product: creatorProducts, resource: learningResources, creatorName: users.displayName, creatorUsername: users.username })
    .from(creatorProducts)
    .leftJoin(learningResources, eq(learningResources.id, creatorProducts.resourceId))
    .innerJoin(users, eq(users.id, creatorProducts.creatorId))
    .where(eq(creatorProducts.id, productId))
    .get();
  if (!row) return null;

  const isOwner = viewerId === row.product.creatorId;
  if (row.product.status !== "published" && !isOwner) return null;

  const entitled = viewerId ? hasEntitlement(viewerId, row.product.resourceId ?? "") : false;
  const grantCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(entitlements)
      .where(and(eq(entitlements.productId, productId), isNull(entitlements.revokedAt)))
      .get()?.count ?? 0;

  return { ...row, isOwner, entitled, grantCount: Number(grantCount) };
}

/** Grant access without a payment. Only the creator or an administrator may. */
export function grantAccess(input: {
  productId: string;
  buyerEmailOrUsername: string;
  grantedBy: string;
  isAdmin?: boolean;
  note?: string;
  expiresAt?: string | null;
}): { orderId: string; entitlementId: string } {
  const db = getDb();
  const product = db.select().from(creatorProducts).where(eq(creatorProducts.id, input.productId)).get();
  if (!product) throw new NotFoundError("Product not found.");
  if (!input.isAdmin && product.creatorId !== input.grantedBy) {
    throw new ForbiddenError("Only the creator can grant access to this product.");
  }
  if (!product.resourceId) throw new AppError("This product has no linked learning resource.");

  const identifier = input.buyerEmailOrUsername.trim().toLowerCase();
  const buyer = db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${identifier} or lower(${users.username}) = ${identifier}`)
    .get();
  if (!buyer) throw new NotFoundError("No account matches that email or username.");
  if (buyer.id === product.creatorId) throw new AppError("You already have access to your own product.");

  if (hasEntitlement(buyer.id, product.resourceId)) {
    throw new AppError("That learner already has access to this resource.");
  }

  const orderId = randomUUID();
  const entitlementId = randomUUID();
  transaction((tx) => {
    tx.insert(orders)
      .values({
        id: orderId,
        buyerId: buyer.id,
        productId: product.id,
        amountCents: product.priceCents,
        currency: product.currency,
        status: "access_granted",
        method: input.isAdmin ? "admin_grant" : "creator_grant",
        note: input.note?.slice(0, 600) ?? "Payments are disabled on this build. Access granted directly.",
      })
      .run();
    tx.insert(orderItems)
      .values({ orderId, productId: product.id, title: product.title, amountCents: product.priceCents })
      .run();
    tx.insert(entitlements)
      .values({
        id: entitlementId,
        userId: buyer.id,
        productId: product.id,
        resourceId: product.resourceId!,
        source: input.isAdmin ? "admin_grant" : "creator_grant",
        orderId,
        grantedBy: input.grantedBy,
        expiresAt: input.expiresAt ?? null,
      })
      .run();
  });

  audit({
    actorId: input.grantedBy,
    action: "entitlement.granted",
    targetType: "product",
    targetId: product.id,
    metadata: { buyerId: buyer.id, orderId, method: input.isAdmin ? "admin_grant" : "creator_grant" },
  });
  notify({
    userId: buyer.id,
    actorId: input.grantedBy,
    kind: "learning_sale",
    title: `You now have access to ${product.title}`,
    body: "Access was granted directly by the creator. No payment was processed.",
    href: `/learn/${product.resourceId}`,
  });

  return { orderId, entitlementId };
}

export function revokeAccess(entitlementId: string, actorId: string, reason: string, isAdmin = false): void {
  if (!reason.trim()) throw new AppError("A reason is required to revoke access.");
  const db = getDb();
  const entitlement = db.select().from(entitlements).where(eq(entitlements.id, entitlementId)).get();
  if (!entitlement) throw new NotFoundError("Entitlement not found.");
  const product = entitlement.productId
    ? db.select().from(creatorProducts).where(eq(creatorProducts.id, entitlement.productId)).get()
    : null;
  if (!isAdmin && product?.creatorId !== actorId) throw new ForbiddenError("Only the creator can revoke this access.");

  transaction((tx) => {
    tx.update(entitlements)
      .set({ revokedAt: new Date().toISOString(), revokedReason: reason.slice(0, 600) })
      .where(eq(entitlements.id, entitlementId))
      .run();
    if (entitlement.orderId) {
      tx.update(orders).set({ status: "revoked", updatedAt: new Date().toISOString() }).where(eq(orders.id, entitlement.orderId)).run();
    }
  });
  audit({
    actorId,
    action: "entitlement.revoked",
    targetType: "entitlement",
    targetId: entitlementId,
    reasonCode: "access_revoked",
    metadata: { reason },
  });
  notify({
    userId: entitlement.userId,
    kind: "security",
    title: "Learning access was revoked",
    body: reason,
    href: "/learn",
  });
}

/**
 * Learner asks the creator for access. Since payments are disabled, this is the
 * honest alternative to a checkout: a request the creator can act on.
 */
export function requestAccess(productId: string, userId: string, note?: string): void {
  const db = getDb();
  const product = db.select().from(creatorProducts).where(eq(creatorProducts.id, productId)).get();
  if (!product) throw new NotFoundError("Product not found.");
  if (product.creatorId === userId) throw new AppError("You already have access to your own product.");
  if (!product.resourceId) throw new AppError("This product has no linked learning resource yet.");
  if (hasEntitlement(userId, product.resourceId)) throw new AppError("You already have access to this resource.");

  const recent = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.buyerId, userId), eq(orders.productId, productId), eq(orders.status, "pending")))
    .get();
  if (recent) throw new AppError("You already have an open request for this product.");

  db.insert(orders)
    .values({
      buyerId: userId,
      productId,
      amountCents: product.priceCents,
      currency: product.currency,
      status: "pending",
      method: "creator_grant",
      note: note?.slice(0, 600) ?? "Learner requested access. Payments are disabled on this build.",
    })
    .run();

  notify({
    userId: product.creatorId,
    actorId: userId,
    kind: "learning_sale",
    title: `Access request for ${product.title}`,
    body: note ?? "A learner has asked for access. Payments are disabled, so grant access from Studio → Sales.",
    href: "/studio/sales",
  });
  audit({ actorId: userId, action: "entitlement.requested", targetType: "product", targetId: productId });
}

export function entitlementsForUser(userId: string) {
  return getDb()
    .select({ entitlement: entitlements, resource: learningResources, product: creatorProducts })
    .from(entitlements)
    .innerJoin(learningResources, eq(learningResources.id, entitlements.resourceId))
    .leftJoin(creatorProducts, eq(creatorProducts.id, entitlements.productId))
    .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt)))
    .all();
}

export function entitlementsForProduct(productId: string) {
  return getDb()
    .select({ entitlement: entitlements, userName: users.displayName, username: users.username })
    .from(entitlements)
    .innerJoin(users, eq(users.id, entitlements.userId))
    .where(eq(entitlements.productId, productId))
    .orderBy(desc(entitlements.grantedAt))
    .all();
}

export function salesSummary(creatorId: string) {
  const db = getDb();
  const rows = db
    .select({ order: orders, productTitle: creatorProducts.title, buyerName: users.displayName, username: users.username })
    .from(orders)
    .innerJoin(creatorProducts, eq(creatorProducts.id, orders.productId))
    .innerJoin(users, eq(users.id, orders.buyerId))
    .where(eq(creatorProducts.creatorId, creatorId))
    .orderBy(desc(orders.createdAt))
    .all();

  const granted = rows.filter((row) => row.order.status === "access_granted");
  return {
    rows,
    grantedCount: granted.length,
    listValueCents: granted.reduce((sum, row) => sum + row.order.amountCents, 0),
    // No money has moved: payments are disabled in this build.
    collectedCents: 0,
    summaryLabel: `${granted.length} access grants · list value ${money(
      granted.reduce((sum, row) => sum + row.order.amountCents, 0),
      granted[0]?.order.currency ?? "GBP",
    )} · nothing charged (payments disabled)`,
  };
}

export function purchaseHistory(userId: string) {
  return getDb()
    .select({ order: orders, product: creatorProducts })
    .from(orders)
    .innerJoin(creatorProducts, eq(creatorProducts.id, orders.productId))
    .where(eq(orders.buyerId, userId))
    .orderBy(desc(orders.createdAt))
    .all();
}
