import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, blockedUsers, notifications, userPreferences } from "@/db/schema";
import { ESSENTIAL_NOTIFICATION_KINDS } from "@/lib/types";

export type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;
  /**
   * Idempotency key, scoped to the recipient. Use the identity of the event
   * (submission id, message id, invitation id…) so a retried or replayed action
   * writes one notification instead of two.
   */
  dedupeKey?: string | null;
  /** The object this notification is about, e.g. `task` / `submission`. */
  entityType?: string | null;
  entityId?: string | null;
};

const ESSENTIAL = new Set<string>(ESSENTIAL_NOTIFICATION_KINDS);

/**
 * Only in-app paths are valid notification destinations.
 *
 * A notification can be written by many services and later handed to a redirect;
 * rejecting protocol-relative URLs and control characters here means a bad href
 * can never become an open redirect or a `javascript:` link.
 */
export function safeNotificationHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.length === 0 || value.length > 500) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

function isDuplicate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|duplicate key/i.test(message);
}

/**
 * Create one in-app notification.
 *
 * Delivery is best-effort by design: the business action that raised the event has
 * already committed, so a failure to write the notification is logged and swallowed
 * rather than turning a successful assignment, review or message into an error the
 * user would retry. The row is the source of truth once it exists; there is no
 * client-side notification state.
 *
 * Rules applied here for every caller:
 *  - never notify the actor about their own action;
 *  - never notify across a block in either direction;
 *  - respect the recipient's category preferences (safety notices are mandatory);
 *  - only store safe, internal destination paths;
 *  - deduplicate on `dedupeKey` when one is supplied.
 */
export function notify(input: NotificationInput): boolean {
  if (input.actorId && input.actorId === input.userId) return false;

  try {
    const db = getDb();

    if (input.actorId) {
      const blocked = db
        .select({ id: blockedUsers.id })
        .from(blockedUsers)
        .where(
          or(
            and(eq(blockedUsers.blockerId, input.userId), eq(blockedUsers.blockedId, input.actorId)),
            and(eq(blockedUsers.blockerId, input.actorId), eq(blockedUsers.blockedId, input.userId)),
          ),
        )
        .get();
      if (blocked) return false;
    }

    if (!ESSENTIAL.has(input.kind)) {
      const prefs = db.select().from(userPreferences).where(eq(userPreferences.userId, input.userId)).get();
      if (prefs?.notifyMatrix && prefs.notifyMatrix[input.kind] === false) return false;
    }

    const dedupeKey = input.dedupeKey?.trim().slice(0, 200) || null;
    if (dedupeKey) {
      const existing = db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, dedupeKey)))
        .get();
      if (existing) return false;
    }

    db.insert(notifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 240),
        body: input.body?.slice(0, 1000) ?? null,
        href: safeNotificationHref(input.href),
        actorId: input.actorId ?? null,
        dedupeKey,
        entityType: input.entityType?.slice(0, 40) ?? null,
        entityId: input.entityId?.slice(0, 100) ?? null,
      })
      .run();
    return true;
  } catch (error) {
    if (isDuplicate(error)) return false;
    // Never include the recipient, title or body: those can carry private
    // project or message content. The kind is enough to find the producer.
    console.error(`[notify] could not store a "${input.kind}" notification`);
    return false;
  }
}

export function notifyMany(userIds: string[], input: Omit<NotificationInput, "userId">): number {
  let delivered = 0;
  for (const userId of new Set(userIds)) {
    if (notify({ ...input, userId })) delivered += 1;
  }
  return delivered;
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
