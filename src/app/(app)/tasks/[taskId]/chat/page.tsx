import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureTaskChat } from "@/services/chat";

export const dynamic = "force-dynamic";

/**
 * Opening a task chat for the first time creates it with the task's people.
 * There is no separate "set up a chat" step anywhere in the product.
 */
export default async function OpenTaskChatPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const user = await requireUser();

  let conversationId: string;
  try {
    conversationId = ensureTaskChat(taskId, user);
  } catch {
    notFound();
  }

  redirect(`/chats/${conversationId}`);
}
