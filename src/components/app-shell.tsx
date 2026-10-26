import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import {
  Bell,
  Blocks,
  BookOpen,
  Briefcase,
  Compass,
  FolderKanban,
  Home,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Shield,
  UserRound,
} from "lucide-react";
import { getDb } from "@/db/client";
import { projectInvitations } from "@/db/schema";
import { signOutAction } from "@/app/actions/auth";
import { Avatar, Badge, cn } from "@/components/ui";
import { BottomTabs } from "@/components/client/bottom-tabs";
import { NotificationMenu } from "@/components/client/notification-menu";
import { NotificationSync } from "@/components/client/notification-sync";
import { QuickThemeToggle } from "@/components/client/theme-toggle";
import { MobileNav } from "@/components/client/app-nav";
import { Logo } from "@/components/logo";
import { accountKindLabel } from "@/lib/account";
import { accountContext } from "@/services/account";
import { unreadMessageCount } from "@/services/chat";
import { projectsForUser } from "@/services/projects";
import { listNotifications, unreadNotificationCount } from "@/services/notifications";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import type { SessionUser } from "@/lib/session";

function NavLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200",
        active
          ? "bg-brand-50 text-brand-800 shadow-sm"
          : "text-navy-600 hover:bg-navy-50/80 hover:text-navy-900",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className={cn(active ? "text-brand-600" : "text-navy-400 group-hover:text-navy-600")}>{icon}</span>
        {label}
      </span>
      {badge ? (
        <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-600"
        />
      ) : null}
    </Link>
  );
}

