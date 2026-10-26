import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, projectInvitations } from "@/db/schema";
import { notify, safeNotificationHref } from "@/lib/notify";
import { createResource } from "@/services/learning";
import {
  assignContributor,
  removeAssignee,
  reviewSubmission,
  setTaskStatus,
  submitWork,
  taskDetail,
} from "@/services/tasks";
import {
  inviteToProject,
  postProjectUpdate,
  removeMember,
  respondToInvitation,
  toggleProjectFollow,
} from "@/services/projects";
import { addComment, createPost } from "@/services/social";
import {
  ensureGroupConversation,
  getOrCreateDirectConversation,
  muteConversation,
  sendMessage,
} from "@/services/chat";
import { blockUser, followUser, updatePreferences } from "@/services/users";
import {
  getNotificationForUser,
  listNotifications,
  markAllRead,
  markRead,
  unreadNotificationCount,
} from "@/services/notifications";
import { addMember, makeProject, makeTask, makeUser } from "./helpers";

function forUser(userId: string, kind?: string) {
  const rows = getDb().select().from(notifications).where(eq(notifications.userId, userId)).all();
  return kind ? rows.filter((row) => row.kind === kind) : rows;
}

describe("task notifications", () => {
  it("notifies the assignee once, not the owner, when work is assigned", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    assignContributor(taskId, owner, contributor.id);
    // A double-submitted assignment form is the common duplicate source.
    assignContributor(taskId, owner, contributor.id);

    const assigned = forUser(contributor.id, "task_assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0]!.href).toBe(`/tasks/${taskId}`);
    expect(assigned[0]!.entityType).toBe("task");
    expect(assigned[0]!.entityId).toBe(taskId);
    expect(forUser(owner.id)).toHaveLength(0);
  });

  it("notifies the owner and every reviewer when work is submitted", async () => {
    const owner = await makeUser();
    const reviewer = await makeUser();
    const collaborator = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);
    addMember(projectId, reviewer.id, "reviewer");
    addMember(projectId, collaborator.id, "collaborator");
    assignContributor(taskId, owner, contributor.id);

    submitWork(taskId, contributor.id, { note: "Ready for review.", files: [] });

    expect(forUser(owner.id, "submission_received")).toHaveLength(1);
    expect(forUser(reviewer.id, "submission_received")).toHaveLength(1);
    expect(forUser(collaborator.id, "submission_received")).toHaveLength(0);
    expect(forUser(owner.id, "submission_received")[0]!.href).toBe(`/tasks/${taskId}`);
  });

  it("tells the contributor about requested changes and about acceptance", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);
    assignContributor(taskId, owner, contributor.id);

    const first = submitWork(taskId, contributor.id, { note: "First pass.", files: [] });
    reviewSubmission(first, owner, "revision_requested", "Please include the research notes.");
    const changes = forUser(contributor.id, "submission_reviewed");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.body).toContain("research notes");
    expect(changes[0]!.href).toBe(`/tasks/${taskId}`);

    const second = submitWork(taskId, contributor.id, { note: "Notes added.", files: [] });
    reviewSubmission(second, owner, "accepted");

    const accepted = forUser(contributor.id, "contribution_confirmed");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.href).toBe(`/projects/${projectId}/accepted`);
  });

  it("does not create a notification when the underlying action fails", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);
    assignContributor(taskId, owner, contributor.id);

    expect(() => submitWork(taskId, outsider.id, { note: "Sneaky.", files: [] })).toThrow();
    expect(forUser(owner.id, "submission_received")).toHaveLength(0);
  });

  it("notifies on assignment changes and cancellation, once each", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id);

    assignContributor(taskId, owner, contributor.id);
    removeAssignee(taskId, owner, contributor.id);
    expect(forUser(contributor.id)).toHaveLength(2);

    assignContributor(taskId, owner, contributor.id);
    expect(forUser(contributor.id, "task_assigned")).toHaveLength(2);
    const removed = forUser(contributor.id).find((row) => row.title.startsWith("You were removed from a task"));
    expect(removed?.href).toBe(`/projects/${projectId}?tab=tasks`);

    setTaskStatus(taskId, owner, "cancelled");
    const cancelled = forUser(contributor.id).find((row) => row.title.startsWith("Task cancelled"));
    expect(cancelled?.href).toBe(`/tasks/${taskId}`);
  });
});

