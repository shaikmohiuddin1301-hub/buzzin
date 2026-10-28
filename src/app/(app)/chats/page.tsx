import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Inbox, Plus, Search, Users, X } from "lucide-react";
import { getDb } from "@/db/client";
import { projectMembers, taskAssignments } from "@/db/schema";
import { respondToMessageRequestAction, startDirectMessageAction } from "@/app/actions/chat";
import { ChatStream } from "@/components/client/chat-stream";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Flash, Input } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime } from "@/lib/format";
import { ensureProjectGroup, ensureTaskChat, listConversations, listMessageRequests } from "@/services/chat";
import { searchPeople } from "@/services/users";
import type { ConversationSummary } from "@/services/chat";

export const metadata = { title: "Chats" };

/** A direct conversation's display counterpart is the participant who isn't me. */
function otherParticipant(conversation: ConversationSummary, userId: string) {
  return conversation.participants.find((participant) => participant.id !== userId) ?? null;
}

function ConversationRow({
  conversation,
  userId,
}: {
  conversation: ConversationSummary;
  userId: string;
}) {
  const other = otherParticipant(conversation, userId);
  const unread = conversation.unread > 0;

  return (
    <li>
      <Link
        href={`/chats/${conversation.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-navy-50/70 active:bg-navy-100/60"
      >
        {conversation.kind === "direct" && other ? (
          <Avatar
            name={other.displayName}
            size={46}
            src={other.avatarFileId ? `/api/files/${other.avatarFileId}` : null}
          />
        ) : (
          <span
            aria-hidden="true"
            className="avatar-surface flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
          >
            {conversation.taskId ? "✓" : "#"}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[13.5px] font-semibold text-navy-950">{conversation.title}</p>
            {conversation.taskId ? <Badge tone="brand">task</Badge> : null}
            {conversation.kind === "group" && !conversation.taskId ? <Badge tone="neutral">project</Badge> : null}
            <time
              className="ml-auto shrink-0 text-[10.5px] text-navy-400"
              dateTime={conversation.lastAt ?? undefined}
            >
              {conversation.lastAt ? relativeTime(conversation.lastAt) : ""}
            </time>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p
              className={
                unread
                  ? "truncate text-[12px] font-medium text-navy-800"
                  : "truncate text-[12px] text-navy-500"
              }
            >
              {conversation.lastMessage ?? "No messages yet"}
            </p>
            {unread ? (
              <span className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold leading-none text-on-coral">
                {conversation.unread > 9 ? "9+" : conversation.unread}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
            {conversation.muted ? (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-navy-400">muted</span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { error, notice } = readFlash(query);
  const user = await requireUser();
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const searching = q.length > 0;
  const composing = query.compose === "1";
  const peopleQuery = typeof query.pq === "string" ? query.pq : "";

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

  const requests = listMessageRequests(user.id);
  const showingRequests = query.requests === "1";

  const allConversations = listConversations(user.id);
  const needle = q.toLowerCase();
  const conversations = searching
    ? allConversations.filter((conversation) =>
        `${conversation.title} ${conversation.participants.map((person) => person.displayName).join(" ")} ${conversation.lastMessage ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : allConversations;

  const people = composing ? searchPeople(peopleQuery, 20).filter((person) => person.id !== user.id) : [];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ChatStream />
      <Flash error={error} notice={notice} />

      {showingRequests ? (
        <Card className="mb-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-navy-200 px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Message requests</h2>
              <p className="mt-0.5 text-[11.5px] leading-5 text-navy-500">
                People outside your projects wait here. Accepting moves them into your inbox; dismissing hides the
                conversation until they write again.
              </p>
            </div>
            <Link
              href="/chats"
              aria-label="Close message requests"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100 hover:text-navy-900"
            >
              <X size={16} aria-hidden="true" />
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-navy-500">No requests right now.</p>
          ) : (
            <ul className="divide-y divide-navy-200/80">
              {requests.map((request) => (
                <li key={request.conversationId} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={request.from.displayName}
                      size={40}
                      src={request.from.avatarFileId ? `/api/files/${request.from.avatarFileId}` : null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-navy-950">{request.from.displayName}</p>
                      <p className="truncate text-[11.5px] text-navy-500">
                        {request.preview ?? "No message yet"}
                      </p>
                    </div>
                    <time className="shrink-0 text-[10.5px] text-navy-400" dateTime={request.lastAt ?? undefined}>
                      {request.lastAt ? relativeTime(request.lastAt) : ""}
                    </time>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
                    <form action={respondToMessageRequestAction}>
                      <input type="hidden" name="conversationId" value={request.conversationId} />
                      <input type="hidden" name="accept" value="on" />
                      <SubmitButton size="sm" pendingLabel="Accepting…">
                        Accept
                      </SubmitButton>
                    </form>
                    <form action={respondToMessageRequestAction}>
                      <input type="hidden" name="conversationId" value={request.conversationId} />
                      <SubmitButton size="sm" variant="secondary" pendingLabel="Dismissing…">
                        Dismiss
                      </SubmitButton>
                    </form>
                    <ButtonLink href={`/chats/${request.conversationId}`} variant="ghost" size="sm">
                      Preview
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : requests.length > 0 ? (
        <Link
          href="/chats?requests=1"
          className="card-surface mb-3 flex items-center gap-3 px-4 py-3 transition hover:bg-navy-50/60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-100 text-coral-700" aria-hidden="true">
            <Inbox size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-navy-950">Message requests</span>
            <span className="block text-[11.5px] text-navy-500">
              {requests.length} {requests.length === 1 ? "person is" : "people are"} waiting to be accepted
            </span>
          </span>
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-semibold text-on-coral">
            {requests.length}
          </span>
        </Link>
      ) : null}

      {composing ? (
        <Card className="mb-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-navy-200 px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">New message</h2>
              <p className="mt-0.5 text-[11.5px] leading-5 text-navy-500">
                People can limit who may message them; if their setting excludes you, the request is refused.
              </p>
            </div>
            <Link
              href="/chats"
              aria-label="Close new message"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-100 hover:text-navy-900"
            >
              <X size={16} aria-hidden="true" />
            </Link>
          </div>

          <form action="/chats" role="search" className="flex gap-2 border-b border-navy-200 p-3">
            <input type="hidden" name="compose" value="1" />
            <Input
              name="pq"
              type="search"
              defaultValue={peopleQuery}
              aria-label="Search people to message"
              placeholder="Search people by name or username"
              className="h-9 text-[13px]"
            />
            <button
              type="submit"
              className="h-9 shrink-0 rounded-xl border border-navy-200 bg-surface px-3 text-[12.5px] font-medium text-navy-700 transition hover:bg-navy-50"
            >
              Search
            </button>
          </form>

          {people.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-navy-500">
              No people match “{peopleQuery}”. Try another name.
            </p>
          ) : (
            <ul className="max-h-[42vh] divide-y divide-navy-200 overflow-y-auto">
              {people.map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar
                    name={person.displayName}
                    size={36}
                    src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-navy-950">{person.displayName}</p>
                    <p className="truncate text-[11px] text-navy-500">@{person.username}</p>
                  </div>
                  <form action={startDirectMessageAction}>
                    <input type="hidden" name="userId" value={person.id} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Opening…">
                      Message
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <section aria-labelledby="inbox-heading" className="card-surface overflow-hidden">
        <h2 id="inbox-heading" className="sr-only">
          Conversations
        </h2>

        {conversations.length === 0 ? (
          <div className="p-6">
            {searching ? (
              <EmptyState
                icon={<Search size={20} aria-hidden="true" />}
                title="No conversations match that search"
                description={`Nothing here matches “${q}”.`}
                action={
                  <ButtonLink href="/chats" variant="secondary" size="sm">
                    Clear search
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState
                icon={<Users size={22} aria-hidden="true" />}
                title="No conversations yet"
                description="Start a direct message, or open a project's team chat once you are a member."
                action={
                  <ButtonLink href="/chats?compose=1" size="sm">
                    <Plus size={13} aria-hidden="true" /> New message
                  </ButtonLink>
                }
              />
            )}
          </div>
        ) : (
          <ul className="divide-y divide-navy-200/80">
            {conversations.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} userId={user.id} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 px-1 text-[10.5px] leading-4 text-navy-400">
        Project and task chats include only the people on that work; leaving a project removes access to its chat.
      </p>
    </div>
  );
}
