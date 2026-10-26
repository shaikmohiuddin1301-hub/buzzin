"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the notification badge honest across tabs and long sessions without a
 * realtime transport.
 *
 * The database is the source of truth; this only asks the server to re-render it
 * when the tab becomes active again (the common source of stale counts), and on a
 * slow interval while it stays visible. Refreshes are throttled so switching back
 * and forth cannot hammer the server.
 */
export function NotificationSync({ intervalMs = 60_000, minimumGapMs = 15_000 }: { intervalMs?: number; minimumGapMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    let timer: number | undefined;

    const refresh = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - last < minimumGapMs) return;
      last = now;
      router.refresh();
    };

    const onVisibility = () => {
      if (!document.hidden) refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    timer = window.setInterval(refresh, intervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      if (timer) window.clearInterval(timer);
    };
  }, [intervalMs, minimumGapMs, router]);

  return null;
}