export async function AppShell({
  user,
  activePath,
  children,
}: {
  user: SessionUser;
  activePath: string;
  children: React.ReactNode;
}) {
  const account = accountContext(user);
  const notifications = unreadNotificationCount(user.id);
  const recentNotifications = listNotifications(user.id, { limit: 6 }).map((row) => ({
    id: row.notification.id,
    title: row.notification.title,
    kind: row.notification.kind,
    kindLabel: label(row.notification.kind),
    actorName: row.actorName,
    actorAvatar: row.actorAvatar ? `/api/files/${row.actorAvatar}` : null,
    createdAtLabel: relativeTime(row.notification.createdAt),
    createdAtIso: row.notification.createdAt,
    read: !!row.notification.readAt,
  }));
  const messages = unreadMessageCount(user.id);
  const invitations = getDb()
    .select({ id: projectInvitations.id })
    .from(projectInvitations)
    .where(
      and(
        eq(projectInvitations.inviteeId, user.id),
        eq(projectInvitations.status, "pending"),
        isNull(projectInvitations.respondedAt),
      ),
    )
    .all().length;

  const isActive = (href: string) =>
    href === "/home" ? activePath === "/home" : activePath === href || activePath.startsWith(`${href}/`);

  // The same six destinations as the mobile bar (Create is the button above them).
  const primary = [
    { href: "/home", label: "Home", icon: <Home size={17} aria-hidden="true" /> },
    { href: "/explore", label: "Explore", icon: <Compass size={17} aria-hidden="true" /> },
    { href: "/chats", label: "Chats", icon: <MessageSquare size={17} aria-hidden="true" />, badge: messages },
    { href: "/learn", label: "Learning", icon: <BookOpen size={17} aria-hidden="true" /> },
    { href: "/projects", label: "Projects", icon: <FolderKanban size={17} aria-hidden="true" /> },
    { href: `/u/${user.username}`, label: "Profile", icon: <UserRound size={17} aria-hidden="true" /> },
  ];

  const editableProjects = projectsForUser(user.id).owned.slice(0, 12).map((project) => ({
    id: project.id,
    name: project.name,
  }));

  // Workspace entries follow the account's real records: teaching surfaces for
  // creators (and businesses that publish), organisations for business members.
  const showsStudio = account.isCreator || account.isBusiness;
  const secondary = [
    { href: "/notifications", label: "Notifications", icon: <Bell size={16} aria-hidden="true" />, badge: notifications },
    ...(showsStudio
      ? [{ href: "/studio", label: "Creator studio", icon: <LayoutDashboard size={16} aria-hidden="true" /> }]
      : []),
    ...(account.isBusiness
      ? [{ href: "/business", label: "Business", icon: <Briefcase size={16} aria-hidden="true" /> }]
      : []),
    { href: "/challenges", label: "Challenges", icon: <Blocks size={16} aria-hidden="true" /> },
    { href: "/settings", label: "Settings", icon: <Settings size={16} aria-hidden="true" /> },
  ];

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto flex w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-3 lg:flex">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-navy-200/60 bg-surface shadow-card">
          <div className="px-5 pb-3 pt-5">
            <Logo href="/home" />
          </div>

          <div className="px-3">
            <Link
              href="/create"
              className="create-glow flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
            >
              <Plus size={17} aria-hidden="true" />
              Create
            </Link>
          </div>

          <nav aria-label="Main navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
            {primary.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} />
            ))}

            <details className="group pt-4" open={secondary.some((item) => isActive(item.href))}>
              <summary className="cursor-pointer list-none px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400 [&::-webkit-details-marker]:hidden">
                Workspace
              </summary>
              <div className="space-y-0.5">
                {secondary.map((item) => (
                  <NavLink key={item.href} {...item} active={isActive(item.href)} />
                ))}
              </div>
            </details>

            {(user.isAdmin || user.isModerator) && (
              <details className="group pt-3">
                <summary className="cursor-pointer list-none px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400 [&::-webkit-details-marker]:hidden">
                  Administration
                </summary>
                <NavLink
                  href="/admin"
                  label="Admin & moderation"
                  icon={<Shield size={16} aria-hidden="true" />}
                  active={isActive("/admin")}
                />
              </details>
            )}
          </nav>

          <div className="border-t border-navy-100 p-3">
            {invitations > 0 ? (
              <Link
                href="/notifications"
                className="mb-2 block rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800 hover:bg-amber-100"
              >
                {invitations} pending project {invitations === 1 ? "invitation" : "invitations"}
              </Link>
            ) : null}
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <Avatar
                name={user.displayName}
                size={32}
                src={user.avatarFileId ? `/api/files/${user.avatarFileId}` : user.avatarUrl}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-navy-900">{user.displayName}</p>
                <p className="truncate text-[11px] text-navy-500">@{user.username}</p>
                <span className="mt-1 inline-flex">
                  <Badge tone={account.kind === "business" ? "info" : account.kind === "creator" ? "brand" : "neutral"}>
                    {accountKindLabel(account.kind)}
                  </Badge>
                </span>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-navy-500 hover:bg-navy-100 hover:text-navy-800"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-navy-200/70 glass">
            <div className="relative flex h-14 items-center gap-3 px-4 sm:px-6">
              <div className="lg:hidden">
                <Logo href="/home" compact />
              </div>
              <MobileNav
                items={[
                  ...secondary.map((item) => ({ ...item, badge: item.href === "/notifications" ? notifications : undefined })),
                  ...(user.isAdmin || user.isModerator
                    ? [{ href: "/admin", label: "Admin", icon: <Shield size={16} aria-hidden="true" /> }]
                    : []),
                ]}
              />

              <form action="/search" role="search" className="hidden flex-1 md:block">
                <label htmlFor="global-search" className="sr-only">
                  Search BuildTogether
                </label>
                <div className="relative max-w-md">
                  <Search
                    size={15}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
                  />
                  <input
                    id="global-search"
                    name="q"
                    type="search"
                    placeholder="Search projects, people, skills, learning…"
                    className="h-9 w-full rounded-lg border border-navy-200 bg-navy-50/60 pl-9 pr-3 text-[13px] text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </form>

              <div className="ml-auto flex items-center gap-1.5">
                {!user.emailVerifiedAt ? (
                  <Link href="/settings?tab=security" className="hidden sm:block">
                    <Badge tone="warning">Email unverified</Badge>
                  </Link>
                ) : null}
                <QuickThemeToggle />
                <NotificationMenu unread={notifications} items={recentNotifications} />
                <NotificationSync />
                <Link
                  href={`/u/${user.username}`}
                  className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-navy-100"
                  aria-label="Your profile"
                >
                  <Avatar
                    name={user.displayName}
                    size={28}
                    src={user.avatarFileId ? `/api/files/${user.avatarFileId}` : user.avatarUrl}
                  />
                </Link>
              </div>
            </div>
          </header>

          <main
            id="main"
            className="surface-gutter mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pb-10 lg:pt-9"
          >
            {children}
          </main>

          <BottomTabs
            username={user.username}
            unread={messages}
            projects={editableProjects}
            accountKind={account.kind}
          />
        </div>
      </div>
    </div>
  );
}
