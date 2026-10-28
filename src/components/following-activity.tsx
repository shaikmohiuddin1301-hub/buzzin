import Link from "next/link";
import { ArrowRight, Flag, GraduationCap, Megaphone, PenLine, Sparkles, Users } from "lucide-react";
import { Avatar, Badge, cn } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import type { ActivityItem, ActivityKind } from "@/services/activity";

/**
 * Around Your Network.
 *
 * A horizontal rail of compact, layered cards — deliberately unlike the feed:
 * each card carries a marker for what actually happened, the cover of the project
 * it belongs to and the person behind it. Every card comes from a real record
 * fetched for this viewer; there is no placeholder activity.
 */
const STYLES: Record<ActivityKind, { icon: typeof PenLine; marker: string; ring: string; accent: string }> = {
  post: { icon: PenLine, marker: "New post", ring: "bg-coral-100 text-coral-800", accent: "from-coral-500/15 to-transparent" },
  teaching: {
    icon: GraduationCap,
    marker: "New teaching",
    ring: "bg-coral-100 text-coral-800",
    accent: "from-coral-500/15 to-transparent",
  },
  update: { icon: Megaphone, marker: "Project update", ring: "bg-info-100 text-info-700", accent: "from-info-500/15 to-transparent" },
  milestone: { icon: Flag, marker: "Milestone hit", ring: "bg-emerald-100 text-emerald-600", accent: "from-emerald-500/15 to-transparent" },
  recruiting: {
    icon: Users,
    marker: "Looking for contributors",
    ring: "bg-amber-100 text-amber-700",
    accent: "from-amber-500/15 to-transparent",
  },
};

export function FollowingActivityRail({ items }: { items: ActivityItem[] }) {
  return (
    <section aria-labelledby="following-activity" className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} aria-hidden="true" className="text-brand-600" />
          <h2 id="following-activity" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy-600">
            Around your network
          </h2>
        </div>
        <Link href="/explore?tab=projects&sort=active" className="text-[11.5px] font-medium text-brand-600 hover:underline">
          Find more to follow
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-navy-300 bg-surface p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-brand-500/10 to-coral-400/10 blur-2xl"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-navy-950">Nothing from your network yet</p>
              <p className="mt-0.5 text-[11.5px] leading-5 text-navy-500">
                Follow a few people and projects and their milestones, teaching and updates will show up here.
              </p>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-[12px] font-semibold text-on-brand hover:bg-brand-700"
            >
              Find people and projects <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-1" data-swipe-ignore style={{ scrollbarWidth: "thin" }}>
          {items.map((item) => {
            const style = STYLES[item.kind];
            const Icon = style.icon;
            const heading = item.projectName ?? item.actorName ?? "Your network";
            return (
              <li key={item.id} className="w-[196px] shrink-0">
                <Link
                  href={item.href}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-navy-200/70 bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-float"
                >
                  <span className="relative block h-[74px] w-full overflow-hidden bg-gradient-to-br from-navy-100 to-brand-50">
                    {item.coverImageId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${item.coverImageId}`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span aria-hidden="true" className={cn("absolute inset-0 bg-gradient-to-br", style.accent)} />
                    )}
                    <span
                      className={cn(
                        "absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold",
                        style.ring,
                      )}
                    >
                      <Icon size={10} aria-hidden="true" />
                      {style.marker}
                    </span>
                  </span>

                  <span className="flex flex-1 flex-col p-2.5">
                    <span className="flex items-center gap-1.5">
                      {item.actorName ? (
                        <span className="-mt-6 rounded-full ring-2 ring-surface">
                          <Avatar name={item.actorName} size={28} src={item.actorAvatar ? `/api/files/${item.actorAvatar}` : null} />
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-navy-500">{heading}</span>
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-5 text-navy-950">{item.title}</span>
                    <span className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-navy-400">
                        {item.actorUsername && item.projectName ? `@${item.actorUsername} · ` : ""}
                        {relativeTime(item.timestamp)}
                      </span>
                      {item.kind === "recruiting" ? <Badge tone="warning">Open</Badge> : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
