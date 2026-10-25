import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, transaction } from "@/db/client";
import {
  conversationMembers,
  conversations,
  messages,
  projectMembers,
  projects,
  reports,
  userPreferences,
  users,
} from "@/db/schema";
import { assertConversationMember, isBlockedEitherWay } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  projectId: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  muted: boolean;
  participants: { id: string; username: string; displayName: string; avatarFileId: string | null }[];
};

export function listConversations(userId: string): ConversationSummary[] {
  const db = getDb();
  const memberships = db
    .select({ conversation: conversations, member: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), isNull(conversationMembers.removedAt)))
    .all();

  if (memberships.length === 0) return [];
  const ids = memberships.map((row) => row.conversation.id);

  const participantRows = db
    .select({
      conversationId: conversationMembers.conversationId,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(inArray(conversationMembers.conversationId, ids), isNull(conversationMembers.removedAt)))
    .all();

  const lastRows = db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(inArray(messages.conversationId, ids), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .all();

  const unreadRows = db
    .select({ conversationId: messages.conversationId, count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, messages.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        isNull(conversationMembers.removedAt),
        ne(messages.senderId, userId),
        sql`(${conversationMembers.lastReadAt} is null or ${messages.createdAt} > ${conversationMembers.lastReadAt})`,
      ),
    )
    .groupBy(messages.conversationId)
    .all();

  const unread = new Map(unreadRows.map((row) => [row.conversationId, Number(row.count)]));

  return memberships
    .map((row) => {
      const participants = participantRows.filter((p) => p.conversationId === row.conversation.id && p.id !== userId);
      const last = lastRows.find((m) => m.conversationId === row.conversation.id);
      const title =
        row.conversation.kind === "direct"
          ? (participants[0]?.displayName ?? "Direct message")
          : (row.conversation.title ?? "Project group");
      return {
        id: row.conversation.id,
        kind: row.conversation.kind,
        title,
        projectId: row.conversation.projectId,
        lastMessage: last?.body ?? null,
        lastAt: last?.createdAt ?? row.conversation.createdAt,
        unread: unread.get(row.conversation.id) ?? 0,
        muted: row.member.muted,
        participants,
      } satisfies ConversationSummary;
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export function unreadMessageCount(userId: string): number {
  return listConversations(userId).reduce((sum, conversation) => sum + conversation.unread, 0);
}

/** Direct conversation creation respects block lists and DM preferences. */
export function getOrCreateDirectConversation(initiatorId: string, otherUserId: string): string {
  if (initiatorId === otherUserId) throw new AppError("You cannot message yourself.");
  if (isBlockedEitherWay(initiatorId, otherUserId)) throw new ForbiddenError("Messaging is blocked between these accounts.");

  const db = getDb();
  const other = db.select().from(users).where(eq(users.id, otherUserId)).get();
  if (!other || other.status !== "active") throw new NotFoundError("Person not found.");

  const prefs = db.select().from(userPreferences).where(eq(userPreferences.userId, otherUserId)).get();
  if (prefs?.allowDirectMessages === "nobody") throw new ForbiddenError("This person does not accept direct messages.");
  if (prefs?.allowDirectMessages === "project_members") {
    const shared = db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, initiatorId), eq(projectMembers.status, "active")))
      .all()
      .map((row) => row.projectId);
    const partner = db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, otherUserId), eq(projectMembers.status, "active")))
      .all()
      .map((row) => row.projectId);
    if (!shared.some((id) => partner.includes(id))) {
      throw new ForbiddenError("This person only accepts messages from people they share a project with.");
    }
  }

  const existing = db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.kind, "direct"),
        inArray(conversationMembers.userId, [initiatorId, otherUserId]),
        isNull(conversationMembers.removedAt),
      ),
    )
    .groupBy(conversations.id)
    .having(sql`count(*) = 2`)
    .get();
  if (existing) return existing.id;

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(conversations).values({ id, kind: "direct", createdBy: initiatorId }).run();
    tx.insert(conversationMembers).values({ conversationId: id, userId: initiatorId }).run();
    tx.insert(conversationMembers).values({ conversationId: id, userId: otherUserId }).run();
  });
  return id;
}