describe("comment and mention notifications", () => {
  it("links a comment to the post and a reply to the parent author", async () => {
    const owner = await makeUser();
    const commenter = await makeUser();
    const replier = await makeUser();
    const postId = createPost(owner.id, { body: "A post worth discussing.", publish: true });

    const commentId = addComment(commenter.id, { targetType: "post", targetId: postId, body: "A considered comment." });
    const ownerRows = forUser(owner.id, "comment");
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]!.href).toBe(`/posts/${postId}`);
    expect(ownerRows[0]!.body).toBeNull();

    addComment(replier.id, { targetType: "post", targetId: postId, body: "Replying to you.", parentId: commentId });
    const replyRows = forUser(commenter.id, "comment");
    expect(replyRows).toHaveLength(1);
    expect(replyRows[0]!.title).toMatch(/replied/i);
    expect(replyRows[0]!.href).toBe(`/posts/${postId}`);
  });

  it("does not notify the author about their own comment", async () => {
    const owner = await makeUser();
    const postId = createPost(owner.id, { body: "Self reply test.", publish: true });
    addComment(owner.id, { targetType: "post", targetId: postId, body: "My own comment." });
    expect(forUser(owner.id, "comment")).toHaveLength(0);
  });

  it("notifies assignees about a task comment and keeps outsiders out", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const outsider = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    const taskId = makeTask(projectId, owner.id, { visibility: "private" });
    assignContributor(taskId, owner, contributor.id);

    addComment(owner.id, { targetType: "task", targetId: taskId, body: "Please check the brief." });

    const rows = forUser(contributor.id, "comment");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.href).toBe(`/tasks/${taskId}`);
    expect(() => addComment(outsider.id, { targetType: "task", targetId: taskId, body: "Intruding." })).toThrow();
  });
});

describe("project invitations and updates", () => {
  it("notifies the invitee, refuses duplicate invitations and tells the inviter the outcome", async () => {
    const owner = await makeUser();
    const invitee = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    inviteToProject(projectId, owner, { userId: invitee.id, role: "collaborator", message: "Join us." });
    const invitation = getDb().select().from(projectInvitations).where(eq(projectInvitations.inviteeId, invitee.id)).get()!;
    expect(forUser(invitee.id, "invitation")).toHaveLength(1);
    // The note stays on the invitation; it is not copied into a notification.
    expect(forUser(invitee.id, "invitation")[0]!.body).toBeNull();

    expect(() => inviteToProject(projectId, owner, { userId: invitee.id, role: "collaborator" })).toThrow(/pending invitation/i);

    respondToInvitation(invitation.id, invitee.id, true);
    const accepted = forUser(owner.id, "invitation");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.title).toMatch(/accepted/i);
    expect(accepted[0]!.href).toBe(`/projects/${projectId}?tab=team`);
  });

  it("notifies the inviter when an invitation is declined", async () => {
    const owner = await makeUser();
    const invitee = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    inviteToProject(projectId, owner, { userId: invitee.id, role: "observer" });
    const invitation = getDb().select().from(projectInvitations).where(eq(projectInvitations.inviteeId, invitee.id)).get()!;

    respondToInvitation(invitation.id, invitee.id, false);

    const rows = forUser(owner.id, "invitation");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toMatch(/declined/i);
  });

  it("notifies followers of a public project update and honours their preference", async () => {
    const owner = await makeUser();
    const follower = await makeUser();
    const { id: projectId } = makeProject(owner.id);

    toggleProjectFollow(projectId, follower.id);
    expect(forUser(owner.id, "new_follower")).toHaveLength(1);

    postProjectUpdate(projectId, owner, { title: "Milestone reached", body: "We shipped the first version.", visibility: "public" });
    const updates = forUser(follower.id, "project_update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.href).toBe(`/projects/${projectId}?tab=progress`);

    updatePreferences(follower.id, { notifyMatrix: { project_update: false } });
    postProjectUpdate(projectId, owner, { title: "Second milestone", body: "Another update for the project.", visibility: "public" });
    expect(forUser(follower.id, "project_update")).toHaveLength(1);

    // A team-only update is not announced to followers at all.
    postProjectUpdate(projectId, owner, { title: "Internal note", body: "Only the team should see this.", visibility: "private" });
    expect(forUser(follower.id, "project_update")).toHaveLength(1);
  });
});

describe("chat notifications", () => {
  it("notifies a direct recipient without exposing the message body", async () => {
    const sender = await makeUser();
    const recipient = await makeUser();
    const { id: projectId } = makeProject(sender.id);
    addMember(projectId, recipient.id);

    const conversationId = getOrCreateDirectConversation(sender.id, recipient.id);
    sendMessage(conversationId, sender.id, { body: "The confidential launch date is Friday." });

    const rows = forUser(recipient.id, "message");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBeNull();
    expect(rows[0]!.title).toBe("New direct message");
    expect(rows[0]!.href).toBe(`/chats/${conversationId}`);
    expect(forUser(sender.id, "message")).toHaveLength(0);
  });

  it("keeps group chat quiet except for mentions and replies, and respects mute", async () => {
    const owner = await makeUser();
    const mentioned = await makeUser();
    const other = await makeUser();
    const { id: projectId } = makeProject(owner.id);
    addMember(projectId, mentioned.id);
    addMember(projectId, other.id);
    const conversationId = ensureGroupConversation(projectId, "Team chat", owner.id);

    sendMessage(conversationId, owner.id, { body: "General update for everyone." });
    expect(forUser(mentioned.id, "message")).toHaveLength(0);
    expect(forUser(other.id, "message")).toHaveLength(0);

    sendMessage(conversationId, owner.id, { body: `@${mentioned.username} can you check this?` });
    const mentionRows = forUser(mentioned.id, "mention");
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]!.href).toBe(`/chats/${conversationId}`);
    expect(mentionRows[0]!.body).toBeNull();
    expect(forUser(other.id, "mention")).toHaveLength(0);

    muteConversation(conversationId, mentioned.id, true);
    sendMessage(conversationId, owner.id, { body: `@${mentioned.username} one more thing` });
    expect(forUser(mentioned.id, "mention")).toHaveLength(1);
  });
});

