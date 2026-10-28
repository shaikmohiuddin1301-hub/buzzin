"use client";

import { useEffect, useRef } from "react";
import { markConversationReadSilently } from "@/app/actions/chat-read";

/**
 * Opening a conversation reads it.
 *
 * The inbox badge is a real server count, so the thread marks itself read through a
 * server action rather than pretending on the client. The action deliberately does
 * not navigate: submitting a form here would re-render the page and could clear a
 * draft the reader has already started. It runs once per mount, only when there is
 * something unread.
 */
export function MarkReadOnOpen({ conversationId, unread }: { conversationId: string; unread: number }) {
  const sent = useRef(false);

  useEffect(() => {
    if (unread <= 0 || sent.current) return;
    sent.current = true;
    void markConversationReadSilently(conversationId).catch(() => {
      // A read receipt is best-effort; the manual control in the conversation menu
      // remains available if the request fails.
      sent.current = false;
    });
  }, [conversationId, unread]);

  return null;
}
