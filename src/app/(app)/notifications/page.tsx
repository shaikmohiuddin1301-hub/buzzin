import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projectInvitations, projects, users } from "@/db/schema";
import { markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { respondToInvitationAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/client/submit-button";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Flash,
  PageHeader,
  Tabs,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import { listNotifications, unreadNotificationCount } from "@/services/notifications";

export const dynamic = "force-dynamic";

const TONES: Record<string, "brand" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  message: "brand",
  interest_received: "info",
  interest_answered: "info",
  invitation: "warning",
  task_assigned: "brand",
  submission_received: "info",
  submission_reviewed: "warning",
  contribution_confirmed: "success",
  comment: "neutral",
  new_follower: "neutral",
  learning_sale: "success",
  learning_feedback: "info",
  story_approval: "warning",
  moderation: "danger",
  security: "danger",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const unreadOnly = query.filter === "unread";
  const notifications = listNotifications(user.id, { unreadOnly, limit: 60 });
  const unread = unreadNotificationCount(user.id);

  const invitations = getDb()
    .select({ invitation: projectInvitations, projectName: projects.name, inviterName: users.displayName })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .innerJoin(users, eq(users.id, projectInvitations.inviterId))
    .where(and(eq(projectInvitations.inviteeId, user.id), eq(projectInvitations.status, "pending")))
    .all();

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Project activity, reviews, messages and security alerts. Email delivery is not configured in this build."
        actions={
          <form action={markAllReadAction}>
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">
              Mark all read
            </SubmitButton>
          </form>
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={unreadOnly ? "unread" : "all"}
        items={[
          { id: "all", label: "All", href: "/notifications" },
          { id: "unread", label: "Unread", href: "/notifications?filter=unread", count: unread },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <ul className="divide-y divide-navy-100">
            {notifications.map((row) => {
              const item = row.notification;
              return (
                <li key={item.id} className={cn("px-5 py-4", !item.readAt && "bg-brand-50/30")}>
                  <div className="flex items-start gap-3">
                    {row.actorName ? (
                      <Avatar name={row.actorName} size={30} src={row.actorAvatar ? `/api/files/${row.actorAvatar}` : null} />
                    ) : (
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-600">
                        BT
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium text-navy-900">{item.title}</p>
                        <Badge tone={TONES[item.kind] ?? "neutral"}>{label(item.kind)}</Badge>
                        {!item.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-label="unread" /> : null}
                      </div>
                      {item.body ? <p className="mt-0.5 text-[12px] leading-5 text-navy-600">{item.body}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                        <time className="text-navy-400" dateTime={item.createdAt}>
                          {relativeTime(item.createdAt)}
                        </time>
                        {item.href ? (
                          <Link href={item.href} className="font-medium text-brand-700 hover:underline">
                            Open
                          </Link>
                        ) : null}
                        {!item.readAt ? (
                          <form action={markReadAction}>
                            <input type="hidden" name="notificationId" value={item.id} />
                            <SubmitButton size="sm" variant="ghost" className="h-5 px-1 text-[10px]" pendingLabel="…">
                              Mark read
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {notifications.length === 0 ? (
              <li className="p-6">
                <EmptyState
                  title="Nothing here"
                  description="Notifications appear when someone follows you, invites you, reviews your work or messages you."
                />
              </li>
            ) : null}
          </ul>
        </Card>

        <aside className="space-y-4">
          {invitations.length > 0 ? (
            <Card>
              <div className="border-b border-navy-100 px-4 py-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Invitations</h2>
              </div>
              <ul className="divide-y divide-navy-100">
                {invitations.map((row) => (
                  <li key={row.invitation.id} className="px-4 py-3">
                    <p className="text-[12px] font-medium text-navy-900">{row.projectName}</p>
                    <p className="text-[10.5px] text-navy-500">
                      {row.inviterName} · {label(row.invitation.role)}
                    </p>
                    {row.invitation.message ? (
                      <p className="mt-1 text-[11px] leading-5 text-navy-600">“{row.invitation.message}”</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <form action={respondToInvitationAction}>
                        <input type="hidden" name="invitationId" value={row.invitation.id} />
                        <input type="hidden" name="accept" value="on" />
                        <SubmitButton size="sm" pendingLabel="…">
                          Accept
                        </SubmitButton>
                      </form>
                      <form action={respondToInvitationAction}>
                        <input type="hidden" name="invitationId" value={row.invitation.id} />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          Decline
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Preferences</h2>
            <p className="mt-1.5 text-[11px] leading-5 text-navy-600">
              Turn notification categories on or off, and choose whether email digests would be sent once a provider is
              configured.
            </p>
            <ButtonLink href="/settings?tab=notifications" size="sm" variant="secondary" className="mt-2">
              Notification settings
            </ButtonLink>
          </Card>

          <div className="rounded-lg border border-navy-200 bg-white p-3 text-[10.5px] leading-4 text-navy-500">
            Notifications are throttled by category and deduplicated per action. Self-notifications are suppressed.
          </div>
        </aside>
      </div>
    </div>
  );
}
