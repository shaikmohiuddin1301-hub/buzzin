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
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-700"
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="absolute left-0 right-0 top-full z-40 border-b border-navy-200 bg-white px-4 pb-4 pt-3 shadow-raised"
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
                        "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium",
                        active ? "bg-brand-50 text-brand-700" : "text-navy-700 hover:bg-navy-50",
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
