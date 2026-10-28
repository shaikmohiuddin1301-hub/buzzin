import { EventEmitter } from "node:events";

/**
 * In-process chat notifications.
 *
 * When a message is written, the server publishes which conversation changed and
 * who may see it. Open streams subscribed for those people push the change to the
 * browser, which refreshes the affected view — no interval, no full-page reload.
 *
 * The listener lives on `globalThis` so Next's hot reload does not leave a stale
 * emitter behind in development. This is deliberately single-process: a deploy with
 * several instances would need a shared transport, and the stream still degrades to
 * a manual refresh rather than showing wrong data.
 */
type ChatActivity = {
  conversationId: string;
  /** Members allowed to see this conversation, after request status is applied. */
  memberIds: string[];
};

const globalForChatEvents = globalThis as unknown as { __btChatEvents?: EventEmitter };
const bus = globalForChatEvents.__btChatEvents ?? new EventEmitter();
// One listener per open tab; the default cap of 10 would warn on a busy account.
bus.setMaxListeners(0);
globalForChatEvents.__btChatEvents = bus;

const EVENT = "activity";

export function publishChatActivity(activity: ChatActivity): void {
  if (activity.memberIds.length === 0) return;
  bus.emit(EVENT, activity);
}

/** Subscribe one reader; the returned function detaches it when the stream closes. */
export function subscribeToChatActivity(
  userId: string,
  listener: (conversationId: string) => void,
): () => void {
  const handler = (activity: ChatActivity) => {
    if (activity.memberIds.includes(userId)) listener(activity.conversationId);
  };
  bus.on(EVENT, handler);
  return () => {
    bus.off(EVENT, handler);
  };
}
