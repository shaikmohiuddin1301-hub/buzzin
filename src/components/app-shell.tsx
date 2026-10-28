import Link from "next/link";
import { Suspense } from "react";
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
  Settings,
  Shield,
  UserRound,
} from "lucide-react";
import { getDb } from "@/db/client";
import { projectInvitations } from "@/db/schema";
import { signOutAction } from "@/app/actions/auth";
import { Avatar, Badge } from "@/components/ui";
import { AppSurface } from "@/components/client/app-surface";
import { AppTour } from "@/components/client/app-tour";
import { BottomTabs } from "@/components/client/bottom-tabs";
import { SidebarNav } from "@/components/client/sidebar-nav";
import { SwipeNavigation } from "@/components/client/swipe-navigation";
import { Logo } from "@/components/logo";
import { AppHeader } from "@/components/top-bar";
import { accountKindLabel } from "@/lib/account";
import { accountContext } from "@/services/account";
import { unreadMessageCount } from "@/services/chat";
import { projectsForUser } from "@/services/projects";
import { unreadNotificationCount } from "@/services/notifications";
import { getPreferences } from "@/services/users";
import type { SessionUser } from "@/lib/session";

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const account = accountContext(user);
  const preferences = getPreferences(user.id);
  const notifications = unreadNotificationCount(user.id);
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

  const profileHref = `/u/${user.username}`;

  // The sidebar keeps the five mobile destinations and adds Learning and
  // Projects, which left the bottom bar. Create is the button above them.
  const primary = [
    { href: "/home", label: "Home", icon: <Home size={17} aria-hidden="true" />, tour: "home" },
    { href: "/explore", label: "Explore", icon: <Compass size={17} aria-hidden="true" />, tour: "explore" },
    { href: "/chats", label: "Chats", icon: <MessageSquare size={17} aria-hidden="true" />, badge: messages, tour: "chats" },
    { href: "/learn", label: "Learning", icon: <BookOpen size={17} aria-hidden="true" /> },
    { href: "/projects", label: "Projects", icon: <FolderKanban size={17} aria-hidden="true" /> },
    { href: `/u/${user.username}`, label: "Profile", icon: <UserRound size={17} aria-hidden="true" />, tour: "profile" },
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
    <AppSurface>
      <div className="mx-auto flex w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 p-3 lg:flex">
          <div className="card-surface flex h-full w-full flex-col overflow-hidden">
          <div className="px-5 pb-3 pt-5">
            <Logo href="/home" />
          </div>

          <div className="px-3">
            <Link
              href="/create"
              data-tour="create"
              className="create-glow flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-glow transition-colors"
            >
              <Plus size={17} aria-hidden="true" />
              Create
            </Link>
          </div>

          <SidebarNav
            primary={primary}
            workspace={secondary}
            admin={
              user.isAdmin || user.isModerator
                ? [{ href: "/admin", label: "Admin & moderation", icon: <Shield size={16} aria-hidden="true" /> }]
                : []
            }
          />

          <div className="border-t border-navy-200 p-3">
            {invitations > 0 ? (
              <Link
                href="/notifications"
                className="mb-2 block rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 hover:bg-amber-100"
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
          <AppHeader notifications={notifications} messages={messages} profileHref={profileHref} />

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
          <SwipeNavigation ownProfileHref={`/u/${user.username}`} />
          <Suspense fallback={null}>
            <AppTour autoStart={!preferences?.appTourStatus} userId={user.id} />
          </Suspense>
        </div>
      </div>
    </AppSurface>
  );
}
