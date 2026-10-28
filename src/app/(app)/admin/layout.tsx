import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui";

/**
 * Every /admin route passes through this guard. The check is repeated inside
 * each action as well — a layout is never the only authorisation boundary.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/disputes", label: "Disputes" },
    { href: "/admin/stories", label: "Story review" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/audit", label: "Audit log" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-200 bg-brand-600 px-4 py-3 text-on-brand">
        <div>
          <p className="text-[13px] font-semibold">Administration</p>
          <p className="text-[11px] text-on-brand/60">
            Signed in as {admin.displayName} · {admin.isAdmin ? "administrator" : "moderator"} · actions are recorded in the audit log
          </p>
        </div>
        <Badge tone="warning">Restricted area</Badge>
      </div>

      <nav aria-label="Administration sections" className="mb-4 flex flex-wrap gap-1 border-b border-navy-200 pb-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium text-navy-600 hover:bg-navy-100 hover:text-navy-900"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
