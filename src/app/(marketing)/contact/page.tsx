import Link from "next/link";
import { SectionHeading } from "@/components/marketing";
import { Alert, Card } from "@/components/ui";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <SectionHeading
        eyebrow="Contact"
        title="How to reach the team"
        description="This is a demonstration build without an inbound contact pipeline configured, so the honest answer is: use these routes rather than a form that silently discards your message."
      />

      <div className="mt-8 space-y-4">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">General enquiries</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
            Email <span className="font-mono text-[12px]">hello@buildtogether.example</span>. This address is a placeholder
            for the demonstration; it is not monitored.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">Safety, abuse and legal requests</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
            Use the in-product report control on the content or account. Reports go to a moderation queue with a required
            reason code and a written explanation, and every decision is written to an audit log.
          </p>
          <p className="mt-2 text-[12px] text-navy-500">
            Escalation address (placeholder): <span className="font-mono">safety@buildtogether.example</span>
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-navy-950">Privacy and data rights</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-navy-600">
            Data export and account deletion are self-service in{" "}
            <Link href="/settings?tab=account" className="underline">
              account settings
            </Link>
            . For access, correction, restriction or objection requests that the product does not cover, contact the privacy
            address listed in the{" "}
            <Link href="/privacy" className="underline">
              privacy notice
            </Link>
            .
          </p>
        </Card>

        <Alert tone="warning" title="No contact form by design">
          Adding a form that writes nowhere would violate the project's own rule that every visible control must work. When an
          email provider is configured, this page is the intended place for an inbound form.
        </Alert>
      </div>
    </div>
  );
}
