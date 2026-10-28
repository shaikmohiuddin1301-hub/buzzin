"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export type SidebarItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
};

/** Same rule as the bottom bar: a section stays current on its own sub-pages. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ item, active }: { item: SidebarItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200",
        active ? "bg-brand-50 text-brand-600" : "text-navy-500 hover:bg-navy-100/70 hover:text-navy-900",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className={cn(active ? "text-brand-600" : "text-navy-500 group-hover:text-navy-700")}>{item.icon}</span>
        {item.label}
      </span>
      {item.badge ? (
        <span className="rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-on-coral">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
      {active ? (
        <span aria-hidden="true" className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-600" />
      ) : null}
    </Link>
  );
}

/**
 * Desktop sidebar.
 *
 * The highlight comes from the live pathname rather than a server-computed prop: the
 * shell is not re-rendered for every navigation, so a server-derived `aria-current`
 * stayed on the previous page after a link click. The workspace group opens itself
 * when one of its destinations is current.
 */
export function SidebarNav({
  primary,
  workspace,
  admin,
}: {
  primary: SidebarItem[];
  workspace: SidebarItem[];
  admin: SidebarItem[];
}) {
  const pathname = usePathname();
  const workspaceActive = workspace.some((item) => isCurrent(pathname, item.href));

  return (
    <nav aria-label="Main navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
      {primary.map((item) => (
        <SidebarLink key={item.href} item={item} active={isCurrent(pathname, item.href)} />
      ))}

      <details className="group pt-4" open={workspaceActive || undefined}>
        <summary className="cursor-pointer list-none px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400 [&::-webkit-details-marker]:hidden">
          Workspace
        </summary>
        <div className="space-y-0.5">
          {workspace.map((item) => (
            <SidebarLink key={item.href} item={item} active={isCurrent(pathname, item.href)} />
          ))}
        </div>
      </details>

      {admin.length > 0 ? (
        <details className="group pt-3">
          <summary className="cursor-pointer list-none px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400 [&::-webkit-details-marker]:hidden">
            Administration
          </summary>
          {admin.map((item) => (
            <SidebarLink key={item.href} item={item} active={isCurrent(pathname, item.href)} />
          ))}
        </details>
      ) : null}
    </nav>
  );
}
