import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import { analyticsEvents, businessMembers, businesses, projectFollows, projects, users } from "@/db/schema";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { slugify } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { BusinessRole } from "@/lib/types";

export function createBusiness(
  ownerId: string,
  input: { name: string; description?: string; industry?: string; website?: string; visibility: "public" | "private" },
): string {
  const db = getDb();
  if (input.name.trim().length < 2) throw new AppError("Business name is required.");
  let slug = slugify(input.name) || "business";
  let counter = 2;
  while (db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).get()) {
    slug = `${slugify(input.name)}-${counter++}`;
  }

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(businesses)
      .values({
        id,
        ownerId,
        name: input.name.trim().slice(0, 120),
        slug,
        description: input.description?.slice(0, 2000) ?? null,
        industry: input.industry?.slice(0, 80) ?? null,
        website: input.website?.slice(0, 300) ?? null,
        visibility: input.visibility,
      })
      .run();
    tx.insert(businessMembers).values({ businessId: id, userId: ownerId, role: "owner" }).run();
  });
  return id;
}

export function businessDetail(businessId: string, viewerId?: string | null) {
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!business) return null;

  const membership = viewerId
    ? db
        .select()
        .from(businessMembers)
        .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, viewerId)))
        .get()
    : undefined;

  const isMember = !!membership || business.ownerId === viewerId;
  if (business.visibility === "private" && !isMember) return null;

  const members = db
    .select({
      id: businessMembers.id,
      role: businessMembers.role,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
    })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, businessId))
    .all();

  const portfolio = db
    .select()
    .from(projects)
    .where(and(eq(projects.businessId, businessId), eq(projects.status, "published")))
    .orderBy(desc(projects.publishedAt))
    .all();

  return { business, members, portfolio, membership: membership ?? null, isMember, role: membership?.role ?? (business.ownerId === viewerId ? "owner" : null) };
}

export function userBusinesses(userId: string) {
  return getDb()
    .select({ business: businesses, role: businessMembers.role })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(eq(businessMembers.userId, userId))
    .all();
}

export function updateBusiness(
  businessId: string,
  viewerId: string,
  input: { name?: string; description?: string; industry?: string; website?: string; visibility?: "public" | "private" },
): void {
  const db = getDb();
  const membership = db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, viewerId)))
    .get();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new ForbiddenError("Only business owners and admins can edit the profile.");
  }
  db.update(businesses)
    .set({
      name: input.name?.slice(0, 120),
      description: input.description?.slice(0, 2000),
      industry: input.industry?.slice(0, 80),
      website: input.website?.slice(0, 300),
      visibility: input.visibility,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(businesses.id, businessId))
    .run();
}

export function addBusinessMember(
  businessId: string,
  actorId: string,
  input: { username: string; role: BusinessRole },
): void {
  const db = getDb();
  const actor = db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, actorId)))
    .get();
  if (!actor || !["owner", "admin"].includes(actor.role)) throw new ForbiddenError("Only owners and admins can add team members.");
  if (input.role === "owner") throw new AppError("Ownership transfer is not supported here.");

  const target = db.select().from(users).where(eq(users.username, input.username.toLowerCase())).get();
  if (!target) throw new NotFoundError("No account with that username.");

  db.insert(businessMembers)
    .values({ businessId, userId: target.id, role: input.role })
    .onConflictDoUpdate({ target: [businessMembers.businessId, businessMembers.userId], set: { role: input.role } })
    .run();
  notify({
    userId: target.id,
    actorId,
    kind: "system",
    title: "You were added to a business team",
    href: "/business",
  });
}

export function removeBusinessMember(businessId: string, actorId: string, memberId: string): void {
  const db = getDb();
  const business = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!business) throw new NotFoundError("Business not found.");
  if (business.ownerId !== actorId) throw new ForbiddenError("Only the owner can remove team members.");
  const member = db.select().from(businessMembers).where(eq(businessMembers.id, memberId)).get();
  if (!member) throw new NotFoundError("Member not found.");
  if (member.userId === business.ownerId) throw new AppError("The owner cannot be removed.");
  db.delete(businessMembers).where(eq(businessMembers.id, memberId)).run();
}

/** Platform analytics only — never presented as externally audited commercial results. */
export function businessAnalytics(businessId: string, viewerId: string) {
  const db = getDb();
  const detail = businessDetail(businessId, viewerId);
  if (!detail || !detail.isMember) throw new ForbiddenError("Only business team members can view analytics.");
  const projectIds = detail.portfolio.map((project) => project.id);
  const followers = projectIds.length
    ? Number(
        db
          .select({ value: sql<number>`count(*)` })
          .from(projectFollows)
          .where(sql`${projectFollows.projectId} in ${projectIds}`)
          .get()?.value ?? 0,
      )
    : 0;
  const views = detail.portfolio.reduce((sum, project) => sum + project.viewCount, 0);
  const events = projectIds.length
    ? Number(
        db
          .select({ value: sql<number>`count(*)` })
          .from(analyticsEvents)
          .where(sql`${analyticsEvents.targetId} in ${projectIds} and ${analyticsEvents.targetType} = 'project'`)
          .get()?.value ?? 0,
      )
    : 0;
  return { followers, views, events, projects: detail.portfolio.length };
}
