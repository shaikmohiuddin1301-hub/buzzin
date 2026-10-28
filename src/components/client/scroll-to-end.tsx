"use client";

import { useEffect } from "react";

/**
 * A conversation opens at the newest message, the way a messaging app does.
 * Scrolling is set directly (not animated) so it lands before the first paint the
 * reader sees, and it never overrides a position the reader has already chosen.
 */
export function ScrollToEnd({ targetId }: { targetId: string }) {
  useEffect(() => {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [targetId]);

  return null;
}
