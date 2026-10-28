"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, LogOut, Menu, MessageSquare, Settings, UserRound, X } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/components/ui";

/**
 * The account menu behind the hamburger in the Home and Profile headers.
 *
 * It is the only menu in the app chrome. Everything in it belongs to the signed-in
 * account, so it stays the same wherever it is opened from. Log out is separated at
 * the bottom and goes through the existing session-ending server action, which
 * clears the cookie before redirecting, so no protected page can be reopened with a
 * stale session.
 */
export function AccountMenu({ profileHref }: { profileHref: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

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
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { href: profileHref, label: "Your profile", icon: UserRound },
    { href: "/me/liked", label: "Liked Posts & Projects", icon: Heart },
    { href: "/me/comments", label: "Your Comments", icon: MessageSquare },
    { href: "/settings", label: "Settings & account", icon: Settings },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-navy-200/70 bg-surface text-navy-700 transition hover:bg-navy-50",
          open && "bg-navy-100 text-navy-900",
        )}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>

      {open ? (
        <div
          id="account-menu"
          ref={panelRef}
          role="menu"
          aria-label="Account menu"
          className="motion-fade glass absolute left-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-2xl shadow-float"
        >
          <ul className="p-1.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-navy-700 transition hover:bg-navy-50 hover:text-navy-950"
                  >
                    <Icon size={15} aria-hidden="true" className="text-navy-400" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-navy-200 p-1.5">
            <form
              action={signOutAction}
              onSubmit={(event) => {
                setPending(true);
                if (!window.confirm("Log out of BuildTogether?")) {
                  event.preventDefault();
                  setPending(false);
                }
              }}
            >
              <button
                type="submit"
                role="menuitem"
                disabled={pending}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                <LogOut size={15} aria-hidden="true" />
                {pending ? "Logging out…" : "Log Out"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
