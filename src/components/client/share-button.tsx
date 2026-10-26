"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui";

type Status = "idle" | "copied" | "error";

/**
 * Share a real, canonical path. Uses the native share sheet when the device
 * offers one and copies the link otherwise, so the control is never decorative.
 */
export function ShareButton({
  path,
  title,
  className,
}: {
  path: string;
  title?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: title ?? document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (error) {
      // Closing the native share sheet is not a failure.
      if ((error as { name?: string }).name === "AbortError") return;
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2400);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share this post"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-navy-500 transition hover:bg-navy-100 hover:text-navy-800",
        status === "error" && "text-red-600",
        className,
      )}
    >
      {status === "copied" ? <Check size={14} aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}
      <span aria-live="polite">{status === "copied" ? "Link copied" : status === "error" ? "Copy failed" : "Share"}</span>
    </button>
  );
}
