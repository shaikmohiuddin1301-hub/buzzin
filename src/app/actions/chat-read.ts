"use server";

import { revalidatePath } from "next/cache";
import { requireUserOrThrow } from "@/lib/auth";
import { markConversationRead } from "@/services/chat";

/**
 * Read receipts without a navigation.
 *
 * Opening a thread marks it read, but it must not redirect or refresh the page the
 * reader is typing in. This action writes the timestamp and revalidates the inbox,
 * so the list is correct the next time it is visited; the caller ignores the
 * result. Using the existing action would submit a form and navigate, which can
 * clear a draft the reader has already started.
 */
export async function markConversationReadSilently(conversationId: string): Promise<void> {
  const user = await requireUserOrThrow();
  markConversationRead(conversationId, user.id);
  revalidatePath("/chats");
}
