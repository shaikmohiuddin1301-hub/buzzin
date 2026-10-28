import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projectMembers, taskAssignments } from "@/db/schema";
import { startDirectMessageAction } from "@/app/actions/chat";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime, truncate } from "@/lib/format";
import { ensureProjectGroup, ensureTaskChat, listConversations } from "@/services/chat";
import { searchPeople } from "@/services/users";
import type { ConversationSummary } from "@/services/chat";

export const metadata = { title: "Chats" };

/** A direct conversation's display counterpart is the participant who isn't me. */
function otherParticipant(conversation: ConversationSummary, userId: string) {
  return conversation.participants.find((participant) => participant.id !== userId) ?? null;
}

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";

  // Conversations are derived from the work a person is part of, not invited by
  // hand. Syncing here means a project chat or task chat that already covers their
  // membership always appears in the list, whichever route added them to the team.
  const db = getDb();
  for (const row of db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, user.id), eq(projectMembers.status, "active")))
    .all()) {
    ensureProjectGroup(row.projectId, user.id);
  }
  for (const row of db
    .select({ taskId: taskAssignments.taskId })
    .from(taskAssignments)
    .where(and(eq(taskAssignments.userId, user.id), eq(taskAssignments.status, "active")))
    .all()) {
    ensureTaskChat(row.taskId, user);
  }

  const allConversations = listConversations(user.id);
  const conversations = q
    ? allConversations.filter((conversation) =>
        `${conversation.title} ${conversation.participants.map((person) => person.displayName).join(" ")} ${conversation.lastMessage ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : allConversations;
  const taskChats = allConversations.filter((conversation) => conversation.taskId).length;
  const people = searchPeople("", 8).filter((person) => person.id !== user.id);

  return (
    <div>
      <PageHeader
        title="Chats"
        description="Task chats, project chats and direct messages. Every task has its own conversation, waiting for you."
        meta={
          <>
            <span>{allConversations.length} conversations</span>
            {taskChats > 0 ? <span>{taskChats} task {taskChats === 1 ? "chat" : "chats"}</span> : null}
          </>
        }
        actions={
          <ButtonLink href="/notifications" variant="secondary" size="sm">
            Notifications
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="border-b border-navy-200 p-3">
            <form action="/chats" role="search" className="flex gap-2">
              <label htmlFor="chat-search" className="sr-only">
                Search conversations
              </label>
              <Input
                id="chat-search"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search people, projects or a message…"
                className="h-9 border-transparent bg-navy-50/70 text-[13px]"
              />
              <button
                type="submit"
                className="h-9 shrink-0 rounded-xl border border-navy-200 bg-surface px-3 text-[12.5px] font-medium text-navy-700 transition hover:bg-navy-50"
              >
                Search
              </button>
            </form>
          </div>
          <ul className="divide-y divide-navy-200">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link href={`/chats/${conversation.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-navy-50/60">
                  {conversation.kind === "direct" && otherParticipant(conversation, user.id) ? (
                    <Avatar
                      name={otherParticipant(conversation, user.id)!.displayName}
                      size={34}
                      src={otherParticipant(conversation, user.id)!.avatarFileId ? `/api/files/${otherParticipant(conversation, user.id)!.avatarFileId}` : null}
                    />
                  ) : (
                    <span className="avatar-surface flex h-[34px] w-[34px] items-center justify-center rounded-full text-[11px] font-semibold text-white">
                      {conversation.taskId ? "✓" : "#"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-navy-900">{conversation.title}</p>
                      {conversation.taskId ? <Badge tone="brand">task</Badge> : null}
                      {conversation.kind === "group" && !conversation.taskId ? <Badge tone="neutral">project</Badge> : null}
                      {conversation.muted ? <Badge tone="neutral">muted</Badge> : null}
                      {conversation.unread > 0 ? <Badge tone="coral">{conversation.unread} new</Badge> : null}
                    </div>
                    <p className="truncate text-[11.5px] text-navy-600">{truncate(conversation.lastMessage ?? "No messages yet", 80)}</p>
                  </div>
                  <time className="shrink-0 text-[10.5px] text-navy-400" dateTime={conversation.lastAt ?? undefined}>
                    {conversation.lastAt ? relativeTime(conversation.lastAt) : ""}
                  </time>
                </Link>
              </li>
            ))}
            {conversations.length === 0 ? (
              <li className="p-5">
                <EmptyState
                  title="No conversations yet"
                  description="Start a direct message, or open a project's team chat once you are a member."
                />
              </li>
            ) : null}
          </ul>
        </Card>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Start a direct message</h2>
            <p className="mt-1 text-[11px] leading-5 text-navy-600">
              People can limit who may message them. If their setting excludes you, the request is refused rather than silently
              delivered.
            </p>
            <form action={startDirectMessageAction} className="mt-2 space-y-2">
              <Field label="Person" htmlFor="userId">
                <Select id="userId" name="userId" required className="text-[12px]">
                  <option value="">Choose someone…</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName} (@{person.username})
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton size="sm" className="w-full" pendingLabel="Opening…">
                Open conversation
              </SubmitButton>
            </form>
          </Card>

          <details className="card-surface p-4">
            <summary className="cursor-pointer list-none text-[12px] font-semibold uppercase tracking-wide text-navy-500 [&::-webkit-details-marker]:hidden">
              Who can see a chat
            </summary>
            <ul className="mt-2 space-y-1 text-[10.5px] leading-4 text-navy-600">
              <li>Project group chats are limited to active members.</li>
              <li>Task chats include the assignees plus project reviewers.</li>
              <li>Removing someone from a project revokes their chat access immediately.</li>
              <li>Attachments are readable only by conversation members.</li>
            </ul>
          </details>
        </aside>
      </div>
    </div>
  );
}
