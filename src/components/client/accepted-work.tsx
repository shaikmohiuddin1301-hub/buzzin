"use client";

import { useEffect, useState } from "react";
import { Check, FolderCheck } from "lucide-react";

/**
 * The signature accepted-work moment.
 *
 * It is mounted only when the review action redirected with `approved=1`, which happens after
 * the approval was written and the task status changed — never before. The component strips
 * that one-shot query flag so a refresh or a back navigation cannot replay the celebration.
 *
 * The card lifts, the check draws, and a "Accepted Work" pill settles. With reduced motion the
 * global CSS rule collapses the animation to nothing; the card is still announced and read,
 * so the confirmation never depends on movement.
 */
export function AcceptedWorkCelebration({ show, title }: { show: boolean; title: string }) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("approved");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    const timer = setTimeout(() => setVisible(false), 3600);
    return () => clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6"
    >
      <div className="motion-lift w-full max-w-sm rounded-xl border border-emerald-200 bg-surface p-4 shadow-raised">
        <div className="flex items-start gap-3">
          <span className="motion-check grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <Check size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-navy-950">Approved and filed</p>
            <p className="mt-0.5 truncate text-[12px] text-navy-600">{title}</p>
            <p className="motion-file mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
              <FolderCheck size={12} aria-hidden="true" /> Accepted Work
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
