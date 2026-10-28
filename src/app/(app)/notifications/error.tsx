"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink, Card, PageHeader } from "@/components/ui";

/**
 * Route-level error state for Notifications, with a real retry.
 *
 * `reset` re-renders the segment, so a transient database or network failure can
 * be recovered from without leaving the app. The message never echoes the raw
 * error: it is written for the person reading the page.
 */
export default function NotificationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Notifications are stored on the server, so nothing is lost while this is unavailable."
      />
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-navy-950">We could not load your notifications</h2>
            <p className="mt-1 text-[12.5px] leading-6 text-navy-600">
              This is usually temporary. Try again, and if it keeps happening the status is visible on your Home page, which
              still works.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => reset()}>
                <RotateCcw size={14} aria-hidden="true" /> Try again
              </Button>
              <ButtonLink href="/home" variant="secondary">
                Back to home
              </ButtonLink>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
