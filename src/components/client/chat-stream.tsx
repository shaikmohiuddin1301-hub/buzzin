"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Live chat updates over server-sent events.
 *
 * The stream carries only the id of a conversation that changed; the server does the
 * rendering, so the client cannot drift from the database. Refreshes are coalesced
 * into one per burst, because a short conversation can produce several messages in a
 * second. `EventSource` reconnects on its own after a dropped connection.
 */
export function ChatStream({ conversationId }: { conversationId?: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    const source = new EventSource("/api/chats/stream");

    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 120);
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { conversationId?: string };
        // On the inbox, any conversation is news; in a thread, only this one.
        if (!conversationId || payload.conversationId === conversationId) refreshSoon();
      } catch {
        // A malformed frame is not worth breaking the stream over.
      }
    };

    source.addEventListener("message", onMessage);
    return () => {
      source.removeEventListener("message", onMessage);
      source.close();
      window.clearTimeout(timer);
    };
  }, [conversationId, router]);

  return null;
}
