import Link from "next/link";
import { notFound } from "next/navigation";
import { BellOff, LogOut, Send, ShieldAlert } from "lucide-react";
import {
  createDropFromMessageAction,
  leaveConversationAction,
  markReadAction,
  muteConversationAction,
  reportMessageAction,
  sendMessageAction,
} from "@/app/actions/chat";
import { AutoRefresh } from "@/components/client/auto-refresh";
import { SubmitButton } from "@/components/client/submit-button";
import { AttachmentLink } from "@/components/media";
import { ReportForm } from "@/components/report-form";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  Field,
  Flash,
  Input,
  Textarea,
  cn,
} from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { getProjectAccess } from "@/lib/authz";
import { conversationDetail } from "@/services/chat";
import { getMedia, signedMediaUrl } from "@/lib/storage";
import { REPORT_REASONS, label } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { conversationId } = await params;
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();

  let detail;
  try {
    detail = conversationDetail(conversationId, user.id);
  } catch {
    notFound();
  }

  const { conversation, member, members, messages, project, area, task } = detail;
  // Turning a message into a task is a project-management action, not a chat action, so it follows
  // the project's edit permission rather than conversation membership.
  const canFileDrop = project ? (getProjectAccess(project.id, user)?.canEdit ?? false) : false;
  const title =
    conversation.kind === "direct"
      ? (members.find((entry) => entry.id !== user.id)?.displayName ?? "Direct message")
      : (conversation.title ?? "Group chat");

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-navy-500">
        <Link href="/chats" className="hover:underline">Chats</Link> / <span className="text-navy-700">{title}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-navy-950">{title}</h1>
          <p className="mt-0.5 text-[12px] text-navy-500">
            {task
              ? "Task chat"
              : area
                ? `Private work area chat · ${area.name}`
                : conversation.kind === "group"
                  ? "Private project group chat"
                  : "Direct message"} · {members.length} participant
            {members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh />
          <form action={markReadAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
              Mark read
            </SubmitButton>
          </form>
          <form action={muteConversationAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="mute" value={member.muted ? "false" : "true"} />
            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
              <BellOff size={12} aria-hidden="true" /> {member.muted ? "Unmute" : "Mute"}
            </SubmitButton>
          </form>
          <form action={leaveConversationAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <SubmitButton size="sm" variant="ghost" confirmMessage="Leave this conversation? You will lose access to its history.">
              <LogOut size={12} aria-hidden="true" /> Leave
            </SubmitButton>
          </form>
        </div>
      </div>

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="flex min-h-[420px] flex-col">
          {task ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-navy-100 bg-brand-50/60 px-4 py-2 text-[11.5px] text-navy-700">
              <Badge tone="brand">Task</Badge>
              <span>
                Chat for{" "}
                <Link href={`/tasks/${task.id}`} className="font-medium text-brand-700 underline">
                  {task.title}
                </Link>
                . Files shared here are attached to the task.
              </span>
            </div>
          ) : null}

          {project ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-navy-100 bg-navy-50/60 px-4 py-2 text-[11.5px] text-navy-600">
              {area ? <Badge tone="brand">{area.name}</Badge> : null}
              <span>
                {area ? "Work area chat for" : "Team chat for"}{" "}
                <Link href={`/projects/${project.id}`} className="font-medium text-brand-700 underline">
                  {project.name}
                </Link>
                . Access is revoked automatically when someone leaves the team.
              </span>
            </div>
          ) : null}

          <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Messages">
            {messages.map((row) => {
              const mine = row.message.senderId === user.id;
              const attachment = row.message.attachmentId ? getMedia(row.message.attachmentId) : null;
              const parent = row.message.parentId
                ? messages.find((candidate) => candidate.message.id === row.message.parentId)
                : null;
              return (
                <div
                  key={row.message.id}
                  id={`m-${row.message.id}`}
                  className={cn(
                    "flex gap-2.5 scroll-mt-20",
                    mine ? "flex-row-reverse" : "",
                    row.message.parentId ? "ml-5 border-l-2 border-navy-100 pl-3" : "",
                  )}
                >
                  <Avatar name={row.senderName} size={28} src={row.senderAvatar ? `/api/files/${row.senderAvatar}` : null} />
                  <div className={cn("max-w-[80%]", mine ? "text-right" : "")}>
                    <p className="text-[10.5px] text-navy-500">
                      {mine ? "You" : row.senderName} · {relativeTime(row.message.createdAt)}
                    </p>
                    {parent ? (
                      <p className={cn("mb-1 max-w-full truncate text-[10.5px] text-navy-500", mine ? "text-right" : "")}>
                        Replying to {parent.senderName}: “{parent.message.body.slice(0, 80)}”
                      </p>
                    ) : null}
                    <div
                      className={cn(
                        "mt-0.5 inline-block rounded-lg px-3 py-2 text-left text-[12.5px] leading-5",
                        mine ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-800",
                      )}
                    >
                      {row.message.deletedAt ? (
                        <em className="opacity-70">This message was removed by moderation.</em>
                      ) : (
                        <span className="whitespace-pre-line">{row.message.body}</span>
                      )}
                    </div>
                    {attachment && !row.message.deletedAt ? (
                      <div className="mt-1">
                        <AttachmentLink
                          fileId={attachment.id}
                          filename={attachment.filename}
                          mimeType={attachment.mimeType}
                          sizeBytes={attachment.sizeBytes}
                          signed={signedMediaUrl(attachment.id)}
                        />
                      </div>
                    ) : null}
                    {!row.message.deletedAt ? (
                      <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-[10px]", mine ? "justify-end" : "")}>
                        {!row.message.parentId ? (
                          <details className="text-left">
                            <summary className="cursor-pointer text-navy-400 hover:text-navy-600">Reply</summary>
                            <form action={sendMessageAction} className="mt-1 w-64 space-y-1 rounded-md border border-navy-200 bg-surface p-2">
                              <input type="hidden" name="conversationId" value={conversationId} />
                              <input type="hidden" name="parentId" value={row.message.id} />
                              <Textarea name="body" rows={2} required maxLength={4000} aria-label="Reply" placeholder="Write a reply…" />
                              <SubmitButton size="sm" variant="secondary" className="w-full" pendingLabel="…">
                                Send reply
                              </SubmitButton>
                            </form>
                          </details>
                        ) : null}
                        {canFileDrop ? (
                          row.message.taskId ? (
                            <Link href={`/tasks/${row.message.taskId}`} className="text-brand-700 underline">
                              Filed as a task
                            </Link>
                          ) : (
                            <form action={createDropFromMessageAction}>
                              <input type="hidden" name="conversationId" value={conversationId} />
                              <input type="hidden" name="messageId" value={row.message.id} />
                              <SubmitButton size="sm" variant="ghost" pendingLabel="Filing…" className="h-6 px-1.5 text-[10px]">
                                Create task
                              </SubmitButton>
                            </form>
                          )
                        ) : null}
                      </div>
                    ) : null}
                    {!mine && !row.message.deletedAt ? (
                      <details className="mt-0.5 text-left">
                        <summary className="cursor-pointer text-[10px] text-navy-400 hover:text-navy-600">Report message</summary>
                        <form action={reportMessageAction} className="mt-1 space-y-1 rounded-md border border-navy-200 bg-surface p-2">
                          <input type="hidden" name="conversationId" value={conversationId} />
                          <input type="hidden" name="messageId" value={row.message.id} />
                          <select name="reasonCode" required className="field-input text-[11px]" aria-label="Reason">
                            <option value="">Reason…</option>
                            {REPORT_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {label(reason)}
                              </option>
                            ))}
                          </select>
                          <Input name="details" placeholder="What happened?" className="h-7 text-[11px]" required />
                          <SubmitButton size="sm" variant="danger" className="w-full" pendingLabel="…">
                            Report
                          </SubmitButton>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 ? <p className="py-8 text-center text-[12.5px] text-navy-500">No messages yet. Say hello.</p> : null}
          </div>

          <form action={sendMessageAction} encType="multipart/form-data" className="border-t border-navy-100 p-3">
            <input type="hidden" name="conversationId" value={conversationId} />
            <label htmlFor="message-body" className="sr-only">
              Message
            </label>
            <Textarea
              id="message-body"
              name="body"
              rows={2}
              maxLength={4000}
              placeholder="Write a message…"
              className="min-h-[56px] resize-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor="attachment" className="text-[11px] text-navy-500">
                Attach
              </label>
              <Input id="attachment" name="attachment" type="file" className="h-8 w-56 text-[11px]" />
              <p className="text-[10px] text-navy-400">Files are private to this conversation.</p>
              <SubmitButton size="sm" className="ml-auto" pendingLabel="Sending…">
                <Send size={12} aria-hidden="true" /> Send
              </SubmitButton>
            </div>
          </form>
        </Card>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Participants</h2>
            <ul className="mt-2 space-y-2">
              {members.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2">
                  <Avatar name={entry.displayName} size={24} src={entry.avatarFileId ? `/api/files/${entry.avatarFileId}` : null} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${entry.username}`} className="block truncate text-[12px] font-medium text-navy-900 hover:underline">
                      {entry.displayName}
                    </Link>
                    <p className="text-[10px] text-navy-500">
                      {entry.role === "admin" ? "Conversation admin" : "Member"}
                      {entry.lastReadAt ? ` · read ${relativeTime(entry.lastReadAt)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-navy-500">
              <ShieldAlert size={12} aria-hidden="true" /> Safety
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-navy-600">
              Reports include the conversation context for moderators. Blocking a person stops new messages in both directions.
            </p>
            {members
              .filter((entry) => entry.id !== user.id)
              .slice(0, 2)
              .map((entry) => (
                <div key={entry.id} className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-navy-600">{entry.displayName}</span>
                  <ReportForm targetType="user" targetId={entry.id} returnTo={`/chats/${conversationId}`} compact />
                </div>
              ))}
          </Card>

          <Alert tone="info" title="Messages are not end-to-end encrypted">
            Messages are stored on the server and readable by authorised moderation workflows when a report is made. Do not
            share secrets here.
          </Alert>

          <p className="text-[10.5px] text-navy-400">Conversation created {formatDate(conversation.createdAt)}</p>

          {project ? (
            <ButtonLink href={`/projects/${project.id}`} variant="secondary" size="sm" className="w-full">
              Open project
            </ButtonLink>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
