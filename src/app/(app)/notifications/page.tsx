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
  Pagination,
  Tabs,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { label } from "@/lib/types";
import {
  NOTIFICATIONS_PAGE_SIZE,
  countNotifications,
  listNotifications,
  unreadNotificationCount,
} from "@/services/notifications";

export const dynamic = "force-dynamic";

const TONES: Record<string, "brand" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  message: "brand",
  mention: "brand",
  interest_received: "info",
  interest_answered: "info",
  invitation: "warning",
  task_assigned: "brand",
  submission_received: "info",
  submission_reviewed: "warning",
  contribution_confirmed: "success",
  comment: "neutral",
  new_follower: "neutral",
  project_update: "info",
  teaching_published: "info",
  learning_sale: "success",
  learning_feedback: "info",
  story_approval: "warning",
  moderation: "danger",
  security: "danger",
};

/** Day bucket for the list, so a long history stays readable. */
function dayBucket(createdAt: string, now: Date): string {
  const created = new Date(createdAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (created >= startOfToday) return "Today";
  if (created >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const unreadOnly = query.filter === "unread";
  const unread = unreadNotificationCount(user.id);
  const total = countNotifications(user.id, { unreadOnly });
  const totalAll = unreadOnly ? countNotifications(user.id) : total;
  const pages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));
  const requestedPage = Number.parseInt(typeof query.page === "string" ? query.page : "1", 10);
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pages);
  const notifications = listNotifications(user.id, {
    unreadOnly,
    limit: NOTIFICATIONS_PAGE_SIZE,
    offset: (page - 1) * NOTIFICATIONS_PAGE_SIZE,
  });

  // Ordered final list; the day headings are derived from the same rows, never invented.
  const now = new Date();
  const groups: { label: string; rows: typeof notifications }[] = [];
  for (const row of notifications) {
    const bucket = dayBucket(row.notification.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === bucket) last.rows.push(row);
    else groups.push({ label: bucket, rows: [row] });
  }

  const invitations = getDb()
    .select({ invitation: projectInvitations, projectName: projects.name, inviterName: users.displayName })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .innerJoin(users, eq(users.id, projectInvitations.inviterId))
    .where(and(eq(projectInvitations.inviteeId, user.id), eq(projectInvitations.status, "pending")))
    .all();

  const returnTo = unreadOnly ? "/notifications?filter=unread" : "/notifications";

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Project activity, reviews, messages and safety notices. Notifications are stored on the server and survive sign-out; email and push delivery are not configured in this build."
        meta={
          unread > 0 ? (
            <Badge tone="brand">
              {unread} unread notification{unread === 1 ? "" : "s"}
            </Badge>
          ) : (
            <span>All caught up</span>
          )
        }
        actions={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton size="sm" variant="primary" pendingLabel="Marking…" confirmMessage="Mark all notifications as read?">
                Mark all read
              </SubmitButton>
            </form>
          ) : (
            <span className="text-[12px] text-navy-500">Nothing to mark</span>
          )
        }
      />

      <Flash error={error} notice={notice} />

      <Tabs
        current={unreadOnly ? "unread" : "all"}
        items={[
          { id: "all", label: "All", href: "/notifications", count: totalAll },
          { id: "unread", label: "Unread", href: "/notifications?filter=unread", count: unread },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          {notifications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={unreadOnly ? "No unread notifications" : "No notifications yet"}
                description={
                  unreadOnly
                    ? "Everything has been read. New assignments, reviews, replies and mentions will appear here."
                    : "When someone assigns you work, reviews a submission, replies to you, mentions you or invites you to a project, it lands here — even after signing out."
                }
                action={
                  unreadOnly ? (
                    <ButtonLink href="/notifications" size="sm" variant="secondary">
                      View all notifications
                    </ButtonLink>
                  ) : (
                    <ButtonLink href="/home" size="sm" variant="secondary">
                      Back to home
                    </ButtonLink>
                  )
                }
              />
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h2 className="glass-secondary px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-500">
                    {group.label}
                  </h2>
                  <ul className="divide-y divide-navy-200">
                    {group.rows.map((row) => {
                      const item = row.notification;
                      const unreadItem = !item.readAt;
                      return (
                        <li key={item.id} className={cn("px-5 py-4 transition-colors", unreadItem && "bg-navy-100")}>
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
                                {item.href ? (
                                  <Link
                                    href={`/api/notifications/${item.id}/open`}
                                    className="text-[13px] font-medium text-navy-900 hover:text-brand-700 hover:underline"
                                    aria-label={`Open: ${item.title}${unreadItem ? " (unread)" : ""}`}
                                  >
                                    {item.title}
                                  </Link>
                                ) : (
                                  <p className="text-[13px] font-medium text-navy-900">{item.title}</p>
                                )}
                                <Badge tone={TONES[item.kind] ?? "neutral"}>{label(item.kind)}</Badge>
                                {unreadItem ? (
                                  <>
                                    <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
                                    <span className="sr-only">Unread</span>
                                  </>
                                ) : null}
                              </div>
                              {item.body ? <p className="mt-0.5 text-[12px] leading-5 text-navy-600">{item.body}</p> : null}
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
                                <time className="text-navy-400" dateTime={item.createdAt} title={new Date(item.createdAt).toISOString()}>
                                  {relativeTime(item.createdAt)}
                                </time>
                                {item.href ? (
                                  <Link
                                    href={`/api/notifications/${item.id}/open`}
                                    className="font-medium text-brand-600 hover:underline"
                                  >
                                    Open
                                  </Link>
                                ) : null}
                                {unreadItem ? (
                                  <form action={markReadAction}>
                                    <input type="hidden" name="notificationId" value={item.id} />
                                    <input type="hidden" name="returnTo" value={returnTo} />
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
                  </ul>
                </section>
              ))}
            </div>
          )}
          {notifications.length > 0 ? (
            <Pagination
              page={page}
              pageSize={NOTIFICATIONS_PAGE_SIZE}
              total={total}
              basePath="/notifications"
              params={{ filter: unreadOnly ? "unread" : undefined }}
            />
          ) : null}
        </Card>

        <aside className="space-y-4">
          {invitations.length > 0 ? (
            <Card>
              <div className="border-b border-navy-200 px-4 py-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Invitations</h2>
              </div>
              <ul className="divide-y divide-navy-200">
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
              Turn optional categories on or off. Safety and moderation notices are always delivered. Email delivery is not
              configured, so the email switch has no effect yet.
            </p>
            <ButtonLink href="/settings?tab=notifications" size="sm" variant="secondary" className="mt-2">
              Notification settings
            </ButtonLink>
          </Card>

          <div className="rounded-lg border border-navy-200 bg-surface p-3 text-[10.5px] leading-4 text-navy-500">
            In-app only. Notifications are generated after the action succeeds and are deduplicated per event. Opening one marks
            it read; opening the list does not.
          </div>
        </aside>
      </div>
    </div>
  );
}
