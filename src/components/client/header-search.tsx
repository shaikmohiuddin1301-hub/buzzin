"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";

const FIELD =
  "h-10 w-full rounded-full border border-navy-200/80 bg-surface/80 pl-9 pr-3 text-[13px] text-navy-900 shadow-card placeholder:text-navy-400 focus:border-blue-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/30";

/**
 * Explore search, living in the Explore header.
 *
 * The query is a URL parameter, so results are server-rendered and shareable, and
 * the current category is preserved when the term changes. `key={q}` refreshes the
 * field after a navigation so the header never shows a stale term.
 */
export function ExploreSearchField() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "foryou";
  const q = params.get("q") ?? "";

  return (
    <form action="/explore" role="search" className="relative min-w-0 flex-1">
      <input type="hidden" name="tab" value={tab} />
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
      />
      <input
        key={q}
        name="q"
        type="search"
        defaultValue={q}
        aria-label="Search people, projects and skills"
        placeholder="Search people, projects, skills…"
        className={FIELD}
      />
    </form>
  );
}

/** Inbox search, in the Chats header. Filters the conversation list server-side. */
export function InboxSearchField() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  return (
    <form action="/chats" role="search" className="relative min-w-0 flex-1">
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
      />
      <input
        key={q}
        name="q"
        type="search"
        defaultValue={q}
        aria-label="Search conversations"
        placeholder="Search messages"
        className={FIELD}
      />
    </form>
  );
}
