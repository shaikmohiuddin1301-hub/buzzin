import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, notifications, userPreferences } from "@/db/schema";

export type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;
};

/**
 * Create an in-app notification.
 *
 * A user's notification matrix can disable a category; anything not explicitly
 * disabled is delivered. Self-notifications are always suppressed.
 */
export function notify(input: NotificationInput): void {
  if (input.actorId && input.actorId === input.userId) return;

  const prefs = getDb().select().from(userPreferences).where(eq(userPreferences.userId, input.userId)).get();
  if (prefs?.notifyMatrix && prefs.notifyMatrix[input.kind] === false) return;

  getDb()
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      actorId: input.actorId ?? null,
    })
    .run();
}

export function notifyMany(userIds: string[], input: Omit<NotificationInput, "userId">): void {
  for (const userId of new Set(userIds)) notify({ ...input, userId });
}

export function audit(entry: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  reasonCode?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): void {
  getDb()
    .insert(auditLogs)
    .values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      reasonCode: entry.reasonCode ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
    })
    .run();
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  getDb()
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
    .run();
}