describe("delivery rules", () => {
  it("deduplicates an event and rejects unsafe destinations", async () => {
    const user = await makeUser();

    expect(notify({ userId: user.id, kind: "comment", title: "First", dedupeKey: "event:1" })).toBe(true);
    expect(notify({ userId: user.id, kind: "comment", title: "Duplicate", dedupeKey: "event:1" })).toBe(false);
    expect(forUser(user.id, "comment")).toHaveLength(1);

    expect(safeNotificationHref("/tasks/abc")).toBe("/tasks/abc");
    expect(safeNotificationHref("javascript:alert(1)")).toBeNull();
    expect(safeNotificationHref("//evil.example")).toBeNull();
    expect(safeNotificationHref("/\\evil.example")).toBeNull();

    notify({ userId: user.id, kind: "comment", title: "Unsafe", href: "javascript:alert(1)" });
    expect(forUser(user.id, "comment").find((row) => row.title === "Unsafe")?.href).toBeNull();
  });

  it("respects optional preferences while always delivering safety notices", async () => {
    const user = await makeUser();
    updatePreferences(user.id, { notifyMatrix: { comment: false, security: false } });

    notify({ userId: user.id, kind: "comment", title: "Optional comment" });
    notify({ userId: user.id, kind: "security", title: "Security notice" });

    expect(forUser(user.id, "comment")).toHaveLength(0);
    expect(forUser(user.id, "security")).toHaveLength(1);
  });

  it("suppresses notifications across a block", async () => {
    const author = await makeUser();
    const reader = await makeUser();
    const postId = createPost(author.id, { body: "A post before the block.", publish: true });

    addComment(reader.id, { targetType: "post", targetId: postId, body: "First comment." });
    expect(forUser(author.id, "comment")).toHaveLength(1);

    blockUser(author.id, reader.id);
    expect(forUser(reader.id, "security")).toHaveLength(1);

    addComment(reader.id, { targetType: "post", targetId: postId, body: "Second comment after the block." });
    expect(forUser(author.id, "comment")).toHaveLength(1);
  });

  it("tracks unread state in the database and scopes reads to the owner", async () => {
    const user = await makeUser();
    const other = await makeUser();
    notify({ userId: user.id, kind: "comment", title: "One" });
    notify({ userId: user.id, kind: "comment", title: "Two" });

    expect(unreadNotificationCount(user.id)).toBe(2);
    expect(listNotifications(user.id)).toHaveLength(2);

    const first = listNotifications(user.id)[0]!.notification;
    markRead(user.id, first.id);
    expect(unreadNotificationCount(user.id)).toBe(1);
    expect(getNotificationForUser(other.id, first.id)).toBeNull();
    expect(markAllRead(user.id)).toBe(1);
    expect(unreadNotificationCount(user.id)).toBe(0);
    // The read timestamp is stored, so a refresh or a new session sees the same state.
    expect(forUser(user.id).every((row) => !!row.readAt)).toBe(true);
  });

  it("stops an old notification destination working after access is revoked", async () => {
    const owner = await makeUser();
    const contributor = await makeUser();
    const { id: projectId } = makeProject(owner.id, { visibility: "private" });
    const taskId = makeTask(projectId, owner.id, { visibility: "private" });
    assignContributor(taskId, owner, contributor.id);
    expect(taskDetail(taskId, { id: contributor.id })).not.toBeNull();

    removeMember(projectId, owner, contributor.id);

    expect(taskDetail(taskId, { id: contributor.id })).toBeNull();
    expect(forUser(contributor.id, "task_assigned")[0]!.href).toBe(`/tasks/${taskId}`);
  });
});

describe("teaching notifications", () => {
  it("tells followers about new material only while the category is enabled", async () => {
    const creator = await makeUser();
    const follower = await makeUser();
    followUser(follower.id, creator.id);

    const input = {
      title: "A practical guide to notification design",
      summary: "How to avoid alert fatigue.",
      level: "beginner" as const,
      format: "article" as const,
      priceCents: 0,
      publish: true,
    };
    const first = createResource(creator.id, input);
    const rows = forUser(follower.id, "teaching_published");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.href).toBe(`/learn/${first.id}`);

    updatePreferences(follower.id, { notifyMatrix: { teaching_published: false } });
    createResource(creator.id, { ...input, title: "A second guide for followers" });
    expect(forUser(follower.id, "teaching_published")).toHaveLength(1);
  });
});
