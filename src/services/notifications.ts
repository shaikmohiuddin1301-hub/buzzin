import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, users } from "@/db/schema";
import { markNotificationsRead } from "@/lib/notify";

export const NOTIFICATIONS_PAGE_SIZE = 25;

export type NotificationListOptions = {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
};

function conditionsFor(userId: string, unreadOnly?: boolean) {
  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(isNull(notifications.readAt));
  return conditions;
}

export function listNotifications(userId: string, options: NotificationListOptions = {}) {
  const db = getDb();
  return db
    .select({
      notification: notifications,
      actorName: users.displayName,
      actorUsername: users.username,
      actorAvatar: users.avatarFileId,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(and(...conditionsFor(userId, options.unreadOnly)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(options.limit ?? 50, 100))
    .offset(Math.max(options.offset ?? 0, 0))
    .all();
}

/** Total rows behind a list view, so pagination cannot lie about the last page. */
export function countNotifications(userId: string, options: { unreadOnly?: boolean } = {}): number {
  return Number(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(...conditionsFor(userId, options.unreadOnly)))
      .get()?.count ?? 0,
  );
}

export function unreadNotificationCount(userId: string): number {
  return Number(
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .get()?.count ?? 0,
  );
}

/** One notification, scoped to its owner. Another user's id resolves to null. */
export function getNotificationForUser(userId: string, id: string) {
  if (!id) return null;
  return (
    getDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .get() ?? null
  );
}

export function markAllRead(userId: string): number {
  const result = getDb()
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .run();
  return result.changes;
}

export function markRead(userId: string, id: string): void {
  markNotificationsRead(userId, [id]);
}
