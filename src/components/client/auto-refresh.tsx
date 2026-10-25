"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Polling refresh for chat.
 *
 * This build has no realtime transport configured, so new messages arrive on an
 * interval (paused when the tab is hidden). See docs/ROADMAP.md.
 */
export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.hidden) return;
      router.refresh();
      setLastRefresh(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, router]);

  return (
    <button
      type="button"
      onClick={() => setEnabled((value) => !value)}
      aria-pressed={enabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-navy-500 hover:bg-navy-100"
      title={lastRefresh ? `Last checked ${lastRefresh}` : "Checks for new messages periodically"}
    >
      <RefreshCw size={12} aria-hidden="true" className={enabled ? "animate-spin [animation-duration:3s]" : ""} />
      {enabled ? "Live polling on" : "Polling paused"}
    </button>
  );
}
