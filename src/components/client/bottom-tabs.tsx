"use client";

/**
 * Primary bottom navigation (mobile and tablet).
 *
 * Exactly five destinations — Home · Explore · Create · Chats · Profile — laid out
 * in a five-column grid so the Create action sits at the exact horizontal centre
 * whatever length the other labels are. Learning and Projects are no longer here;
 * they stay reachable from the sidebar, the Create sheet, the Profile menu and
 * the pages themselves.
 *
 * The bar hides while a text field has focus (the on-screen keyboard owns that
 * space) and while the Create sheet is open. Nothing here is load-bearing for
 * navigation: without JavaScript the sidebar links and full pages still work.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { orderByAccountPriority, type AccountKind } from "@/lib/account";
import { BOTTOM_NAV, profileHref } from "@/lib/navigation";
import {
  BookOpen,
  ClipboardList,
  Compass,
  FolderKanban,
  GraduationCap,
  Home,
  ImagePlus,
  Megaphone,
  MessageSquare,
  Plus,
  Presentation,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/components/ui";

const TAB_ICONS = {
  home: Home,
  explore: Compass,
  chats: MessageSquare,
  profile: UserRound,
} as const;

type CreateProject = { id: string; name: string };

const CREATE_OPTIONS = [
  { href: "/projects/new", label: "New project", description: "An idea and a team.", icon: FolderKanban },
  { href: "/create/post", label: "New post", description: "A photo or short update.", icon: ImagePlus },
  { href: "/create/update", label: "Share an update", description: "Progress or a milestone.", icon: Megaphone },
  { href: "/create/teaching", label: "New teaching", description: "A guide others can follow.", icon: GraduationCap },
  { href: "/studio/courses/new", label: "New course", description: "Lessons in a guided path.", icon: Presentation },
  { href: "/create/learning", label: "Share a learning", description: "What you worked out.", icon: BookOpen },
  { href: "/create/task", label: "New task", description: "One piece of work.", icon: ClipboardList },
] as const;

export function BottomTabs({
  username,
  unread,
  projects,
  accountKind = "individual",
}: {
  username: string;
  unread: number;
  projects: CreateProject[];
  accountKind?: AccountKind;
}) {
  const pathname = usePathname();
  const orderedCreateOptions = useMemo(
    () => orderByAccountPriority([...CREATE_OPTIONS], accountKind),
    [accountKind],
  );
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const profilePath = profileHref(username);
  const isActive = (href: string) =>
    href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`);

  // Any navigation closes the sheet, matching native behaviour.
  useEffect(() => {
    setOpen(false);
    setPending(null);
  }, [pathname]);

  // The soft keyboard needs the space the bar would occupy.
  useEffect(() => {
    const isField = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
    };
    const onFocusIn = (event: FocusEvent) => {
      if (window.matchMedia("(max-width: 1023px)").matches && isField(event.target)) setTyping(true);
    };
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

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

  const hidden = typing && !open;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Create">
          <button
            type="button"
            aria-label="Close create menu"
            className="absolute inset-0 bg-black/50 motion-fade backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="motion-sheet glass-popover absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-1.5rem-env(safe-area-inset-bottom))] overflow-y-auto rounded-3xl p-4"
          >
            <div className="mb-1 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-navy-950">{pending ? "New task in…" : "Create"}</h2>
                <p className="text-[11.5px] text-navy-500">
                  {pending ? "Pick the project the task belongs to." : "Start something; it lands where it belongs."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => (pending ? setPending(null) : setOpen(false))}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-navy-100 px-3 text-[12px] font-medium text-navy-700 transition hover:bg-navy-200"
                aria-label={pending ? "Back" : "Close"}
              >
                {pending ? "Back" : <X size={16} aria-hidden="true" />}
              </button>
            </div>

            {!pending ? (
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {orderedCreateOptions.map((option) => {
                  const Icon = option.icon;
                  const disabled = option.label === "New task" && projects.length === 0;
                  const content = (
                    <>
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                          disabled ? "bg-navy-100 text-navy-400" : "bg-brand-50 text-brand-600",
                        )}
                        aria-hidden="true"
                      >
                        <Icon size={17} />
                      </span>
                      <span className="mt-2 block text-[13px] font-semibold text-navy-900">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-navy-500">
                        {disabled ? "Join a project first." : option.description}
                      </span>
                    </>
                  );
                  return (
                    <li key={option.href}>
                      {disabled ? (
                        <span className="block h-full rounded-2xl border border-navy-200/60 bg-navy-50/60 p-3 opacity-70">
                          {content}
                        </span>
                      ) : option.label === "New task" ? (
                        <button
                          type="button"
                          onClick={() => setPending("task")}
                          className="block h-full w-full rounded-2xl border border-navy-200/60 bg-surface p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                        >
                          {content}
                        </button>
                      ) : (
                        <Link
                          href={option.href}
                          className="block h-full rounded-2xl border border-navy-200/60 bg-surface p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
                        >
                          {content}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="mt-2 max-h-[46vh] space-y-1 overflow-y-auto">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}/tasks?view=new`}
                      className="flex min-h-[48px] items-center justify-between gap-2 rounded-xl px-3 text-[14px] text-navy-800 transition hover:bg-navy-50"
                    >
                      <span className="truncate">{project.name}</span>
                      <Plus size={15} aria-hidden="true" className="shrink-0 text-brand-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 lg:hidden",
          "transition-all duration-300 ease-out",
          hidden ? "pointer-events-none translate-y-[130%] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <nav
          aria-label="Primary"
          data-swipe-ignore
          className="glass-bar mx-auto grid max-w-lg grid-cols-5 items-center rounded-[1.75rem] px-1.5 py-1.5 shadow-float"
        >
          {/* Five entries from one shared list, into five equal columns, so the
              third (Create) is dead centre by construction. */}
          {BOTTOM_NAV.map((entry) => {
            if (entry.id === "create") {
              return (
                <div key="create" className="flex items-center justify-center">
                  <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-label="Create"
                    className="-mt-4 inline-flex h-12 w-12 items-center justify-center rounded-full create-glow text-white shadow-glow transition duration-200 active:scale-95"
                  >
                    <Plus size={22} aria-hidden="true" />
                  </button>
                </div>
              );
            }
            const href = entry.id === "profile" ? profilePath : entry.href;
            return (
              <TabCell
                key={entry.id}
                href={href}
                label={entry.label}
                icon={TAB_ICONS[entry.id]}
                active={entry.id === "profile" ? pathname.startsWith("/u/") : isActive(entry.href)}
                badge={entry.id === "chats" ? unread : 0}
              />
            );
          })}
        </nav>
      </div>
    </>
  );
}

function TabCell({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label}, ${badge} unread` : label}
      className={cn(
        "flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors duration-200",
        active ? "bg-brand-50 text-brand-600" : "text-navy-500 hover:bg-navy-100/70 hover:text-navy-900",
      )}
    >
      <span className="relative">
        <Icon size={20} aria-hidden="true" strokeWidth={active ? 2.2 : 1.8} />
        {badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[9px] font-bold leading-none text-on-coral ring-2 ring-surface">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className={cn("text-[10px] leading-none", active ? "font-semibold" : "font-medium")}>{label}</span>
    </Link>
  );
}
