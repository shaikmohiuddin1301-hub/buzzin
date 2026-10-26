"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { markAllReadInlineAction } from "@/app/actions/notifications";
import { Avatar, cn } from "@/components/ui";

export type NotificationPreview = {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  actorName: string | null;
  actorAvatar: string | null;
  createdAtLabel: string;
  createdAtIso: string;
  read: boolean;
};

/**
 * Header notification centre.
 *
 * The trigger is a real link to /notifications, so navigation still works
 * without JavaScript; with JavaScript it opens a compact recent list instead.
 * Opening the panel does not mark anything read. Opening a notification does,
 * through the ownership-checked redirect endpoint. Mark-all-read is a server
 * action followed by a router refresh, which keeps the badge, the panel and the
 * full page in step without a full page load.
 */
export function NotificationMenu({ unread, items }: { unread: number; items: NotificationPreview[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = () => {
    startTransition(async () => {
      await markAllReadInlineAction();
      router.refresh();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <a
        ref={triggerRef}
        href="/notifications"
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ", none unread"}`}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-100",
          open && "bg-navy-100 text-navy-900",
        )}
      >
        <Bell size={17} aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-surface"
          />
        ) : null}
      </a>

      {open ? (
        <div
          id="notification-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Recent notifications"
          tabIndex={-1}
          className="motion-fade absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-navy-200/80 bg-surface shadow-float outline-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-4 py-2.5">
            <div>
              <p className="text-[12.5px] font-semibold text-navy-950">Notifications</p>
              <p className="text-[10.5px] text-navy-500">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
              >
                <CheckCheck size={13} aria-hidden="true" />
                {pending ? "Marking…" : "Mark all read"}
              </button>
            ) : null}
          </div>

          <ul className="max-h-[min(24rem,58vh)] divide-y divide-navy-100 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/api/notifications/${item.id}/open`}
                  className={cn(
                    "flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-navy-50",
                    !item.read && "bg-brand-50/30",
                  )}
                >
                  {item.actorName ? (
                    <Avatar name={item.actorName} size={26} src={item.actorAvatar} />
                  ) : (
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-navy-100 text-[9px] font-semibold text-navy-600">
                      BT
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5">
                      <span className="line-clamp-2 text-[12px] font-medium leading-5 text-navy-900">{item.title}</span>
                      {!item.read ? (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-navy-500">
                      <span>{item.kindLabel}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={item.createdAtIso}>{item.createdAtLabel}</time>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-[11.5px] leading-5 text-navy-500">
                Nothing yet. Assignments, reviews, replies and mentions appear here.
              </li>
            ) : null}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t border-navy-100 px-4 py-2 text-[11px]">
            <Link href="/notifications" className="font-medium text-brand-700 hover:underline">
              View all notifications
            </Link>
            <Link href="/settings?tab=notifications" className="text-navy-500 hover:text-navy-800 hover:underline">
              Preferences
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
