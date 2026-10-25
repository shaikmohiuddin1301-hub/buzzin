import { Flag } from "lucide-react";
import { reportAction } from "@/app/actions/social";
import { SubmitButton } from "@/components/client/submit-button";
import { Select, Textarea } from "@/components/ui";
import { REPORT_REASONS, label } from "@/lib/types";

/**
 * Report control. Uses a native <details> disclosure so it works without JS and
 * every report requires both a reason and a written explanation.
 */
export function ReportForm({
  targetType,
  targetId,
  returnTo,
  compact = false,
}: {
  targetType: "user" | "project" | "post" | "comment" | "resource" | "message" | "story";
  targetId: string;
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <details className="group relative">
      <summary
        className={
          compact
            ? "inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-navy-400 hover:bg-navy-100 hover:text-navy-700 [&::-webkit-details-marker]:hidden"
            : "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-navy-500 hover:bg-navy-100 [&::-webkit-details-marker]:hidden"
        }
      >
        <Flag size={13} aria-hidden="true" />
        Report
      </summary>
      <form
        action={reportAction}
        className="absolute right-0 z-20 mt-1 w-72 space-y-2 rounded-lg border border-navy-200 bg-white p-3 shadow-raised"
      >
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-[12px] font-semibold text-navy-900">Report this {targetType}</p>
        <label htmlFor={`reason-${targetType}-${targetId}`} className="sr-only">
          Reason
        </label>
        <Select id={`reason-${targetType}-${targetId}`} name="reasonCode" required className="text-[12px]">
          <option value="">Choose a reason…</option>
          {REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {label(reason)}
            </option>
          ))}
        </Select>
        <label htmlFor={`details-${targetType}-${targetId}`} className="sr-only">
          What happened?
        </label>
        <Textarea
          id={`details-${targetType}-${targetId}`}
          name="details"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          placeholder="What is wrong? Include context moderators need."
          className="text-[12px]"
        />
        <SubmitButton size="sm" variant="danger" className="w-full" pendingLabel="Sending…">
          Submit report
        </SubmitButton>
        <p className="text-[10px] leading-4 text-navy-400">
          Reports go to a moderation queue. Abuse of reporting is itself a moderation matter.
        </p>
      </form>
    </details>
  );
}
