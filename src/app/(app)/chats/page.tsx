import Link from "next/link";
import { startDirectMessageAction } from "@/app/actions/chat";
import { SubmitButton } from "@/components/client/submit-button";
import { Avatar, Badge, ButtonLink, Card, EmptyState, Field, Flash, PageHeader, Select } from "@/components/ui";
import { readFlash } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { relativeTime, truncate } from "@/lib/format";
import { listConversations } from "@/services/chat";
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
  const conversations = listConversations(user.id);
  const people = searchPeople("", 8).filter((person) => person.id !== user.id);

  return (
    <div>
      <PageHeader
        title="Chats"
        description="Direct messages and private project group chats. This is separate from public project discussion."
        actions={
          <ButtonLink href="/notifications" variant="secondary" size="sm">
            Notifications
          </ButtonLink>
        }
      />

      <Flash error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="border-b border-navy-100 px-5 py-4">
            <h2 className="text-[14px] font-semibold text-navy-950">Conversations</h2>
            <p className="text-[12px] text-navy-500">
              Messages refresh by polling while the tab is visible. No realtime transport is configured.
            </p>
          </div>
          <ul className="divide-y divide-navy-100">
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
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white">
                      #
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-navy-900">{conversation.title}</p>
                      {conversation.kind === "group" ? <Badge tone="neutral">project</Badge> : null}
                      {conversation.muted ? <Badge tone="neutral">muted</Badge> : null}
                      {conversation.unread > 0 ? <Badge tone="brand">{conversation.unread} new</Badge> : null}
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

          <Card className="p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-navy-500">Access rules</h2>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-navy-600">
              <li>Project group chats are limited to active members.</li>
              <li>Removing someone from a project revokes their chat access immediately.</li>
              <li>Blocking someone prevents new messages between you.</li>
              <li>Attachments are readable only by conversation members.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
