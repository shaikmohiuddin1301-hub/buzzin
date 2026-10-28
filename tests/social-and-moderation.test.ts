import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs, posts, reports, users } from "@/db/schema";
import {
  addComment,
  createPost,
  listComments,
  toggleReaction,
  toggleSaved,
  savedFor,
} from "@/services/social";
import {
  conversationDetail,
  ensureProjectGroup,
  getOrCreateDirectConversation,
  listConversations,
  markConversationRead,
  sendMessage,
  unreadMessageCount,
} from "@/services/chat";
import { blockUser, deleteAccount, exportUserData, followUser, followerCounts, listBlocked, unblockUser, updatePreferences } from "@/services/users";
import { applyModeration, assertModerator, auditTrail, listDisputes, resolveDispute } from "@/services/admin";
import { disputeAttribution, listAttributions } from "@/services/tasks";
import { createSession, resolveSession } from "@/lib/session";
import { addMember, makeProject, makeTask, makeUser } from "./helpers";
import { confirmScope, expressInterest, respondToInterest, reviewSubmission, submitWork } from "@/services/tasks";

describe("direct messages", () => {
  it("respects the default project-members-only preference", async () => {
    const a = await makeUser();
    const b = await makeUser();

    expect(() => getOrCreateDirectConversation(a.id, b.id)).toThrow(/only accepts messages/i);

    updatePreferences(b.id, { allowDirectMessages: "everyone" });
    updatePreferences(a.id, { allowDirectMessages: "everyone" });
    const conversationId = getOrCreateDirectConversation(a.id, b.id);
    // Opening the same DM from the other side reuses the thread.
    expect(getOrCreateDirectConversation(b.id, a.id)).toBe(conversationId);
  });

  it("delivers messages, tracks unread counts and marks them read", async () => {
    const a = await makeUser();
    const b = await makeUser();
    updatePreferences(b.id, { allowDirectMessages: "everyone" });
    // People who share a project are team-mates, so their DM is accepted rather
    // than waiting in Requests.
    const { id: projectId } = makeProject(a.id);
    addMember(projectId, b.id);
    const conversationId = getOrCreateDirectConversation(a.id, b.id);

    sendMessage(conversationId, a.id, { body: "Are you free to review the design?" });
    expect(unreadMessageCount(b.id)).toBe(1);

    const detail = conversationDetail(conversationId, b.id);
    expect(detail.messages).toHaveLength(1);

    markConversationRead(conversationId, b.id);
    expect(unreadMessageCount(b.id)).toBe(0);
    expect(listConversations(b.id)[0]!.lastMessage).toContain("review the design");
  });

  it("refuses access to a conversation the viewer is not part of", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const outsider = await makeUser();
    updatePreferences(b.id, { allowDirectMessages: "everyone" });
    const conversationId = getOrCreateDirectConversation(a.id, b.id);

    expect(() => conversationDetail(conversationId, outsider.id)).toThrow();
    expect(() => sendMessage(conversationId, outsider.id, { body: "Hello?" })).toThrow();
  });

  it("stops messages between blocked accounts in both directions", async () => {
    const a = await makeUser();
    const b = await makeUser();
    updatePreferences(b.id, { allowDirectMessages: "everyone" });
    const conversationId = getOrCreateDirectConversation(a.id, b.id);
    sendMessage(conversationId, a.id, { body: "One message before blocking" });

    blockUser(b.id, a.id, "Harassment");
    expect(() => sendMessage(conversationId, a.id, { body: "Second message" })).toThrow(/blocked/i);
    expect(() => getOrCreateDirectConversation(b.id, a.id)).toThrow();
    expect(listBlocked(b.id).map((row) => row.id)).toContain(a.id);

    unblockUser(b.id, a.id);
    sendMessage(conversationId, a.id, { body: "Apologies, that is fine now" });
  });

  it("revokes project group access when a member is removed", async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const { id: projectId } = makeProject(owner.id, { visibility: "private" });
    addMember(projectId, member.id);

    const groupId = ensureProjectGroup(projectId, owner.id);
    sendMessage(groupId, owner.id, { body: "Kick-off at 10:00" });
    expect(conversationDetail(groupId, member.id).messages).toHaveLength(1);

    const { removeMember } = await import("@/services/projects");
    removeMember(projectId, owner, member.id);
    expect(() => conversationDetail(groupId, member.id)).toThrow();
  });
});

describe("social actions", () => {
  it("lets people follow, comment and save content", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    followUser(reader.id, author.id);
    expect(followerCounts(author.id).followers).toBe(1);

    const postId = createPost(author.id, { body: "Day one of the rebuild: the schema is finally stable.", kind: "general" });
    toggleReaction(reader.id, "post", postId);
    toggleSaved(reader.id, "post", postId);
    expect(savedFor(reader.id).posts).toHaveLength(1);

    const commentId = addComment(reader.id, { targetType: "post", targetId: postId, body: "How did you model milestones?" });
    addComment(author.id, { targetType: "post", targetId: postId, body: "One row per milestone with an order index.", parentId: commentId });

    const threads = listComments("post", postId, reader);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies).toHaveLength(1);
  });

  it("blocks comments on a project the viewer cannot see", async () => {
    const owner = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id, { visibility: "private" });

    expect(() => addComment(outsider.id, { targetType: "project", targetId: projectId, body: "Sneaking in" })).toThrow();
  });
});

