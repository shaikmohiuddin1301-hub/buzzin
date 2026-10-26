"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number };

export function MobileNav({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-navy-200/70 bg-surface text-navy-700 transition hover:bg-navy-50"
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="motion-sheet absolute left-2 right-2 top-[calc(100%+0.5rem)] z-40 rounded-2xl border border-navy-200/70 glass p-2 shadow-float"
        >
          <nav aria-label="Main navigation">
            <ul className="space-y-1">
              {items.map((item) => {
                const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                        active ? "bg-brand-50 text-brand-800" : "text-navy-700 hover:bg-navy-50",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        {item.icon}
                        {item.label}
                      </span>
                      {item.badge ? (
                        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {footer ? <div className="mt-3 border-t border-navy-100 pt-3">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
