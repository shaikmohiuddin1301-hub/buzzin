"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Compass,
  FolderKanban,
  GraduationCap,
  Home,
  ImagePlus,
  Megaphone,
  MessageSquare,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/components/ui";

export type CreateProject = { id: string; name: string };

type Tab = { href: string; label: string; icon: React.ReactNode };

/**
 * Mobile-first primary navigation.
 *
 * The bar is fixed, respects the device safe area, and sits above a spacer in the app shell so
 * it can never cover the last line of a page or a message composer. Desktop uses the sidebar in
 * `AppShell`; this component is hidden from `lg` upwards.
 *
 * Create opens a small sheet rather than navigating: creating a Drop or an update needs a
 * project, so the sheet lists only projects the person can actually edit.
 */
const sheetRow =
  "flex min-h-[52px] items-start gap-3 rounded-xl px-3 py-2 text-[14px] font-medium text-navy-800 hover:bg-navy-50";

export function BottomTabs({
  username,
  unread,
  projects,
}: {
  username: string;
  unread: number;
  projects: CreateProject[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<null | "drop">(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const tabs: Tab[] = [
    { href: "/home", label: "Home", icon: <Home size={20} aria-hidden="true" /> },
    { href: "/explore", label: "Explore", icon: <Compass size={20} aria-hidden="true" /> },
    { href: "/chats", label: "Chats", icon: <MessageSquare size={20} aria-hidden="true" /> },
    { href: "/learn", label: "Learning", icon: <BookOpen size={20} aria-hidden="true" /> },
    { href: "/projects", label: "Projects", icon: <FolderKanban size={20} aria-hidden="true" /> },
    { href: `/u/${username}`, label: "Profile", icon: <UserRound size={20} aria-hidden="true" /> },
  ];

  const isActive = (href: string) =>
    href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`);

  // Any navigation closes the sheet, matching native behaviour.
  useEffect(() => {
    setOpen(false);
    setPending(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Create">
          <button
            type="button"
            aria-label="Close create menu"
            className="absolute inset-0 bg-navy-950/40 motion-fade"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="motion-sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-navy-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-raised"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-navy-950">{pending ? "New Drop in…" : "Create"}</h2>
              <button
                type="button"
                onClick={() => (pending ? setPending(null) : setOpen(false))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-navy-500 hover:bg-navy-100"
                aria-label={pending ? "Back" : "Close"}
              >
                {pending ? <span className="text-[12px] font-medium">Back</span> : <X size={18} aria-hidden="true" />}
              </button>
            </div>

            {!pending ? (
              <div className="space-y-0.5">
                <Link href="/projects/new" className={sheetRow}>
                  <FolderKanban size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    New project
                    <span className="block text-[11px] font-normal text-navy-500">Start something and invite people in.</span>
                  </span>
                </Link>
                <Link href="/create/post" className={sheetRow}>
                  <ImagePlus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    New post
                    <span className="block text-[11px] font-normal text-navy-500">A photo, a caption, something you made.</span>
                  </span>
                </Link>
                <Link href="/create/update" className={sheetRow}>
                  <Megaphone size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    Share an update
                    <span className="block text-[11px] font-normal text-navy-500">Progress, a milestone or an announcement.</span>
                  </span>
                </Link>
                <Link href="/create/teaching" className={sheetRow}>
                  <GraduationCap size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    New teaching
                    <span className="block text-[11px] font-normal text-navy-500">A guide or explainer others can learn from.</span>
                  </span>
                </Link>
                <Link href="/create/learning" className={sheetRow}>
                  <BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    Share a learning
                    <span className="block text-[11px] font-normal text-navy-500">What you learned, or finished.</span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setPending("drop")}
                  disabled={projects.length === 0}
                  className={cn(sheetRow, "w-full text-left disabled:cursor-not-allowed disabled:text-navy-400")}
                >
                  <Plus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    New Drop
                    <span className="block text-[11px] font-normal text-navy-500">
                      {projects.length === 0 ? "Join a project to create work." : "Trackable work inside one of your projects."}
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}/tasks`}
                      className="flex min-h-[48px] items-center rounded-xl px-3 text-[14px] text-navy-800 hover:bg-navy-50"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
          {tabs.slice(0, 3).map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} badge={tab.href === "/chats" ? unread : 0} />
          ))}

          <li className="flex flex-1 items-center justify-center">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label="Create"
              className="-mt-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/25 transition active:scale-95"
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </li>

          {tabs.slice(3).map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.href)} badge={0} />
          ))}
        </ul>
      </nav>
    </>
  );
}

function TabLink({ tab, active, badge }: { tab: Tab; active: boolean; badge: number }) {
  return (
    <li className="flex-1">
      <Link
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 pt-1.5 text-[10px] font-medium transition-colors",
          active ? "text-brand-700" : "text-navy-500 hover:text-navy-800",
        )}
      >
        <span className="relative">
          {tab.icon}
          {badge > 0 ? (
            <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-brand-600 px-1 text-center text-[9px] font-semibold leading-4 text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        <span className="max-w-[64px] truncate">{tab.label}</span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0 h-0.5 w-6 rounded-full bg-brand-600 transition-opacity duration-200",
            active ? "opacity-100" : "opacity-0",
          )}
        />
      </Link>
    </li>
  );
}
