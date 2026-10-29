"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bell, Heart, LogOut, Menu, MessageSquare, Settings } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/components/ui";

// In the order the account reads them; Log out is rendered separately, below a
// separator, because it ends the session rather than opening a page.
const ITEMS = [
  { href: "/me/liked", label: "Liked Posts & Projects", icon: Heart },
  { href: "/me/comments", label: "Your Comments", icon: MessageSquare },
  { href: "/settings", label: "Settings & Account", icon: Settings },
  { href: "/notifications", label: "Notifications", icon: Bell },
] as const;

const itemClass =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-navy-800 transition-colors hover:bg-navy-100 focus-visible:bg-navy-100 focus-visible:outline-none";

/**
 * The signed-in account's own menu, in the top-right corner of the profile header.
 *
 * It is rendered by the profile page only, so no other page shows a control it does
 * not use. Every entry is the real destination the account already had, and Log out
 * is the same server action the rest of the app uses, separated from navigation.
 */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A press outside the menu, or Escape, closes it. Focus returns to the trigger so
  // a keyboard user is never dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Arrow keys move between entries, Home/End jump to the ends: the keyboard
  // contract a role="menu" promises. Enter on a link still follows it.
  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;

    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : current === -1
            ? event.key === "ArrowDown"
              ? 0
              : items.length - 1
            : event.key === "ArrowDown"
              ? (current + 1) % items.length
              : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={onPanelKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="profile-account-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-navy-200/70 bg-surface/80 text-navy-700 transition hover:bg-navy-100 hover:text-navy-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="profile-account-menu"
          role="menu"
          aria-label="Profile menu"
          className="glass-popover absolute right-0 top-[calc(100%+0.4rem)] z-40 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl p-1.5 shadow-float"
        >
          {ITEMS.map((item) => (
            <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <item.icon size={15} aria-hidden="true" className="text-navy-500" />
              {item.label}
            </Link>
          ))}

          <div role="separator" className="my-1 border-t border-navy-200/70" />

          {/* No click handler here: the form must stay mounted until the browser
              submits it, and the redirect closes the menu by leaving the page. */}
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className={cn(itemClass, "text-red-600 hover:bg-red-50")}>
              <LogOut size={15} aria-hidden="true" />
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
