import { describe, expect, it } from "vitest";
import {
  getOrCreateDirectConversation,
  listConversations,
  listMessageRequests,
  respondToMessageRequest,
  sendMessage,
  unreadMessageCount,
} from "@/services/chat";
import { updatePreferences } from "@/services/users";
import { publishChatActivity, subscribeToChatActivity } from "@/lib/chat-events";
import { addMember, makeProject, makeUser } from "./helpers";

describe("message requests", () => {
  it("holds a first message from outside your projects until you accept it", async () => {
    const sender = await makeUser();
    const recipient = await makeUser();
    updatePreferences(recipient.id, { allowDirectMessages: "everyone" });

    const conversationId = getOrCreateDirectConversation(sender.id, recipient.id);
    sendMessage(conversationId, sender.id, { body: "Hello from outside your projects." });

    // Out of the inbox, out of the badge, visible as a request.
    expect(listConversations(recipient.id)).toHaveLength(0);
    expect(unreadMessageCount(recipient.id)).toBe(0);
    const requests = listMessageRequests(recipient.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.conversationId).toBe(conversationId);
    expect(requests[0]!.from.id).toBe(sender.id);
    expect(requests[0]!.preview).toContain("outside your projects");

    // The recipient cannot reply until they accept.
    expect(() => sendMessage(conversationId, recipient.id, { body: "Thanks" })).toThrow(/accept/i);

    respondToMessageRequest(conversationId, recipient.id, true);

    expect(listMessageRequests(recipient.id)).toHaveLength(0);
    expect(listConversations(recipient.id).map((conversation) => conversation.id)).toEqual([conversationId]);
    // Accepting leaves the waiting message unread, rather than skipping it.
    expect(unreadMessageCount(recipient.id)).toBe(1);
    sendMessage(conversationId, recipient.id, { body: "Thanks, go ahead." });
  });

  it("goes straight to the inbox for people who already share a project", async () => {
    const owner = await makeUser();
    const teammate = await makeUser();
    updatePreferences(teammate.id, { allowDirectMessages: "everyone" });
    const { id: projectId } = makeProject(owner.id);
    addMember(projectId, teammate.id);

    const conversationId = getOrCreateDirectConversation(owner.id, teammate.id);

    expect(listMessageRequests(teammate.id)).toHaveLength(0);
    expect(listConversations(teammate.id).map((conversation) => conversation.id)).toEqual([conversationId]);
  });

  it("dismissing keeps the history and reopens on the next message", async () => {
    const sender = await makeUser();
    const recipient = await makeUser();
    updatePreferences(recipient.id, { allowDirectMessages: "everyone" });
    const conversationId = getOrCreateDirectConversation(sender.id, recipient.id);
    sendMessage(conversationId, sender.id, { body: "First request." });

    respondToMessageRequest(conversationId, recipient.id, false);

    expect(listMessageRequests(recipient.id)).toHaveLength(0);
    expect(listConversations(recipient.id)).toHaveLength(0);
    // A second answer is refused: the request is no longer pending.
    expect(() => respondToMessageRequest(conversationId, recipient.id, true)).toThrow(/already/i);

    sendMessage(conversationId, sender.id, { body: "Writing again, same thread." });
    expect(listMessageRequests(recipient.id)[0]!.conversationId).toBe(conversationId);
    expect(getOrCreateDirectConversation(sender.id, recipient.id)).toBe(conversationId);
  });
});

describe("chat activity bus", () => {
  it("wakes only the readers in the conversation and detaches cleanly", () => {
    const heard: string[] = [];
    const detached: string[] = [];
    const stopA = subscribeToChatActivity("user-a", (id) => heard.push(`a:${id}`));
    const stopB = subscribeToChatActivity("user-b", (id) => detached.push(`b:${id}`));

    publishChatActivity({ conversationId: "conv-1", memberIds: ["user-a"] });
    expect(heard).toEqual(["a:conv-1"]);
    expect(detached).toEqual([]);

    stopA();
    publishChatActivity({ conversationId: "conv-2", memberIds: ["user-a"] });
    expect(heard).toEqual(["a:conv-1"]);

    stopB();
    publishChatActivity({ conversationId: "conv-3", memberIds: ["user-b"] });
    expect(detached).toEqual([]);
  });
});