describe("moderation", () => {
  async function reportPost() {
    const author = await makeUser();
    const reporter = await makeUser();
    const moderator = await makeUser();
    const postId = createPost(author.id, { body: "Buy followers fast, guaranteed, definitely not a scam." });
    const reportId = randomUUID();
    getDb().insert(reports).values({
      id: reportId,
      reporterId: reporter.id,
      targetType: "post",
      targetId: postId,
      reasonCode: "spam",
      details: "This is a promotional spam post with no project behind it.",
    }).run();
    return { author, reporter, moderator, postId, reportId };
  }

  it("requires a moderator role outside the service layer's checks", async () => {
    const user = await makeUser();
    expect(() => assertModerator({ isAdmin: false, isModerator: false })).toThrow(/moderator/i);
    expect(() => assertModerator({ isAdmin: true, isModerator: false })).not.toThrow();
    expect(user.isAdmin).toBe(false);
  });

  it("hides reported content, records the decision and writes an audit log", async () => {
    const { moderator, postId, reportId } = await reportPost();

    expect(() =>
      applyModeration({ reportId, moderatorId: moderator.id, action: "hide_content", reasonCode: "", notes: "Spam" }),
    ).toThrow(/reason code/i);
    expect(() =>
      applyModeration({ reportId, moderatorId: moderator.id, action: "hide_content", reasonCode: "spam", notes: "" }),
    ).toThrow(/internal notes/i);
    expect(() =>
      applyModeration({ reportId, moderatorId: moderator.id, action: "hide_content", reasonCode: "made_up", notes: "Spam" }),
    ).toThrow(/unknown reason code/i);

    applyModeration({
      reportId,
      moderatorId: moderator.id,
      action: "hide_content",
      reasonCode: "spam",
      notes: "Removed promotional spam after review.",
    });

    expect(getDb().select().from(posts).where(eq(posts.id, postId)).get()!.hiddenAt).toBeTruthy();
    expect(getDb().select().from(reports).where(eq(reports.id, reportId)).get()!.status).toBe("resolved");

    const trail = auditTrail(50).filter((row) => row.log.action === "moderation.hide_content");
    expect(trail.length).toBeGreaterThan(0);
    expect(trail[0]!.log.reasonCode).toBe("spam");

    // A closed report cannot be actioned twice.
    expect(() =>
      applyModeration({ reportId, moderatorId: moderator.id, action: "dismiss", reasonCode: "spam", notes: "Second look" }),
    ).toThrow(/already been closed/i);
  });

  it("supports restrictive account action with an audit record", async () => {
    const author = await makeUser();
    const moderator = await makeUser();
    const reportId = randomUUID();
    getDb().insert(reports).values({
      id: reportId,
      reporterId: moderator.id,
      targetType: "user",
      targetId: author.id,
      reasonCode: "harassment",
      details: "Repeated abusive messages after being asked to stop.",
    }).run();

    applyModeration({
      reportId,
      moderatorId: moderator.id,
      action: "suspend_account",
      reasonCode: "harassment",
      notes: "Suspended pending appeal.",
    });

    expect(getDb().select().from(users).where(eq(users.id, author.id)).get()!.status).toBe("suspended");
    expect(
      getDb().select().from(auditLogs).where(and(eq(auditLogs.action, "moderation.suspend_account"))).all().length,
    ).toBeGreaterThan(0);
  });
});

describe("attribution disputes", () => {
  it("lets the contributor dispute their own record and a moderator resolve it", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const moderator = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);
    const eoiId = expressInterest(contributor.id, { projectId, taskId, intent: "help_task" });
    respondToInterest(eoiId, owner, "accepted");
    confirmScope(taskId, contributor.id);
    const submissionId = submitWork(taskId, contributor.id, { note: "Delivered the research summary.", files: [] });
    reviewSubmission(submissionId, owner, "accepted");

    const attribution = listAttributions(contributor.id)[0]!.attribution;
    const stranger = await makeUser();
    expect(() =>
      disputeAttribution(attribution.id, stranger.id, { subject: "Nope", details: "Not my record." }),
    ).toThrow();

    const disputeId = disputeAttribution(attribution.id, contributor.id, {
      subject: "Role is inaccurate",
      details: "The record says Contributor but I led the research phase.",
    });
    expect(listDisputes().some((row) => row.dispute.id === disputeId)).toBe(true);

    expect(() => resolveDispute(disputeId, moderator.id, "resolved", "")).toThrow(/resolution/i);
    resolveDispute(disputeId, moderator.id, "resolved", "Role updated to Research lead.");
    expect(listDisputes().find((row) => row.dispute.id === disputeId)!.dispute.status).toBe("resolved");
  });
});

describe("account data controls", () => {
  it("exports personal data without credentials", async () => {
    const user = await makeUser();
    const data = exportUserData(user.id);
    expect(data.profile.username).toBe(user.username);
    expect(JSON.stringify(data)).not.toContain(user.password);
    expect("passwordHash" in data.profile).toBe(false);
  });

  it("requires the username to confirm deletion and scrubs identifiers", async () => {
    const user = await makeUser();
    const session = createSession(user.id, { ip: "10.5.0.1" });

    expect(() => deleteAccount(user.id, "not-my-username")).toThrow(/type your username/i);

    deleteAccount(user.id, user.username);
    const row = getDb().select().from(users).where(eq(users.id, user.id)).get()!;
    expect(row.status).toBe("deleted");
    expect(row.email).not.toBe(user.email);
    expect(row.displayName).toBe("Deleted account");
    // Sessions are invalidated immediately.
    expect(resolveSession(session.token)).toBeNull();
    expect(() => deleteAccount(user.id, user.username)).toThrow(/type your username/i);
  });
});
