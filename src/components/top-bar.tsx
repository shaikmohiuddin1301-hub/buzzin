"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, PenSquare } from "lucide-react";
import { ExploreSearchField, InboxSearchField } from "@/components/client/header-search";
import { NotificationSync } from "@/components/client/notification-sync";
import { NotificationBell } from "@/components/notification-bell";
import { Logo } from "@/components/logo";

/**
 * The page-specific application header.
 *
 * The chrome is one shared bar, but its contents belong to the page underneath it:
 * Home owns the wordmark and the notification bell, Explore and Chats own a search
 * field, a conversation owns a back link. There is no global hamburger: the
 * account's own menu sits in the profile header, so no page shows a control it
 * does not use and every page keeps exactly one header.
 */
function TopBar({ children }: { children: React.ReactNode }) {
  return (
    <header className="glass-header sticky top-0 z-30">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">{children}</div>
    </header>
  );
}

/** Home: the wordmark and the notification bell — the only page with a bell. */
export function HomeTopBar({ notifications }: { notifications: number }) {
  return (
    <TopBar>
      <div className="flex min-w-0 flex-1 items-center">
        <span className="lg:hidden">
          <Logo href="/home" compact />
        </span>
        <span className="hidden text-[15px] font-semibold tracking-tight text-navy-950 lg:block">Home</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationBell unread={notifications} />
        <NotificationSync />
      </div>
    </TopBar>
  );
}

/** Explore: search, and nothing that belongs to another page. */
export function ExploreTopBar() {
  return (
    <TopBar>
      <Suspense
        fallback={
          <div className="h-10 min-w-0 flex-1 rounded-full border border-navy-200/80 bg-surface/80" aria-hidden="true" />
        }
      >
        <ExploreSearchField />
      </Suspense>
    </TopBar>
  );
}

/** Chats inbox: the title, its live count, search and the new-message action. */
export function ChatsTopBar({ unread }: { unread: number }) {
  return (
    <TopBar>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-[19px] font-semibold tracking-tight text-navy-950">Chats</h1>
        {unread > 0 ? (
          <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[10.5px] font-semibold text-coral-700">
            {unread} unread
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <Suspense
          fallback={
            <div className="h-10 w-full rounded-full border border-navy-200/80 bg-surface/80" aria-hidden="true" />
          }
        >
          <InboxSearchField />
        </Suspense>
      </div>
      <Link
        href="/chats?compose=1"
        aria-label="New message"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-navy-200/70 bg-surface text-navy-700 transition hover:bg-navy-50"
      >
        <PenSquare size={16} aria-hidden="true" />
      </Link>
    </TopBar>
  );
}

/** An open conversation: a way back to the inbox, and nothing else. */
export function ThreadTopBar() {
  return (
    <TopBar>
      <Link
        href="/chats"
        aria-label="Back to chats"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-navy-700 transition hover:bg-navy-100"
      >
        <ArrowLeft size={18} aria-hidden="true" />
      </Link>
      <p className="text-[15px] font-semibold tracking-tight text-navy-950">Chats</p>
    </TopBar>
  );
}

/** Any page without its own controls keeps the mark, with nothing borrowed. */
export function NeutralTopBar() {
  return (
    <TopBar>
      <span className="lg:hidden">
        <Logo href="/home" compact />
      </span>
      <span className="ml-auto text-[11px] font-medium uppercase tracking-[0.14em] text-navy-400">
        BuildTogether
      </span>
    </TopBar>
  );
}

/**
 * Chooses the bar from the live pathname.
 *
 * This has to run on the client: a layout is not re-rendered for every navigation,
 * so a header chosen from the server pathname keeps the previous page's controls
 * after a link click. `usePathname` updates with the URL, which is what keeps the
 * bell on Home when a conversation opens.
 */
export function AppHeader({
  notifications,
  messages,
  profileHref: ownProfileHref,
}: {
  notifications: number;
  messages: number;
  profileHref: string;
}) {
  const pathname = usePathname();

  if (pathname === "/home") return <HomeTopBar notifications={notifications} />;
  if (pathname === "/explore") return <ExploreTopBar />;
  if (pathname === "/chats") return <ChatsTopBar unread={messages} />;
  if (pathname.startsWith("/chats/")) return <ThreadTopBar />;
  // Your own profile keeps the neutral bar; its account menu belongs to the page
  // header, next to the name, rather than to this shared chrome.
  if (pathname === ownProfileHref) return <NeutralTopBar />;
  return <NeutralTopBar />;
}
