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
  tasks,
  userPreferences,
  users,
  workAreas,
} from "@/db/schema";
import { assertConversationMember, isBlockedEitherWay, requireProjectAccess, type Viewer } from "@/lib/authz";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createTask } from "@/services/tasks";

export type ConversationSummary = {
  id: string;
  kind: "direct" | "group";
  title: string;
  projectId: string | null;
  /** Set when this conversation is the dedicated chat for one task. */
  taskId: string | null;
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
        taskId: row.conversation.taskId ?? null,
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

/**
 * Keep a project group conversation in step with the project team.
 *
 * Adding someone to the team does not otherwise give them access to a chat that
 * was created earlier; syncing here means opened chats never drift from the
 * membership list. Removed members are not re-added.
 */
function syncGroupMembers(conversationId: string, projectId: string): void {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return;
  const memberIds = db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.status, "active")))
    .all()
    .map((row) => row.userId);
  const existing = db
    .select({ userId: conversationMembers.userId, removedAt: conversationMembers.removedAt })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
    .all();
  const known = new Set(existing.map((row) => row.userId));
  for (const userId of memberIds) {
    if (!known.has(userId)) {
      db.insert(conversationMembers)
        .values({ conversationId, userId, role: userId === project.ownerId ? "admin" : "member" })
        .onConflictDoNothing()
        .run();
    }
  }
}

/**
 * Create or reuse a project group conversation.
 *
 * `existingId` is used by work areas, which own a chat of their own; the project
 * team chat deliberately excludes any conversation a work area claims.
 */
export function ensureGroupConversation(
  projectId: string,
  title: string,
  actorId: string,
  existingId?: string | null,
): string {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new NotFoundError("Project not found.");
  const membership = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId), eq(projectMembers.status, "active")))
    .get();
  if (!membership) throw new ForbiddenError("Only active project members can open this chat.");

  if (existingId) {
    syncGroupMembers(existingId, projectId);
    return existingId;
  }

  const memberIds = db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.status, "active")))
    .all()
    .map((row) => row.userId);

  const id = randomUUID();
  transaction((tx) => {
    tx.insert(conversations).values({ id, kind: "group", projectId, title: title.slice(0, 120), createdBy: actorId }).run();
    for (const userId of memberIds) {
      tx.insert(conversationMembers)
        .values({ conversationId: id, userId, role: userId === project.ownerId ? "admin" : "member" })
        .onConflictDoNothing()
        .run();
    }
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

  // A work-area chat is also a project group; only the unclaimed one is the team chat.
  const existing = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.projectId, projectId),
        eq(conversations.kind, "group"),
        sql`${conversations.id} not in (select conversation_id from work_areas where conversation_id is not null)`,
      ),
    )
    .get();
  if (existing) {
    syncGroupMembers(existing.id, projectId);
    return existing.id;
  }

  return ensureGroupConversation(projectId, `${project.name} team`, actorId);
}