export function ensureProjectGroup(projectId: string, actorId: string): string {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new NotFoundError("Project not found.");
  const membership = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId), eq(projectMembers.status, "active")))
    .get();
  if (!membership) throw new ForbiddenError("Only active project members can open the team chat.");

  const existing = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.projectId, projectId), eq(conversations.kind, "group")))
    .get();
  if (existing) return existing.id;

  const memberIds = db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.status, "active")))
    .all()
    .map((row) => row.userId);

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(conversations)
      .values({ id, kind: "group", projectId, title: `${project.name} team`, createdBy: actorId })
      .run();
    for (const userId of memberIds) {
      tx.insert(conversationMembers).values({ conversationId: id, userId, role: userId === project.ownerId ? "admin" : "member" }).run();
    }
  });
  return id;
}

export function conversationDetail(conversationId: string, userId: string) {
  const { conversation, member } = assertConversationMember(conversationId, userId);
  const db = getDb();
  const members = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarFileId: users.avatarFileId,
      role: conversationMembers.role,
      lastReadAt: conversationMembers.lastReadAt,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.removedAt)))
    .all();

  const rows = db
    .select({
      message: messages,
      senderName: users.displayName,
      senderUsername: users.username,
      senderAvatar: users.avatarFileId,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .all();

  const project = conversation.projectId
    ? db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, conversation.projectId)).get()
    : null;

  return { conversation, member, members, messages: rows, project: project ?? null };
}

export function markConversationRead(conversationId: string, userId: string): void {
  assertConversationMember(conversationId, userId);
  getDb()
    .update(conversationMembers)
    .set({ lastReadAt: new Date().toISOString() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .run();
}

export function sendMessage(
  conversationId: string,
  senderId: string,
  input: { body: string; attachmentId?: string | null },
): string {
  assertConversationMember(conversationId, senderId);
  if (!input.body.trim() && !input.attachmentId) throw new AppError("Write a message first.");
  if (input.body.length > 4000) throw new AppError("Messages are limited to 4,000 characters.");
  rateLimit(`chat:${senderId}`, 60, 60_000);

  const db = getDb();
  const members = db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.removedAt)))
    .all();

  for (const member of members) {
    if (member.userId !== senderId && isBlockedEitherWay(senderId, member.userId)) {
      throw new ForbiddenError("You cannot message this conversation because one participant has blocked you.");
    }
  }

  const id = randomUUID();
  db.insert(messages)
    .values({ id, conversationId, senderId, body: input.body.trim(), attachmentId: input.attachmentId ?? null })
    .run();

  const conversation = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  const href = `/chats/${conversationId}`;
  for (const member of members) {
    notify({
      userId: member.userId,
      actorId: senderId,
      kind: "message",
      title: conversation?.kind === "group" ? `New message in ${conversation.title}` : "New direct message",
      body: input.body.slice(0, 120),
      href,
    });
  }
  return id;
}

export function muteConversation(conversationId: string, userId: string, muted: boolean): void {
  assertConversationMember(conversationId, userId);
  getDb()
    .update(conversationMembers)
    .set({ muted })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .run();
}

export function leaveConversation(conversationId: string, userId: string): void {
  assertConversationMember(conversationId, userId);
  getDb()
    .update(conversationMembers)
    .set({ removedAt: new Date().toISOString() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .run();
}

export function reportMessage(messageId: string, reporterId: string, reasonCode: string, details?: string): string {
  const db = getDb();
  const message = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!message) throw new NotFoundError("Message not found.");
  assertConversationMember(message.conversationId, reporterId);
  const id = randomUUID();
  db.insert(reports)
    .values({
      id,
      reporterId,
      targetType: "message",
      targetId: messageId,
      reasonCode: reasonCode as never,
      details: details?.slice(0, 2000) ?? null,
    })
    .run();
  return id;
}
