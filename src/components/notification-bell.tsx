import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * Header notification control.
 *
 * A link, not a pop-up: its primary action is navigation to the full
 * Notifications page, which owns filtering, read state and pagination. The badge
 * is the real server-side unread count and is absent when there is nothing to
 * read, so it never shows a decorative counter.
 */
export function NotificationBell({ unread, className }: { unread: number; className?: string }) {
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600 transition-colors hover:bg-glass-blue hover:text-blue-700",
        className,
      )}
    >
      <Bell size={17} aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-on-rose ring-2 ring-page-warm"
        >
          {unread > 99 ? "99+" : unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
