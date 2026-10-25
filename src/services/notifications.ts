import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, users } from "@/db/schema";
import { markNotificationsRead } from "@/lib/notify";

export function listNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
  const db = getDb();
  const conditions = [eq(notifications.userId, userId)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));

  return db
    .select({
      notification: notifications,
      actorName: users.displayName,
      actorUsername: users.username,
      actorAvatar: users.avatarFileId,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 50)
    .all();
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

export function markAllRead(userId: string): void {
  getDb()
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .run();
}

export function markRead(userId: string, id: string): void {
  markNotificationsRead(userId, [id]);
}