/** Project/task a conversation belongs to, used to file uploads against the work. */
export function conversationScope(conversationId: string) {
  return (
    getDb()
      .select({ projectId: conversations.projectId, taskId: conversations.taskId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get() ?? null
  );
}

/**
 * One task, one conversation. Created together with the task and kept in sync
 * whenever responsibility for the work changes; see `services/taskChats.ts`.
 */
export { ensureTaskChat } from "@/services/taskChats";

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

  const area = db
    .select({ id: workAreas.id, name: workAreas.name, projectId: workAreas.projectId })
    .from(workAreas)
    .where(eq(workAreas.conversationId, conversationId))
    .get();

  const task = conversation.taskId
    ? db.select({ id: tasks.id, title: tasks.title, status: tasks.status }).from(tasks).where(eq(tasks.id, conversation.taskId)).get()
    : null;

  return { conversation, member, members, messages: rows, project: project ?? null, area: area ?? null, task: task ?? null };
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
  input: { body: string; attachmentId?: string | null; parentId?: string | null },
): string {
  assertConversationMember(conversationId, senderId);
  if (!input.body.trim() && !input.attachmentId) throw new AppError("Write a message first.");
  if (input.body.length > 4000) throw new AppError("Messages are limited to 4,000 characters.");
  rateLimit(`chat:${senderId}`, 60, 60_000);

  const db = getDb();
  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = db.select().from(messages).where(eq(messages.id, input.parentId)).get();
    if (!parent || parent.conversationId !== conversationId) throw new AppError("That message is not part of this conversation.");
    // One level keeps threads readable instead of turning a chat into a tree.
    if (parent.parentId) throw new AppError("Reply to the original message rather than a reply.");
    parentId = parent.id;
    parentAuthorId = parent.senderId;
  }
  const members = db
    .select({ userId: conversationMembers.userId, muted: conversationMembers.muted, username: users.username })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, conversationId), isNull(conversationMembers.removedAt)))
    .all();

  for (const member of members) {
    if (member.userId !== senderId && isBlockedEitherWay(senderId, member.userId)) {
      throw new ForbiddenError("You cannot message this conversation because one participant has blocked you.");
    }
  }

  const id = randomUUID();
  db.insert(messages)
    .values({ id, conversationId, senderId, body: input.body.trim(), attachmentId: input.attachmentId ?? null, parentId })
    .run();

  const conversation = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  const href = `/chats/${conversationId}`;

  // Mentions are explicit intent to reach a person. A busy group chat otherwise
  // stays quiet: only the reply target and @mentioned members are notified. The
  // message body is deliberately not copied into the notification (it may be
  // confidential and would end up in a preview).
  const mentioned = new Set(
    [...input.body.matchAll(/(?:^|[\s(])@([a-z0-9_.-]{2,30})/gi)].map((match) =>
      match[1]!.toLowerCase().replace(/[.-]+$/, ""),
    ),
  );
  const recipients = new Map<string, { kind: "message" | "mention"; title: string }>();
  const groupTitle = conversation?.title ?? "a conversation";

  for (const member of members) {
    if (member.userId === senderId || member.muted) continue;
    const isDirect = conversation?.kind !== "group";
    const isMentioned = mentioned.has(member.username.toLowerCase());
    const isReplyTarget = parentAuthorId === member.userId;
    if (!isDirect && !isMentioned && !isReplyTarget) continue;

    recipients.set(member.userId, {
      kind: isMentioned ? "mention" : "message",
      title: isDirect
        ? "New direct message"
        : isMentioned
          ? `You were mentioned in ${groupTitle}`
          : `New reply in ${groupTitle}`,
    });
  }

  for (const [userId, message] of recipients) {
    notify({
      userId,
      actorId: senderId,
      kind: message.kind,
      title: message.title,
      href,
      dedupeKey: `message:${id}`,
      entityType: "conversation",
      entityId: conversationId,
    });
  }
  return id;
}

/**
 * Turn one chat message into a task.
 *
 * The task keeps a reference to the message, takes the work area of the chat it
 * came from, and starts private to the team: a conversation is not an announcement,
 * so nothing becomes public just because someone filed it.
 */
export function createDropFromMessage(messageId: string, viewer: { id: string }): string {
  const db = getDb();
  const message = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!message) throw new NotFoundError("Message not found.");
  assertConversationMember(message.conversationId, viewer.id);
  if (message.taskId) throw new AppError("That message is already filed as a task.", { status: 409, code: "already_filed" });

  const conversation = db.select().from(conversations).where(eq(conversations.id, message.conversationId)).get();
  if (!conversation?.projectId) throw new AppError("Only project conversations can produce tasks.");
  requireProjectAccess(conversation.projectId, viewer, "edit");

  const firstLine = message.body.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  const title = firstLine.replace(/^[#>*\-\s]+/, "").slice(0, 90).trim();
  if (title.length < 4) throw new AppError("That message is too short to become a task. Add a clearer title first.");

  const sender = db.select({ displayName: users.displayName }).from(users).where(eq(users.id, message.senderId)).get();
  const area = db
    .select({ id: workAreas.id, name: workAreas.name })
    .from(workAreas)
    .where(eq(workAreas.conversationId, message.conversationId))
    .get();

  const taskId = createTask(conversation.projectId, viewer, {
    title,
    description: `${message.body}\n\n— from ${sender?.displayName ?? "a team member"} in ${conversation.title ?? "the project chat"}`,
    objective: "Agreed in the project chat. The task is the place to track it.",
    acceptanceCriteria: "The work answers the request in the original message and a reviewer accepts it here.",
    compensationType: "unpaid",
    compensationDetails: "Portfolio credit and a reference. No payment is implied.",
    visibility: "private",
    skills: [],
    publish: true,
    workAreaId: area?.id ?? null,
  });

  db.update(messages).set({ taskId }).where(eq(messages.id, messageId)).run();

  for (const member of db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, message.conversationId), isNull(conversationMembers.removedAt)))
    .all()) {
    notify({
      userId: member.userId,
      actorId: viewer.id,
      kind: "system",
      title: `New task from chat: ${title}`,
      body: area ? `Filed under ${area.name}.` : "Filed in the project inbox.",
      href: `/tasks/${taskId}`,
    });
  }

  return taskId;
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
