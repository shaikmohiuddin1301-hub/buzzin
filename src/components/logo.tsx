import Link from "next/link";
import { cn } from "@/components/ui";

export function Logo({ href = "/", light = false, compact = false }: { href?: string; light?: boolean; compact?: boolean }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-md", light ? "text-white" : "text-navy-950")}
      aria-label="BuildTogether home"
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white",
          light ? "bg-white/15 ring-1 ring-white/25" : "ink-surface",
        )}
        aria-hidden="true"
      >
        {/* Two blocks locking together */}
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="8" height="8" rx="1.5" fill="#9575ff" />
          <rect x="13" y="12" width="8" height="8" rx="1.5" fill="#ffffff" fillOpacity="0.9" />
          <rect x="13" y="4" width="8" height="6" rx="1.5" fill="#ffffff" fillOpacity="0.35" />
          <rect x="3" y="14" width="8" height="6" rx="1.5" fill="#ffffff" fillOpacity="0.35" />
        </svg>
      </span>
      {!compact ? (
        <span className="text-[17px] font-semibold tracking-tight">
          Build<span className={light ? "text-brand-300" : "text-brand-600"}>Together</span>
        </span>
      ) : null}
    </Link>
  );
}
